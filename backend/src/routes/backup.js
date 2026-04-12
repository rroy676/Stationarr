const router  = require('express').Router();
const db      = require('../db');
const require_auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Auth middleware that also accepts token via query param (for direct download links)
function authOrQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ── GET /api/backup — export all user data as JSON ───────────────
router.get('/', authOrQuery, (req, res) => {
  const uid = req.user.id;

  const playlists = db.prepare('SELECT * FROM playlists WHERE user_id = ?').all(uid);

  const channels = {};
  playlists.forEach(pl => {
    channels[pl.id] = db.prepare(
      'SELECT * FROM channels WHERE playlist_id = ? ORDER BY ord ASC'
    ).all(pl.id);
  });

  const epg_sources = db.prepare(
    'SELECT * FROM epg_sources WHERE user_id = ?'
  ).all(uid);

  let scraper_channels = [];
  try {
    scraper_channels = db.prepare('SELECT * FROM scraper_channels WHERE user_id = ?').all(uid);
  } catch {}

  const backup = {
    version:   2,
    exported:  new Date().toISOString(),
    user:      req.user.username,
    playlists,
    channels,
    epg_sources: epg_sources.map(s => ({
      ...s,
      // Don't include cache_path (server-specific) or large cache data
      cache_path: null,
    })),
    scraper_channels,
  };

  const filename = `stationarr-backup-${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(backup);
});

// ── POST /api/backup/restore — import backup JSON ─────────────────
router.post('/restore', require_auth, (req, res) => {
  const uid  = req.user.id;
  const data = req.body;

  if (!data || !data.playlists || !data.channels) {
    return res.status(400).json({ error: 'Invalid backup file — missing playlists or channels' });
  }

  const results = {
    playlists:        0,
    channels:         0,
    epg_sources:      0,
    scraper_channels: 0,
    skipped:          [],
  };

  try {
    db.transaction(() => {

      // ── Restore playlists ──────────────────────────────────────
      const insertPl = db.prepare(`
        INSERT INTO playlists
          (user_id, name, slug, source_url, source_type, source_server,
           source_username, source_password, xtream_user, xtream_pass,
           auto_refresh, refresh_interval)
        VALUES
          (@user_id, @name, @slug, @source_url, @source_type, @source_server,
           @source_username, @source_password, @xtream_user, @xtream_pass,
           @auto_refresh, @refresh_interval)
      `);

      const plIdMap = {}; // old id -> new id

      for (const pl of data.playlists) {
        // Make slug unique if it already exists
        let slug = pl.slug;
        const existing = db.prepare('SELECT id FROM playlists WHERE slug = ?').get(slug);
        if (existing) slug = slug + '-' + Date.now();

        const result = insertPl.run({
          user_id:          uid,
          name:             pl.name,
          slug,
          source_url:       pl.source_url       || null,
          source_type:      pl.source_type       || 'url',
          source_server:    pl.source_server     || null,
          source_username:  pl.source_username   || null,
          source_password:  pl.source_password   || null,
          xtream_user:      pl.xtream_user        || null,
          xtream_pass:      pl.xtream_pass        || null,
          auto_refresh:     pl.auto_refresh       || 0,
          refresh_interval: pl.refresh_interval   || 24,
        });

        plIdMap[pl.id] = result.lastInsertRowid;
        results.playlists++;
      }

      // ── Restore channels ───────────────────────────────────────
      const insertCh = db.prepare(`
        INSERT INTO channels
          (playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo,
           grp, epg_id, backup_epg_id, enabled, ord, timeshift)
        VALUES
          (@playlist_id, @name, @url, @duration, @tvg_id, @tvg_name, @tvg_logo,
           @grp, @epg_id, @backup_epg_id, @enabled, @ord, @timeshift)
      `);

      for (const [oldPlId, chs] of Object.entries(data.channels)) {
        const newPlId = plIdMap[oldPlId];
        if (!newPlId) continue;
        for (const ch of chs) {
          insertCh.run({
            playlist_id:   newPlId,
            name:          ch.name          || '',
            url:           ch.url           || '',
            duration:      ch.duration      || '-1',
            tvg_id:        ch.tvg_id        || '',
            tvg_name:      ch.tvg_name      || ch.name || '',
            tvg_logo:      ch.tvg_logo      || '',
            grp:           ch.grp           || 'Ungrouped',
            epg_id:        ch.epg_id        || '',
            backup_epg_id: ch.backup_epg_id || '',
            enabled:       ch.enabled !== undefined ? ch.enabled : 1,
            ord:           ch.ord           || 0,
            timeshift:     ch.timeshift     || 0,
          });
          results.channels++;
        }
      }

      // ── Restore EPG sources ────────────────────────────────────
      if (data.epg_sources?.length) {
        const insertEpg = db.prepare(`
          INSERT INTO epg_sources
            (user_id, name, url, auto_refresh, refresh_interval, priority)
          VALUES
            (@user_id, @name, @url, @auto_refresh, @refresh_interval, @priority)
        `);

        for (const src of data.epg_sources) {
          // Skip if source with same name already exists
          const exists = db.prepare(
            'SELECT id FROM epg_sources WHERE user_id = ? AND name = ?'
          ).get(uid, src.name);

          if (exists) {
            results.skipped.push(`EPG source "${src.name}" already exists`);
            continue;
          }

          insertEpg.run({
            user_id:          uid,
            name:             src.name,
            url:              src.url              || null,
            auto_refresh:     src.auto_refresh     || 0,
            refresh_interval: src.refresh_interval || 24,
            priority:         src.priority         || 0,
          });
          results.epg_sources++;
        }
      }

      // ── Restore scraper channels ───────────────────────────────
      if (data.scraper_channels?.length) {
        const hasScraper = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scraper_channels'"
        ).get();

        if (hasScraper) {
          const insertSc = db.prepare(`
            INSERT OR IGNORE INTO scraper_channels
              (user_id, xmltv_id, site, site_id, name, lang, enabled)
            VALUES
              (@user_id, @xmltv_id, @site, @site_id, @name, @lang, @enabled)
          `);

          for (const sc of data.scraper_channels) {
            insertSc.run({
              user_id:  uid,
              xmltv_id: sc.xmltv_id,
              site:     sc.site,
              site_id:  sc.site_id,
              name:     sc.name,
              lang:     sc.lang    || 'en',
              enabled:  sc.enabled !== undefined ? sc.enabled : 1,
            });
            results.scraper_channels++;
          }
        }
      }

    })();

    res.json({
      ok: true,
      ...results,
      message: `Restored ${results.playlists} playlist(s) with ${results.channels} channels, ${results.epg_sources} EPG source(s), ${results.scraper_channels} scraper channel(s).`,
    });

  } catch (e) {
    console.error('[backup] Restore failed:', e);
    res.status(500).json({ error: 'Restore failed: ' + e.message });
  }
});

module.exports = router;
