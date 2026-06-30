const fetch = require('node-fetch');
const db = require('../db');
const { parseXMLTVBuffer } = require('./xmltv');
const { saveEPGCache } = require('./xmltv-merge');
const { countProgrammeEntriesFromBuffer } = require('./xmltv-programme-count');
const { buildHttpStatusError, redactSensitiveUrls } = require('./http-errors');
const { queueGuideIndex } = require('./guide-indexer');
const { normalizeBase } = require('./provider-login');

const DATA_DIR = process.env.DATA_DIR || './data';

function buildXtreamXmltvUrl(server, username, password) {
  const base = normalizeBase(server);
  const qs = new URLSearchParams({
    username: username || '',
    password: password || '',
  });
  return `${base}/xmltv.php?${qs.toString()}`;
}

function getSourceName(playlist) {
  return `${playlist.name} (Provider Login EPG #${playlist.id})`;
}

function getSourceSuffix(playlist) {
  return `(Provider Login EPG #${playlist.id})`;
}

function ensureProviderEPGSource(playlist) {
  const name = getSourceName(playlist);
  const suffix = getSourceSuffix(playlist);

  const stableExisting = db.prepare(`
    SELECT * FROM epg_sources
    WHERE user_id = ? AND name LIKE ?
    ORDER BY id ASC
    LIMIT 1
  `).get(playlist.user_id, `% ${suffix}`);

  const legacyName = `${playlist.name} (Provider Login EPG)`;
  const legacyExisting = stableExisting || db.prepare('SELECT * FROM epg_sources WHERE user_id = ? AND name = ? ORDER BY id ASC LIMIT 1')
    .get(playlist.user_id, legacyName);

  const existing = stableExisting || legacyExisting;
  if (existing) {
    if (existing.name !== name || existing.url !== null || existing.refresh_interval !== (playlist.refresh_interval || 24)) {
      db.prepare('UPDATE epg_sources SET name=?, url=NULL, refresh_interval=? WHERE id=?')
        .run(name, playlist.refresh_interval || 24, existing.id);
    }
    return db.prepare('SELECT * FROM epg_sources WHERE id = ?').get(existing.id);
  }

  const result = db.prepare('INSERT INTO epg_sources (user_id, name, url, auto_refresh, refresh_interval) VALUES (?,?,?,?,?)')
    .run(playlist.user_id, name, null, 0, playlist.refresh_interval || 24);
  return db.prepare('SELECT * FROM epg_sources WHERE id = ?').get(result.lastInsertRowid);
}

function storeEPGChannels(sourceId, channels, cachePath, cacheSize, programmeCount = 0) {
  const insert = db.prepare('INSERT INTO epg_channels (source_id, tvg_id, name, icon) VALUES (?,?,?,?)');
  const valid = channels.filter(c => (c.tvg_id || c.id) && (c.name || '').trim());

  db.transaction(() => {
    db.prepare('DELETE FROM epg_channels WHERE source_id = ?').run(sourceId);
    valid.forEach(c => insert.run(sourceId, c.tvg_id || c.id, c.name, c.icon || ''));
    db.prepare(`
      UPDATE epg_sources
      SET last_fetched=datetime('now'), channel_count=?, programme_count=?, cache_path=?, cache_size=?,
          cache_updated=datetime('now'), last_refreshed=datetime('now')
      WHERE id=?
    `).run(valid.length, Number(programmeCount) || 0, cachePath || null, cacheSize || 0, sourceId);
  })();

  return valid.length;
}

async function importXtreamEPGForPlaylist(playlist) {
  if (!playlist?.source_server || !playlist?.source_username || !playlist?.source_password) {
    throw new Error('Provider EPG import requires complete provider credentials.');
  }

  const url = buildXtreamXmltvUrl(playlist.source_server, playlist.source_username, playlist.source_password);
  const response = await fetch(url, { timeout: 120000, follow: 10, compress: true });
  if (!response.ok) throw buildHttpStatusError(response.status);

  const buf = await response.buffer();
  const channels = await parseXMLTVBuffer(buf);
  const src = ensureProviderEPGSource(playlist);
  const { cachePath, size } = saveEPGCache(DATA_DIR, src.id, buf);
  const programmeCount = countProgrammeEntriesFromBuffer(buf);
  const loaded = storeEPGChannels(src.id, channels, cachePath, size, programmeCount);
  queueGuideIndex(src.id, cachePath);
  try { require('../routes/guide').clearCache(); } catch {}

  return { source_id: src.id, loaded, cache_size: size, programme_count: programmeCount };
}

function sanitizeXtreamEPGError(error) {
  return redactSensitiveUrls(error?.message || String(error));
}

module.exports = {
  buildXtreamXmltvUrl,
  importXtreamEPGForPlaylist,
  sanitizeXtreamEPGError,
};
