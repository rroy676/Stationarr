const router = require('express').Router();
const db     = require('../db');
const requireAuth = require('../middleware/auth');
const { nanoid }  = require('nanoid');
const { parseM3U } = require('../utils/m3u');
const { buildHttpStatusError, getPlaylistFetchErrorMessage } = require('../utils/http-errors');
const fetch   = require('node-fetch');
const logger = require('../logger');

router.use(requireAuth);

function genXtreamCreds() {
  return { xtream_user: nanoid(12), xtream_pass: nanoid(16) };
}

function buildSourceUrl(body) {
  // Build M3U URL from provider credentials if source_type is 'xtream'
  if (body.source_type === 'xtream' && body.source_server) {
    const base = body.source_server.replace(/\/$/, '');
    return `${base}/get.php?username=${encodeURIComponent(body.source_username || '')}&password=${encodeURIComponent(body.source_password || '')}&type=m3u_plus&output=ts`;
  }
  return body.source_url || null;
}

// GET /api/playlists
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, COUNT(c.id) as channel_count
    FROM playlists p
    LEFT JOIN channels c ON c.playlist_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// POST /api/playlists
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const slug = nanoid(10);
  const { xtream_user, xtream_pass } = genXtreamCreds();
  const result = db.prepare(`
    INSERT INTO playlists (user_id, name, slug, source_url, source_type, source_server, source_username, source_password, xtream_user, xtream_pass)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id, name.trim(), slug,
    buildSourceUrl(req.body),
    req.body.source_type || 'url',
    req.body.source_server || null,
    req.body.source_username || null,
    req.body.source_password || null,
    xtream_user, xtream_pass
  );
  res.status(201).json(db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid));
});

// GET /api/playlists/:id
router.get('/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  res.json(pl);
});

// PUT /api/playlists/:id — full edit including source credentials + auto-refresh
router.put('/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  const name             = req.body.name             ?? pl.name;
  const source_type      = req.body.source_type      ?? pl.source_type      ?? 'url';
  const source_server    = req.body.source_server    ?? pl.source_server;
  const source_username  = req.body.source_username  ?? pl.source_username;
  const source_password  = req.body.source_password  ?? pl.source_password;
  const auto_refresh     = req.body.auto_refresh     !== undefined ? (req.body.auto_refresh ? 1 : 0) : pl.auto_refresh;
  const refresh_interval = req.body.refresh_interval ?? pl.refresh_interval ?? 24;

  // Rebuild source_url from credentials if needed
  const source_url = buildSourceUrl({ source_type, source_server, source_username, source_password })
    || req.body.source_url
    || pl.source_url;

  db.prepare(`
    UPDATE playlists SET
      name=?, source_url=?, source_type=?, source_server=?, source_username=?, source_password=?,
      auto_refresh=?, refresh_interval=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, source_url, source_type, source_server, source_username, source_password, auto_refresh, refresh_interval, pl.id);

  res.json(db.prepare('SELECT * FROM playlists WHERE id = ?').get(pl.id));
});

// POST /api/playlists/:id/regen-xtream
router.post('/:id/regen-xtream', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  const { xtream_user, xtream_pass } = genXtreamCreds();
  db.prepare("UPDATE playlists SET xtream_user=?, xtream_pass=?, updated_at=datetime('now') WHERE id=?")
    .run(xtream_user, xtream_pass, pl.id);
  res.json(db.prepare('SELECT * FROM playlists WHERE id = ?').get(pl.id));
});

// DELETE /api/playlists/:id
router.delete('/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM playlists WHERE id = ?').run(pl.id);
  res.json({ ok: true });
});

// POST /api/playlists/:id/import
router.post('/:id/import', async (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  logger.info('playlist','Playlist import started',{ playlist_id: pl.id, has_content: !!req.body.content, source_type: req.body.source_type || pl.source_type || 'url' });
  let m3uText = req.body.content;

  if (!m3uText) {
    // Build URL from request body (may include provider credentials)
    let url = req.body.url;
    if (req.body.source_type === 'xtream' && req.body.source_server) {
      const base = req.body.source_server.replace(/\/$/, '');
      url = `${base}/get.php?username=${encodeURIComponent(req.body.source_username || '')}&password=${encodeURIComponent(req.body.source_password || '')}&type=m3u_plus&output=ts`;
    }
    if (!url) return res.status(400).json({ error: 'content, url, or provider credentials required' });

    try {
      const r = await fetch(url, { timeout: 30000, follow: 10, compress: true });
      if (!r.ok) throw buildHttpStatusError(r.status);
      m3uText = await r.text();

      // Save credentials to playlist for future auto-refresh
      db.prepare(`
        UPDATE playlists SET source_url=?, source_type=?, source_server=?, source_username=?, source_password=?, updated_at=datetime('now')
        WHERE id=?
      `).run(url, req.body.source_type || 'url', req.body.source_server || null, req.body.source_username || null, req.body.source_password || null, pl.id);
    } catch (e) {
      if (e && Number(e.status) === 451) logger.warn('playlist','HTTP 451 playlist fetch warning',{ playlist_id: pl.id });
      logger.error('playlist','Playlist import failed',{ playlist_id: pl.id, error: e?.message || String(e) });
      return res.status(502).json({ error: getPlaylistFetchErrorMessage(e, 'Could not fetch URL:') });
    }
  }

  const includeVodLike = req.body.include_vod_like === true;
  const { channels, counts } = parseM3U(m3uText, { includeVodLike });

  const insert = db.prepare(`
    INSERT INTO channels (playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo, grp, epg_id, enabled, ord)
    VALUES (@playlist_id, @name, @url, @duration, @tvg_id, @tvg_name, @tvg_logo, @grp, @epg_id, @enabled, @ord)
  `);

  db.transaction((chs) => {
    db.prepare('DELETE FROM channels WHERE playlist_id = ?').run(pl.id);
    chs.forEach((c, i) => insert.run({ ...c, playlist_id: pl.id, ord: i }));
    db.prepare("UPDATE playlists SET updated_at=datetime('now'), last_refreshed=datetime('now') WHERE id=?").run(pl.id);
  })(channels);

  logger.info('playlist','Playlist import success',{ playlist_id: pl.id, imported: channels.length, skipped_vod_like: counts.skippedVodLike });
  res.json({
    imported: channels.length,
    import_summary: {
      total_entries: counts.totalEntries,
      imported_live: counts.importedLive,
      skipped_vod_like: counts.skippedVodLike,
      include_vod_like: includeVodLike,
    },
  });
});

// POST /api/playlists/:id/refresh — manual trigger of auto-refresh
router.post('/:id/refresh', async (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  logger.info('playlist','Playlist manual refresh started',{ playlist_id: pl.id, playlist_name: pl.name });
  try {
    await require('../scheduler').refreshPlaylist(pl);
    const updated = db.prepare('SELECT * FROM playlists WHERE id = ?').get(pl.id);
    const count   = db.prepare('SELECT COUNT(*) as c FROM channels WHERE playlist_id = ?').get(pl.id).c;
    logger.info('playlist','Playlist scheduled refresh success',{ playlist_id: pl.id, channel_count: count });
    res.json({ ok: true, channel_count: count, last_refreshed: updated.last_refreshed });
  } catch (e) {
    logger.error('playlist','Playlist manual refresh failure',{ playlist_id: pl.id, error: e?.message || String(e) });
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;

// POST /api/playlists/:id/clone — clone a playlist with optional group/keyword filter
router.post('/:id/clone', (req, res) => {
  const src = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });

  const { name, groups, keyword, enabled_only } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  // Build channel filter
  let query = 'SELECT * FROM channels WHERE playlist_id = ?';
  const params = [src.id];
  if (enabled_only) { query += ' AND enabled = 1'; }

  let channels = db.prepare(query + ' ORDER BY ord ASC').all(...params);

  // Filter by groups
  if (groups && groups.length) {
    channels = channels.filter(c => groups.includes(c.grp));
  }
  // Filter by keyword
  if (keyword) {
    const q = keyword.toLowerCase();
    channels = channels.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.tvg_name.toLowerCase().includes(q) ||
      c.grp.toLowerCase().includes(q)
    );
  }

  const { nanoid } = require('nanoid');
  const slug = nanoid(10);
  const { xtream_user, xtream_pass } = { xtream_user: nanoid(12), xtream_pass: nanoid(16) };

  const newPl = db.prepare(`
    INSERT INTO playlists (user_id, name, slug, source_url, source_type, source_server, source_username, source_password, xtream_user, xtream_pass)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.id, name.trim(), slug, src.source_url, src.source_type, src.source_server, src.source_username, src.source_password, xtream_user, xtream_pass);

  const insert = db.prepare(`
    INSERT INTO channels (playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo, grp, epg_id, enabled, ord, timeshift)
    VALUES (@playlist_id,@name,@url,@duration,@tvg_id,@tvg_name,@tvg_logo,@grp,@epg_id,@enabled,@ord,@timeshift)
  `);

  db.transaction(() => {
    channels.forEach((c, i) => insert.run({ ...c, playlist_id: newPl.lastInsertRowid, ord: i }));
  })();

  res.status(201).json({
    playlist: db.prepare('SELECT * FROM playlists WHERE id = ?').get(newPl.lastInsertRowid),
    channel_count: channels.length,
  });
});
