/**
 * Xtream Codes-compatible API
 *
 * Players connect using:
 *   Server:   http://yourhost
 *   Username: <xtream_user from playlist>
 *   Password: <xtream_pass from playlist>
 *
 * Endpoints implemented:
 *   GET/POST /player_api.php          — auth + account info
 *   GET/POST /player_api.php?action=get_live_categories
 *   GET/POST /player_api.php?action=get_live_streams
 *   GET      /live/:user/:pass/:id.ts — stream proxy redirect
 *   GET      /xmltv.php               — EPG feed
 */

const router   = require('express').Router();
const db       = require('../db');
const fetch    = require('node-fetch');
const { exportM3U } = require('../utils/m3u');
const { buildAndSendEPG } = require('./serve');

// ── Helpers ───────────────────────────────────────────────────────

function findPlaylist(username, password) {
  return db.prepare(
    'SELECT * FROM playlists WHERE xtream_user = ? AND xtream_pass = ?'
  ).get(username, password);
}

function getChannels(playlistId) {
  return db.prepare(
    'SELECT * FROM channels WHERE playlist_id = ? AND enabled = 1 ORDER BY ord ASC, id ASC'
  ).all(playlistId);
}

function getCategories(channels) {
  const seen = new Set();
  const cats = [];
  channels.forEach((ch, i) => {
    if (!seen.has(ch.grp)) {
      seen.add(ch.grp);
      cats.push({ category_id: String(i + 1), category_name: ch.grp, parent_id: 0 });
    }
  });
  return cats;
}

function buildAccountInfo(pl) {
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM channels WHERE playlist_id = ? AND enabled = 1'
  ).get(pl.id).c;

  const expTs = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10; // 10 years

  return {
    user_info: {
      username:        pl.xtream_user,
      password:        pl.xtream_pass,
      message:         'Welcome to Stationarr',
      auth:            1,
      status:          'Active',
      exp_date:        String(expTs),
      is_trial:        '0',
      active_cons:     '0',
      created_at:      String(Math.floor(new Date(pl.created_at).getTime() / 1000)),
      max_connections: '1',
      allowed_output_formats: ['ts', 'm3u8'],
    },
    server_info: {
      url:           process.env.BASE_URL || 'http://localhost:3000',
      port:          String(process.env.PORT || 3000),
      https_port:    '443',
      server_protocol: 'http',
      rtmp_port:     '1935',
      timezone:      'UTC',
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now:      new Date().toISOString().replace('T', ' ').slice(0, 19),
      process:       true,
    },
    available_channels: count,
  };
}

function streamsResponse(channels, pl) {
  const base = process.env.BASE_URL || 'http://localhost:3000';

  // Build category_id map: group name → id
  const catMap = {};
  let catIdx = 1;
  channels.forEach(ch => {
    if (!catMap[ch.grp]) catMap[ch.grp] = catIdx++;
  });

  return channels.map((ch, i) => ({
    num:              i + 1,
    name:             ch.name,
    stream_type:      'live',
    stream_id:        ch.id,
    stream_icon:      ch.tvg_logo || '',
    epg_channel_id:   ch.epg_id  || ch.tvg_id || '',
    added:            '0',
    category_id:      String(catMap[ch.grp] || 1),
    custom_sid:       '',
    tv_archive:       0,
    direct_source:    '',
    tv_archive_duration: 0,
    // Stream URL in Xtream format
    stream_url: `${base}/live/${pl.xtream_user}/${pl.xtream_pass}/${ch.id}.ts`,
  }));
}

// ── player_api.php ────────────────────────────────────────────────

function handlePlayerApi(req, res) {
  const { username, password, action } = { ...req.query, ...req.body };

  if (!username || !password) {
    return res.status(401).json({ user_info: { auth: 0 } });
  }

  const pl = findPlaylist(username, password);
  if (!pl) return res.status(401).json({ user_info: { auth: 0 } });

  const channels = getChannels(pl.id);

  // No action = auth + account info
  if (!action) {
    return res.json(buildAccountInfo(pl));
  }

  switch (action) {
    case 'get_live_categories':
      return res.json(getCategories(channels));

    case 'get_live_streams':
      return res.json(streamsResponse(channels, pl));

    case 'get_vod_categories':
    case 'get_vod_streams':
    case 'get_series_categories':
    case 'get_series':
      // Not implemented — return empty arrays (players handle this gracefully)
      return res.json([]);

    case 'get_simple_data_table':
      return res.json({ cmd: action, data: [] });

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}

router.get('/player_api.php',  handlePlayerApi);
router.post('/player_api.php', handlePlayerApi);

// ── /live/:user/:pass/:streamId.ts — stream redirect ─────────────

router.get('/live/:user/:pass/:streamId', async (req, res) => {
  const { user, pass, streamId } = req.params;

  const pl = findPlaylist(user, pass);
  if (!pl) return res.status(401).send('Unauthorized');

  // Strip extension (.ts, .m3u8, etc.)
  const id = streamId.replace(/\.[^.]+$/, '');
  const ch = db.prepare(
    'SELECT * FROM channels WHERE id = ? AND playlist_id = ?'
  ).get(id, pl.id);

  if (!ch || !ch.enabled) return res.status(404).send('Stream not found');

  // Redirect to the actual stream URL — let the player fetch it directly
  // This avoids proxying large video streams through Node
  res.redirect(302, ch.url);
});

// ── /xmltv.php — full EPG output ─────────────────────────────────

router.get('/xmltv.php', async (req, res) => {
  const { username, password } = req.query;

  const pl = findPlaylist(username, password);
  if (!pl) return res.status(401).send('Unauthorized');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  try {
    await buildAndSendEPG(pl, res);
  } catch (e) {
    console.error('Xtream EPG error:', e.message);
    if (!res.headersSent) res.status(502).send('EPG unavailable');
  }
});

// ── /get.php — M3U download in Xtream format ─────────────────────
// Some players use this URL format: /get.php?username=X&password=Y&type=m3u_plus

router.get('/get.php', (req, res) => {
  const { username, password } = req.query;

  const pl = findPlaylist(username, password);
  if (!pl) return res.status(401).send('Unauthorized');

  const channels = getChannels(pl.id);
  const m3u = exportM3U(channels);

  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
  res.send(m3u);
});

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
