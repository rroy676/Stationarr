const router  = require('express').Router();
const db      = require('../db');
const requireAuth = require('../middleware/auth');
const { parseXMLTV, parseXMLTVBuffer, parseXMLTVFile } = require('../utils/xmltv');
const { saveEPGCache, deleteEPGCache } = require('../utils/xmltv-merge');
const { readProgrammes } = require('../utils/epg-reader');
const { countProgrammeEntriesFromBuffer, countProgrammeEntriesFromFile } = require('../utils/xmltv-programme-count');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const logger  = require('../logger');
const { queueGuideIndex } = require('../utils/guide-indexer');
const { redactSensitiveUrls } = require('../utils/http-errors');

const DATA_DIR = process.env.DATA_DIR || './data';

router.use(requireAuth);

// GET /api/epg
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM epg_sources WHERE user_id = ? ORDER BY priority ASC, id ASC').all(req.user.id));
});

// POST /api/epg
router.post('/', (req, res) => {
  const { name, url } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(
    'INSERT INTO epg_sources (user_id, name, url) VALUES (?,?,?)'
  ).run(req.user.id, name.trim(), url || null);
  res.status(201).json(db.prepare('SELECT * FROM epg_sources WHERE id=?').get(result.lastInsertRowid));
});

// PUT /api/epg/:id
router.put('/:id', (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const name             = req.body.name             ?? src.name;
  const url              = req.body.url              !== undefined ? (req.body.url || null) : src.url;
  const auto_refresh     = req.body.auto_refresh     !== undefined ? (req.body.auto_refresh ? 1 : 0) : src.auto_refresh;
  const refresh_interval = req.body.refresh_interval ?? src.refresh_interval ?? 24;
  db.prepare('UPDATE epg_sources SET name=?, url=?, auto_refresh=?, refresh_interval=? WHERE id=?')
    .run(name, url, auto_refresh, refresh_interval, src.id);
  res.json(db.prepare('SELECT * FROM epg_sources WHERE id=?').get(src.id));
});

// DELETE /api/epg/:id
router.delete('/:id', (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  deleteEPGCache(src.cache_path);
  db.prepare('DELETE FROM epg_sources WHERE id=?').run(src.id);
  res.json({ ok: true });
});

// GET /api/epg/:id/channels
router.get('/:id/channels', (req, res) => {
  const src = db.prepare('SELECT id FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM epg_channels WHERE source_id=? ORDER BY name').all(src.id));
});

// GET /api/epg/:id/fetch-stream — SSE progress stream during fetch+parse
router.get('/:id/fetch-stream', async (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  if (!src.url) return res.status(400).json({ error: 'Source has no URL' });

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ phase: 'connecting', message: 'Connecting to source…' });

    const r = await fetch(src.url, { timeout: 60000, follow: 10, compress: true });
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const total = parseInt(r.headers.get('content-length') || '0', 10);
    send({ phase: 'downloading', message: 'Downloading…', total, received: 0 });

    // Collect buffer with progress updates
    const chunks = [];
    let received = 0;
    let lastPct  = -1;

    await new Promise((resolve, reject) => {
      r.body.on('data', (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        if (total > 0) {
          const pct = Math.floor((received / total) * 100);
          if (pct !== lastPct && pct % 5 === 0) { // emit every 5%
            lastPct = pct;
            send({ phase: 'downloading', received, total, percent: pct, message: `Downloading… ${pct}%` });
          }
        } else {
          // Unknown size — report MB received
          const mb = (received / 1024 / 1024).toFixed(1);
          if (Math.floor(received / (1024*1024)) !== Math.floor((received - chunk.length) / (1024*1024))) {
            send({ phase: 'downloading', received, message: `Downloading… ${mb} MB` });
          }
        }
      });
      r.body.on('end',   resolve);
      r.body.on('error', reject);
    });

    send({ phase: 'parsing', message: 'Parsing channels…' });
    const buf      = Buffer.concat(chunks);
    const channels = await parseXMLTVBuffer(buf);

    send({ phase: 'saving', message: `Saving cache (${channels.length} channels)…` });
    const { cachePath, size } = saveEPGCache(DATA_DIR, src.id, buf);
    storeEPGChannels(src.id, channels, cachePath, size);
    queueGuideIndex(src.id, cachePath);
    // Clear guide cache so next guide load is fresh
    try { require('./guide').clearCache(); } catch {}

    const programmeCount = countProgrammeEntriesFromBuffer(buf);
    send({ phase: 'done', loaded: channels.length, cache_size: size, programme_count: programmeCount });
    res.end();
  } catch (e) {
    send({ phase: 'error', message: e.message });
    res.end();
  }
});

// POST /api/epg/:id/fetch — stream to disk then parse (memory efficient)
router.post('/:id/fetch', async (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  if (!src.url) return res.status(400).json({ error: 'Source has no URL' });

  const path = require('path');
  const tmpPath = path.join(DATA_DIR, 'epg_cache', `tmp_${src.id}.xml`);

  logger.info('epg', 'Manual EPG source fetch started', { source_id: src.id, source_name: src.name });
  try {
    const r = await fetch(src.url, { timeout: 120000, follow: 10, compress: true });
    if (!r.ok) throw new Error('HTTP ' + r.status);

    // Stream directly to disk — never loads full file into RAM
    await new Promise((resolve, reject) => {
      const dir = path.dirname(tmpPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const out = fs.createWriteStream(tmpPath);
      r.body.pipe(out);
      r.body.on('error', reject);
      out.on('finish', resolve);
      out.on('error', reject);
    });

    // Parse from disk using SAX streaming — memory efficient
    const channels = await parseXMLTVFile(tmpPath);
    const size     = fs.statSync(tmpPath).size;

    // Move tmp to final cache path
    const cachePath = path.join(DATA_DIR, 'epg_cache', `source_${src.id}.xml`);
    fs.renameSync(tmpPath, cachePath);

    const programmeCount = countProgrammeEntriesFromBuffer(fs.readFileSync(cachePath));
    storeEPGChannels(src.id, channels, cachePath, size, programmeCount);
    queueGuideIndex(src.id, cachePath);
    try { require('./guide').clearCache(); } catch {}
    logger.info('epg', 'Manual EPG source fetch success', { source_id: src.id, channels: channels.length, programmes: programmeCount });
    res.json({ loaded: channels.length, cache_size: size, cached: true, programme_count: programmeCount });
  } catch (e) {
    // Clean up tmp file on error
    try { require('fs').unlinkSync(tmpPath); } catch {}
    const safeMessage = redactSensitiveUrls(e?.message || String(e));
    logger.error('epg', 'Manual EPG source fetch failure', { source_id: src.id, error: safeMessage });
    res.status(502).json({ error: 'Fetch failed: ' + safeMessage });
  }
});

function epgUploadLimitBytes() {
  const configured = Number(process.env.EPG_UPLOAD_MAX_SIZE_MB || 250);
  const megabytes = Number.isFinite(configured) && configured > 0 ? configured : 250;
  return Math.floor(megabytes * 1024 * 1024);
}

function uploadSizeLimiter(maxBytes) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        const error = new Error('EPG upload exceeds configured size limit');
        error.code = 'EPG_UPLOAD_TOO_LARGE';
        callback(error);
      } else {
        callback(null, chunk);
      }
    },
  });
}

// POST /api/epg/:id/upload — raw XML/XMLTV or gzip body, streamed to disk
router.post('/:id/upload', async (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const maxBytes = epgUploadLimitBytes();
  const contentLength = Number(req.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    req.resume();
    return res.status(413).json({ error: `EPG upload exceeds the ${process.env.EPG_UPLOAD_MAX_SIZE_MB || 250} MB limit` });
  }

  const cacheDir = path.join(DATA_DIR, 'epg_cache');
  const tmpPath = path.join(cacheDir, `.upload_${src.id}_${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await pipeline(req, uploadSizeLimiter(maxBytes), fs.createWriteStream(tmpPath, { flags: 'wx' }));
    const size = (await fs.promises.stat(tmpPath)).size;
    if (!size) {
      const error = new Error('XMLTV payload required');
      error.code = 'EMPTY_EPG_UPLOAD';
      throw error;
    }

    const channels = await parseXMLTVFile(tmpPath);
    const programmeCount = await countProgrammeEntriesFromFile(tmpPath);
    const cachePath = path.join(cacheDir, `source_${src.id}.xml`);
    await fs.promises.rename(tmpPath, cachePath);
    storeEPGChannels(src.id, channels, cachePath, size, programmeCount);
    queueGuideIndex(src.id, cachePath);
    try { require('./guide').clearCache(); } catch {}
    logger.info('epg', 'Manual EPG source fetch success', { source_id: src.id, channels: channels.length, programmes: programmeCount });
    res.json({ loaded: channels.length, cache_size: size, cached: true, programme_count: programmeCount });
  } catch (e) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    if (e.code === 'EPG_UPLOAD_TOO_LARGE') {
      return res.status(413).json({ error: `EPG upload exceeds the ${process.env.EPG_UPLOAD_MAX_SIZE_MB || 250} MB limit` });
    }
    const safeMessage = redactSensitiveUrls(e?.message || String(e));
    logger.error('epg', 'Manual EPG upload failure', { source_id: src.id, error: safeMessage });
    res.status(400).json({ error: 'Upload failed: ' + safeMessage });
  }
});

// DELETE /api/epg/:id/cache
router.delete('/:id/cache', (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  deleteEPGCache(src.cache_path);
  db.prepare("UPDATE epg_sources SET cache_path=NULL, cache_size=0, cache_updated=NULL, programme_count=0 WHERE id=?").run(src.id);
  res.json({ ok: true });
});

// POST /api/epg/:id/refresh
router.post('/:id/refresh', async (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  if (!src.url) return res.status(400).json({ error: 'Source has no URL to refresh from' });
  logger.info('epg', 'Manual EPG source refresh started', { source_id: src.id, source_name: src.name });
  try {
    await require('../scheduler').refreshEPGSource(src);
    const updated = db.prepare('SELECT * FROM epg_sources WHERE id=?').get(src.id);
    logger.info('epg', 'Manual EPG source refresh success', { source_id: src.id, channels: updated?.channel_count || 0, programmes: updated?.programme_count || 0 });
    res.json(updated);
  } catch (e) {
    const safeMessage = redactSensitiveUrls(e?.message || String(e));
    logger.error('epg', 'Manual EPG source refresh failure', { source_id: src.id, error: safeMessage });
    res.status(502).json({ error: 'EPG source refresh failed: ' + safeMessage });
  }
});

// GET /api/epg/programmes?epg_id=X&hours=6 — fetch programmes in time window
router.get('/programmes', async (req, res) => {
  const { epg_id, hours = 6 } = req.query;
  if (!epg_id) return res.status(400).json({ error: 'epg_id required' });

  const sources = db.prepare(
    'SELECT * FROM epg_sources WHERE user_id = ? AND cache_path IS NOT NULL ORDER BY id'
  ).all(req.user.id);

  const from = new Date();
  // Start 30 min before now to show currently airing programme
  from.setMinutes(from.getMinutes() - 30);
  const to = new Date(from.getTime() + (Number(hours) + 0.5) * 60 * 60 * 1000);

  const all = [];
  for (const src of sources) {
    try {
      const map = await readProgrammes(src.cache_path, [epg_id], { from, to, max: 50 });
      all.push(...(map.get(epg_id) || []));
    } catch {}
  }

  const sorted = all
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .map(p => ({
      title:    p.title,
      subtitle: p.subtitle || '',
      desc:     p.desc     || '',
      category: p.category || '',
      start:    p.start?.toISOString() || null,
      stop:     p.stop?.toISOString()  || null,
    }));

  res.json(sorted);
});

// GET /api/epg/match-details?playlist_id=X — explain each channel's EPG match
router.get('/match-details', (req, res) => {
  const { playlist_id } = req.query;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });
  const playlist = db.prepare('SELECT id FROM playlists WHERE id=? AND user_id=?').get(playlist_id, req.user.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });

  const results = db.prepare(`
    SELECT id AS channel_id, name, epg_id, auto_match_confidence AS confidence,
           auto_match_reason AS reason
    FROM channels WHERE playlist_id=? ORDER BY ord ASC, id ASC
  `).all(playlist_id);
  res.json({ results });
});

// POST /api/epg/auto-match — smarter fuzzy matching
router.post('/auto-match', (req, res) => {
  const { playlist_id, match_logos } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });

  const pl = db.prepare('SELECT id FROM playlists WHERE id=? AND user_id=?').get(playlist_id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  const { source_id } = req.body;

  const epgChannels = source_id
    ? db.prepare(`
        SELECT ec.* FROM epg_channels ec
        JOIN epg_sources es ON es.id = ec.source_id
        WHERE es.user_id = ? AND ec.source_id = ?
      `).all(req.user.id, source_id)
    : db.prepare(`
        SELECT ec.* FROM epg_channels ec
        JOIN epg_sources es ON es.id = ec.source_id
        WHERE es.user_id = ?
      `).all(req.user.id);

  const channels = db.prepare('SELECT * FROM channels WHERE playlist_id = ?').all(playlist_id);
  if (!epgChannels.length) return res.json({
    matched: 0, logo_matched: 0, unmatched: channels.filter(ch => !ch.epg_id).length,
    results: channels.map(ch => ({ channel_id: ch.id, name: ch.name, epg_id: ch.epg_id || '',
      confidence: ch.auto_match_confidence || (ch.epg_id ? 'Manual' : null),
      reason: ch.auto_match_reason || (ch.epg_id ? 'Manually assigned' : null) }))
  });

  // Build lookup maps — exact id, exact normalized name, fuzzy name
  const byId    = new Map(epgChannels.map(c => [c.tvg_id.toLowerCase(), c]));
  const byNorm  = new Map(epgChannels.map(c => [normalize(c.name), c]));
  const byCountry = new Map(epgChannels.filter(c => hasCountry(c.name)).map(c => [nameCountryKey(c.name), c]));
  const byFuzzy = new Map(epgChannels.map(c => [fuzzy(c.name), c]));

  let matched = 0, logo_matched = 0, unmatched = 0;
  const results = [];
  const updateEpg  = db.prepare('UPDATE channels SET epg_id=?, auto_match_confidence=?, auto_match_reason=? WHERE id=?');
  const updateLogo = db.prepare('UPDATE channels SET tvg_logo=? WHERE id=?');

  db.transaction(() => {
    for (const ch of channels) {
      const existingId = ch.epg_id || ch.tvg_id;
      let epg;
      let match;
      // 1. Exact tvg-id match
      epg = byId.get(String(existingId).toLowerCase()) || byId.get(String(ch.tvg_id).toLowerCase());
      if (epg) match = matchConfidence('id');
      // 2. Exact normalized name
      if (!epg) {
        epg = byNorm.get(normalize(ch.name)) || byNorm.get(normalize(ch.tvg_name));
        if (epg) match = matchConfidence('normalized-name');
      }
      // 3. Name + country match (country is conventionally a trailing code/name)
      if (!epg && hasCountry(ch.name || ch.tvg_name)) {
        epg = byCountry.get(nameCountryKey(ch.name)) || byCountry.get(nameCountryKey(ch.tvg_name));
        if (epg) match = matchConfidence('country');
      }
      // 4. Fuzzy name (strips HD, SD, +1, country suffix, punctuation)
      if (!epg) {
        epg = byFuzzy.get(fuzzy(ch.name)) || byFuzzy.get(fuzzy(ch.tvg_name));
        if (epg) match = matchConfidence('fuzzy');
      }

      if (epg) {
        if (!ch.epg_id) { updateEpg.run(epg.tvg_id, match.confidence, match.reason, ch.id); matched++; }
        if (match_logos && !ch.tvg_logo && epg.icon) { updateLogo.run(epg.icon, ch.id); logo_matched++; }
      } else if (!ch.epg_id) {
        unmatched++;
      }

      const current = db.prepare('SELECT epg_id, auto_match_confidence, auto_match_reason FROM channels WHERE id=?').get(ch.id);
      results.push({ channel_id: ch.id, name: ch.name, epg_id: current.epg_id || '',
        confidence: current.auto_match_confidence || (current.epg_id ? 'Manual' : null),
        reason: current.auto_match_reason || (current.epg_id ? 'Manually assigned' : null) });
    }
  })();

  res.json({ matched, logo_matched, unmatched, results });
});

// ── Helpers ───────────────────────────────────────────────────────

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchConfidence(type) {
  if (!type) return null;
  const matches = {
    id: ['High', 'Matched by exact tvg-id'],
    'normalized-name': ['High', 'Matched by normalized channel name'],
    country: ['Medium', 'Matched by name and country'],
    fuzzy: ['Low', 'Matched by fuzzy name similarity'],
  };
  const [confidence, reason] = matches[type];
  return { confidence, reason };
}

function countryCode(s) {
  const value = String(s || '').trim();
  const match = value.match(/(?:[\s([-])(US|UK|CA|AU|DE|FR|ES|IT|IN|MX|JP|CN|BR|PT|NL|BE|AT|CH|IE|NZ|ZA|PH|SE|NO|DK|FI|PL|TR|GR|IL|RU|UA|AR|CL|CO)\s*[\])]?$|(?:[\s-])(USA|Canada|Australia|Germany|France|Spain|Italy|India|Mexico)\s*$/i);
  return match ? (match[1] || match[2]).toLowerCase() : '';
}

function hasCountry(s) { return !!countryCode(s); }

function nameCountryKey(s) {
  const value = String(s || '').trim();
  const country = countryCode(value);
  const base = country ? value.replace(/(?:[\s([-])(?:US|UK|CA|AU|DE|FR|ES|IT|IN|MX|JP|CN|BR|PT|NL|BE|AT|CH|IE|NZ|ZA|PH|SE|NO|DK|FI|PL|TR|GR|IL|RU|UA|AR|CL|CO)\s*[\])]?$|(?:[\s-])(?:USA|Canada|Australia|Germany|France|Spain|Italy|India|Mexico)\s*$/i, '') : value;
  return `${fuzzy(base)}|${country}`;
}

function fuzzy(s) {
  return s
    .toLowerCase()
    // Remove common suffixes
    .replace(/\b(hd|sd|fhd|uhd|4k|hevc|h265|h264)\b/g, '')
    .replace(/\s*\+\d+\s*/g, '')           // +1, +2 timeshift variants
    .replace(/\b(east|west|north|south)\b/g, '')
    .replace(/\(.*?\)/g, '')               // anything in parentheses
    .replace(/[^a-z0-9]/g, '');            // strip all non-alphanumeric
}

function storeEPGChannels(sourceId, channels, cachePath, cacheSize, programmeCount = 0) {
  const insert = db.prepare('INSERT INTO epg_channels (source_id, tvg_id, name, icon) VALUES (?,?,?,?)');
  // Filter out channels with no ID or name — these would violate NOT NULL constraints
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
}

module.exports = router;

// POST /api/epg/reorder — set priority order for sources
router.post('/reorder', (req, res) => {
  const { order } = req.body; // array of source IDs in priority order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] required' });
  const update = db.prepare('UPDATE epg_sources SET priority=? WHERE id=? AND user_id=?');
  db.transaction(() => {
    order.forEach((id, i) => update.run(i, id, req.user.id));
  })();
  res.json({ ok: true });
});
