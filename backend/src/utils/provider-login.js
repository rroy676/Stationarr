const fetch = require('node-fetch');
const { buildHttpStatusError } = require('./http-errors');

function normalizeBase(server) {
  return String(server || '').trim().replace(/\/+$/, '');
}

function buildPlayerApiUrl(server, username, password, action) {
  const base = normalizeBase(server);
  const qs = new URLSearchParams({
    username: username || '',
    password: password || '',
  });
  if (action) qs.set('action', action);
  return `${base}/player_api.php?${qs.toString()}`;
}

async function fetchJson(url) {
  const r = await fetch(url, { timeout: 30000, follow: 10, compress: true });
  if (!r.ok) throw buildHttpStatusError(r.status);
  return r.json();
}

async function fetchXtreamChannels({ source_server, source_username, source_password }) {
  const authUrl = buildPlayerApiUrl(source_server, source_username, source_password);
  const auth = await fetchJson(authUrl);
  if (!auth?.user_info?.auth || String(auth.user_info.auth) !== '1') {
    throw new Error('Provider authentication failed. Please verify server, username, and password.');
  }

  const [categories, streams] = await Promise.all([
    fetchJson(buildPlayerApiUrl(source_server, source_username, source_password, 'get_live_categories')),
    fetchJson(buildPlayerApiUrl(source_server, source_username, source_password, 'get_live_streams')),
  ]);

  const catMap = new Map((Array.isArray(categories) ? categories : []).map(c => [String(c.category_id), c.category_name || 'Other']));
  const channelRows = (Array.isArray(streams) ? streams : []).map((s, idx) => ({
    name: s.name || s.stream_display_name || `Channel ${idx + 1}`,
    url: s.stream_url || s.direct_source || '',
    duration: -1,
    tvg_id: s.epg_channel_id || '',
    tvg_name: s.name || '',
    tvg_logo: s.stream_icon || '',
    grp: catMap.get(String(s.category_id)) || s.category_name || 'Other',
    epg_id: s.epg_channel_id || '',
    enabled: 1,
  })).filter(ch => ch.url);

  return { authUrl, channels: channelRows };
}

module.exports = { buildPlayerApiUrl, fetchXtreamChannels };
