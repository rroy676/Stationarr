const router = require('express').Router();
const db     = require('../db');
const { exportM3U } = require('../utils/m3u');
const { mergeXMLTV, proxyEPG } = require('../utils/xmltv-merge');
const logger = require('../logger');
const fetch = require('node-fetch');

// POST /api/serve/validate-url
// Check a generated playlist URL from the same network location as Stationarr.
router.post('/validate-url', async (req, res) => {
  const { url, type } = req.body || {};
  const warnings = [];

  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  const value = url.trim();
  let parsed;
  try {
    parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch {
    return res.status(400).json({
      url: value,
      reachable: false,
      contentType: null,
      looksValid: false,
      warnings: ['URL must be a valid HTTP or HTTPS URL'],
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    warnings.push('This URL uses localhost and may only be reachable from the Stationarr container.');
  }

  const kind = type === 'm3u' || type === 'xmltv'
    ? type
    : /(?:\.m3u|get\.php)(?:$|[?#])/i.test(parsed.pathname + parsed.search) ? 'm3u' : 'xmltv';
  let reachable = false;
  let contentType = null;
  let looksValid = false;

  try {
    const response = await fetch(value, { timeout: 10000, follow: 5 });
    contentType = response.headers.get('content-type');
    reachable = response.ok;
    const body = await response.text();
    looksValid = kind === 'm3u'
      ? body.trimStart().startsWith('#EXTM3U')
      : /<tv(?:\s|>)/i.test(body);
  } catch (error) {
    warnings.push(`Request failed: ${error.message}`);
  }

  if (reachable && !looksValid) {
    warnings.push(kind === 'm3u'
      ? 'The response does not look like an M3U playlist (missing #EXTM3U).'
      : 'The response does not look like XMLTV data (missing <tv>).');
  }

  res.json({ url: value, reachable, contentType, looksValid, warnings });
});

// GET /api/serve/combined/:token/playlist.m3u
// Uses a dedicated user-level share token so individual playlist slugs do not
// unlock the global combined playlist.
router.get('/combined/:token/playlist.m3u', (req, res) => {
  const user = db.prepare('SELECT id, combined_slug FROM users WHERE combined_slug = ?').get(req.params.token);
  if (!user) return res.status(404).send('Not found');

  const channels = db.prepare(`
    SELECT c.*
    FROM playlists p
    JOIN channels c ON c.playlist_id = p.id
    WHERE p.user_id = ? AND c.enabled = 1
    ORDER BY p.created_at DESC, p.id DESC, c.ord ASC, c.id ASC
  `).all(user.id);

  logger.info('playlist', 'Generated combined playlist served/exported', { user_id: user.id, channel_count: channels.length });
  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="stationarr-combined.m3u"');
  res.send(exportM3U(channels));
});

// GET /api/serve/:slug/playlist.m3u
router.get('/:slug/playlist.m3u', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE slug = ?').get(req.params.slug);
  if (!pl) return res.status(404).send('Not found');

  const channels = db.prepare(
    'SELECT * FROM channels WHERE playlist_id = ? AND enabled = 1 ORDER BY ord ASC, id ASC'
  ).all(pl.id);

  logger.info('playlist', 'Generated playlist served/exported', { playlist_id: pl.id, slug: pl.slug, channel_count: channels.length });
  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slugify(pl.name)}.m3u"`);
  res.send(exportM3U(channels));
});

// GET /api/serve/:slug/epg.xml — merged + filtered full EPG with timeshift
router.get('/:slug/epg.xml', async (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE slug = ?').get(req.params.slug);
  if (!pl) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  try {
    await buildAndSendEPG(pl, res);
  } catch (e) {
    console.error('EPG serve error:', e.message);
    if (!res.headersSent) res.status(502).send('EPG unavailable');
  }
});

// GET /api/serve/:slug/info
router.get('/:slug/info', (req, res) => {
  const pl = db.prepare('SELECT id, name, slug, updated_at FROM playlists WHERE slug = ?').get(req.params.slug);
  if (!pl) return res.status(404).json({ error: 'Not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM channels WHERE playlist_id = ? AND enabled = 1').get(pl.id).c;
  const base  = process.env.BASE_URL || 'http://localhost:3000';
  res.json({
    name:          pl.name,
    updated_at:    pl.updated_at,
    channel_count: count,
    m3u_url:       `${base}/api/serve/${pl.slug}/playlist.m3u`,
    epg_url:       `${base}/api/serve/${pl.slug}/epg.xml`,
  });
});

// ── Shared EPG builder ────────────────────────────────────────────

async function buildAndSendEPG(pl, res) {
  // Get all enabled channels with epg_id and timeshift
  const chRows = db.prepare(
    `SELECT epg_id, timeshift FROM channels WHERE playlist_id = ? AND epg_id != '' AND enabled = 1`
  ).all(pl.id);

  const epgIds      = new Set(chRows.map(r => r.epg_id));
  const timeshiftMap = {};
  chRows.forEach(r => { if (r.timeshift) timeshiftMap[r.epg_id] = r.timeshift; });

  const sources  = db.prepare('SELECT * FROM epg_sources WHERE user_id = ? ORDER BY id').all(pl.user_id);
  if (!sources.length) return res.send(emptyXMLTV());

  const cached   = sources.filter(s => s.cache_path);
  const uncached = sources.filter(s => !s.cache_path && s.url);

  if (cached.length > 0) {
    const xml = await mergeXMLTV(cached.map(s => s.cache_path), epgIds, timeshiftMap);
    return res.send(xml);
  }

  if (uncached.length === 1) return proxyEPG(uncached[0].url, res);

  return res.send(emptyXMLTV(
    '<!-- No EPG cache found. Go to EPG sources and click "Fetch & cache URL". -->'
  ));
}

function emptyXMLTV(comment = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Stationarr">${comment}</tv>`;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = router;
module.exports.buildAndSendEPG = buildAndSendEPG;
