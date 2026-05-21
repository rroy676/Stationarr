/**
 * Auto-refresh scheduler
 * Runs every 15 minutes, checks for playlists and EPG sources
 * that are due for a refresh based on their refresh_interval setting.
 */

const db    = require('./db');
const fetch = require('node-fetch');
const { parseM3U }  = require('./utils/m3u');
const { parseXMLTVBuffer } = require('./utils/xmltv');
const { saveEPGCache } = require('./utils/xmltv-merge');
const { countProgrammeEntriesFromBuffer } = require('./utils/xmltv-programme-count');
const { buildHttpStatusError, getPlaylistFetchErrorMessage } = require('./utils/http-errors');
const logger = require('./logger');

const DATA_DIR    = process.env.DATA_DIR || './data';
const CHECK_EVERY = 15 * 60 * 1000; // 15 minutes
function buildM3UUrl(pl) {
  if (pl.source_type === 'xtream' && pl.source_server && pl.source_username && pl.source_password) {
    const base = pl.source_server.replace(/\/$/, '');
    return `${base}/get.php?username=${encodeURIComponent(pl.source_username)}&password=${encodeURIComponent(pl.source_password)}&type=m3u_plus&output=ts`;
  }
  return pl.source_url || null;
}

async function refreshPlaylist(pl) {
  const url = buildM3UUrl(pl);
  if (!url) return;

  console.log(`[scheduler] Refreshing playlist "${pl.name}" (id=${pl.id})`);
  logger.info('scheduler','Playlist scheduled refresh started',{ playlist_id: pl.id, playlist_name: pl.name });
  try {
    const r = await fetch(url, { timeout: 30000, follow: 10, compress: true });
    if (!r.ok) throw buildHttpStatusError(r.status);
    const text = await r.text();
    const { channels, counts } = parseM3U(text);

    const insert = db.prepare(`
      INSERT INTO channels (playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo, grp, epg_id, enabled, ord)
      VALUES (@playlist_id, @name, @url, @duration, @tvg_id, @tvg_name, @tvg_logo, @grp, @epg_id, @enabled, @ord)
    `);

    db.transaction(() => {
      db.prepare('DELETE FROM channels WHERE playlist_id = ?').run(pl.id);
      channels.forEach((c, i) => insert.run({ ...c, playlist_id: pl.id, ord: i }));
      db.prepare("UPDATE playlists SET last_refreshed=datetime('now'), updated_at=datetime('now') WHERE id=?").run(pl.id);
    })();

    console.log(`[scheduler] Playlist "${pl.name}" refreshed — ${counts.importedLive}/${counts.totalEntries} live channels imported (${counts.skippedVodLike} VOD-like entries skipped)`);
    logger.info('scheduler','Playlist scheduled refresh success',{ playlist_id: pl.id, imported_live: counts.importedLive, total_entries: counts.totalEntries });
  } catch (e) {
    console.error(`[scheduler] Failed to refresh playlist "${pl.name}":`, getPlaylistFetchErrorMessage(e, 'Playlist fetch failed:'));
    if (e && Number(e.status) === 451) logger.warn('playlist','HTTP 451 playlist fetch warning',{ playlist_id: pl.id, playlist_name: pl.name });
    logger.error('scheduler','Playlist scheduled refresh failure',{ playlist_id: pl.id, error: e?.message || String(e) });
    if (e && e.message) {
      console.error(`[scheduler] Technical fetch error for playlist "${pl.name}":`, e.message);
    }
  }
}

async function refreshEPGSource(src) {
  if (!src.url) return;

  console.log(`[scheduler] Refreshing EPG source "${src.name}" (id=${src.id})`);
  logger.info('scheduler','EPG source scheduled refresh started',{ source_id: src.id, source_name: src.name });
  try {
    const r = await fetch(src.url, { timeout: 60000, follow: 10, compress: true });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = await r.buffer();
    const channels = await parseXMLTVBuffer(buf);
    const { cachePath, size } = saveEPGCache(DATA_DIR, src.id, buf);
    const programmeCount = countProgrammeEntriesFromBuffer(buf);

    const insert = db.prepare('INSERT INTO epg_channels (source_id, tvg_id, name, icon) VALUES (?,?,?,?)');
    db.transaction(() => {
      db.prepare('DELETE FROM epg_channels WHERE source_id = ?').run(src.id);
      channels.forEach(c => insert.run(src.id, c.id, c.name, c.icon || ''));
      db.prepare(`
        UPDATE epg_sources
        SET last_fetched=datetime('now'), channel_count=?, programme_count=?, cache_path=?, cache_size=?,
            cache_updated=datetime('now'), last_refreshed=datetime('now')
        WHERE id=?
      `).run(channels.length, programmeCount, cachePath, size, src.id);
    })();

    console.log(`[scheduler] EPG source "${src.name}" refreshed — ${channels.length} channels, ${programmeCount} programmes, ${(size/1024/1024).toFixed(1)} MB`);
    logger.info('epg','EPG source fetch success',{ source_id: src.id, channels: channels.length, programmes: programmeCount });
  } catch (e) {
    console.error(`[scheduler] Failed to refresh EPG source "${src.name}":`, e.message);
    logger.error('epg','EPG source fetch failure',{ source_id: src.id, error: e?.message || String(e) });
  }
}

function isDue(lastRefreshed, intervalHours) {
  if (!lastRefreshed) return true; // never refreshed — do it now
  const last = new Date(lastRefreshed + 'Z'); // treat as UTC
  const diffHours = (Date.now() - last.getTime()) / (1000 * 60 * 60);
  return diffHours >= intervalHours;
}

async function runCheck() {
  // Check playlists
  const playlists = db.prepare(
    'SELECT * FROM playlists WHERE auto_refresh = 1'
  ).all();

  for (const pl of playlists) {
    if (isDue(pl.last_refreshed, pl.refresh_interval || 24)) {
      await refreshPlaylist(pl);
    }
  }

  // Check EPG sources
  const sources = db.prepare(
    'SELECT * FROM epg_sources WHERE auto_refresh = 1 AND url IS NOT NULL'
  ).all();

  for (const src of sources) {
    if (isDue(src.last_refreshed, src.refresh_interval || 24)) {
      await refreshEPGSource(src);
    }
  }
}

function start() {
  console.log('[scheduler] Auto-refresh scheduler started (checking every 15 min)');
  // Run once shortly after startup, then every 15 min
  setTimeout(runCheck, 30 * 1000);
  setInterval(runCheck, CHECK_EVERY);
}

module.exports = { start, refreshPlaylist, refreshEPGSource };
