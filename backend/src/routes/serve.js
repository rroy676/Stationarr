const router = require('express').Router();
const db     = require('../db');
const { exportM3U } = require('../utils/m3u');
const { mergeXMLTV, proxyEPG } = require('../utils/xmltv-merge');

// GET /api/serve/:slug/playlist.m3u
router.get('/:slug/playlist.m3u', (req, res) => {
  const pl = db.prepare('SELECT * FROM playlists WHERE slug = ?').get(req.params.slug);
  if (!pl) return res.status(404).send('Not found');

  const channels = db.prepare(
    'SELECT * FROM channels WHERE playlist_id = ? AND enabled = 1 ORDER BY ord ASC, id ASC'
  ).all(pl.id);

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
