const router  = require('express').Router();
const db      = require('../db');
const requireAuth = require('../middleware/auth');
const { parseXMLTV, parseXMLTVBuffer } = require('../utils/xmltv');
const { saveEPGCache, deleteEPGCache } = require('../utils/xmltv-merge');
const { readProgrammes } = require('../utils/epg-reader');
const { countProgrammeEntriesFromBuffer } = require('../utils/xmltv-programme-count');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

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
    const { parseXMLTVFile } = require('../utils/xmltv');
    const channels = await parseXMLTVFile(tmpPath);
    const size     = fs.statSync(tmpPath).size;

    // Move tmp to final cache path
    const cachePath = path.join(DATA_DIR, 'epg_cache', `source_${src.id}.xml`);
    fs.renameSync(tmpPath, cachePath);

    const programmeCount = countProgrammeEntriesFromBuffer(fs.readFileSync(cachePath));
    storeEPGChannels(src.id, channels, cachePath, size, programmeCount);
    try { require('./guide').clearCache(); } catch {}
    res.json({ loaded: channels.length, cache_size: size, cached: true, programme_count: programmeCount });
  } catch (e) {
    // Clean up tmp file on error
    try { require('fs').unlinkSync(tmpPath); } catch {}
    res.status(502).json({ error: 'Fetch failed: ' + e.message });
  }
});

// POST /api/epg/:id/upload
router.post('/:id/upload', async (req, res) => {
  const src = db.prepare('SELECT * FROM epg_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const buf      = Buffer.from(content, 'utf8');
    const channels = await parseXMLTVBuffer(buf);
    const { cachePath, size } = saveEPGCache(DATA_DIR, src.id, buf);
    const programmeCount = countProgrammeEntriesFromBuffer(buf);
    storeEPGChannels(src.id, channels, cachePath, size, programmeCount);
    try { require('./guide').clearCache(); } catch {}
    res.json({ loaded: channels.length, cache_size: size, cached: true, programme_count: programmeCount });
  } catch (e) {
    res.status(500).json({ error: 'Parse failed: ' + e.message });
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
  try {
    await require('../scheduler').refreshEPGSource(src);
    res.json(db.prepare('SELECT * FROM epg_sources WHERE id=?').get(src.id));
  } catch (e) {
    res.status(502).json({ error: e.message });
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

  if (!epgChannels.length) return res.json({ matched: 0, logo_matched: 0, unmatched: 0 });

  // Build lookup maps — exact id, exact normalized name, fuzzy name
  const byId    = new Map(epgChannels.map(c => [c.tvg_id.toLowerCase(), c]));
  const byNorm  = new Map(epgChannels.map(c => [normalize(c.name), c]));
  const byFuzzy = new Map(epgChannels.map(c => [fuzzy(c.name), c]));

  const channels = db.prepare('SELECT * FROM channels WHERE playlist_id = ?').all(playlist_id);

  let matched = 0, logo_matched = 0, unmatched = 0;
  const updateEpg  = db.prepare('UPDATE channels SET epg_id=? WHERE id=?');
  const updateLogo = db.prepare('UPDATE channels SET tvg_logo=? WHERE id=?');

  db.transaction(() => {
    for (const ch of channels) {
      const existingId = ch.epg_id || ch.tvg_id;

      const epg =
        // 1. Exact tvg-id match
        byId.get(existingId.toLowerCase()) ||
        byId.get(ch.tvg_id.toLowerCase()) ||
        // 2. Exact normalized name
        byNorm.get(normalize(ch.name)) ||
        byNorm.get(normalize(ch.tvg_name)) ||
        // 3. Fuzzy name (strips HD, SD, +1, country suffix, punctuation)
        byFuzzy.get(fuzzy(ch.name)) ||
        byFuzzy.get(fuzzy(ch.tvg_name));

      if (epg) {
        if (!ch.epg_id) { updateEpg.run(epg.tvg_id, ch.id); matched++; }
        if (match_logos && !ch.tvg_logo && epg.icon) { updateLogo.run(epg.icon, ch.id); logo_matched++; }
      } else if (!ch.epg_id) {
        unmatched++;
      }
    }
  })();

  res.json({ matched, logo_matched, unmatched });
});

// ── Helpers ───────────────────────────────────────────────────────

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
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
