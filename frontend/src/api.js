const BASE = '/api';

function token() {
  return localStorage.getItem('token');
}

async function request(method, path, body, raw = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers['Authorization'] = `Bearer ${token()}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }

  if (raw) return res;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const put  = (path, body)  => request('PUT',    path, body);
const del  = (path)        => request('DELETE', path);

export const auth = {
  login:    (body) => post('/auth/login',    body),
  register: (body) => post('/auth/register', body),
  me:       ()     => get('/auth/me'),
  password: (body) => put('/auth/password',  body),
};

export const playlists = {
  list:   ()         => get('/playlists'),
  get:    (id)       => get(`/playlists/${id}`),
  create: (body)     => post('/playlists',    body),
  update: (id, body) => put(`/playlists/${id}`, body),
  remove:      (id)       => del(`/playlists/${id}`),
  regenXtream: (id)       => post(`/playlists/${id}/regen-xtream`),
  import: (id, body) => post(`/playlists/${id}/import`, body),
};

export const channels = {
  list:    (playlistId) => get(`/channels?playlist_id=${playlistId}`),
  create:  (body)       => post('/channels',        body),
  update:  (id, body)   => put(`/channels/${id}`,   body),
  remove:  (id)         => del(`/channels/${id}`),
  reorder: (body)       => post('/channels/reorder', body),
  bulk:    (body)       => post('/channels/bulk',    body),
};

export const epg = {
  list:       ()          => get('/epg'),
  create:     (body)      => post('/epg',              body),
  update:     (id, body)  => put(`/epg/${id}`,         body),
  remove:     (id)        => del(`/epg/${id}`),
  channels:   (id)        => get(`/epg/${id}/channels`),
  fetch:      (id)        => post(`/epg/${id}/fetch`),
  upload:     (id, body)  => post(`/epg/${id}/upload`, body),
  refresh:    (id)        => post(`/epg/${id}/refresh`),
  autoMatch:  (body)      => post('/epg/auto-match',   body),
  clearCache:  (id)        => del(`/epg/${id}/cache`),
  reorder:    (body)       => post('/epg/reorder', body),
  programmes: (epgId)     => get(`/epg/programmes?epg_id=${encodeURIComponent(epgId)}`),
  fetchStream: (id)        => `/api/epg/${id}/fetch-stream`,  // returns SSE URL
};

const patch = (path, body) => request('PATCH', path, body);

export const admin = {
  stats:      ()         => get('/admin/stats'),
  users:      ()         => get('/admin/users'),
  createUser: (body)     => post('/admin/users',       body),
  updateUser: (id, body) => patch(`/admin/users/${id}`, body),
  deleteUser: (id)       => del(`/admin/users/${id}`),
};

export const playlists_extra = {
  clone: (id, body) => post(`/playlists/${id}/clone`, body),
};

export const guide = {
  load:         (playlist_id, hours = 6, from_offset = 0) =>
    get(`/guide?playlist_id=${playlist_id}&hours=${hours}&from_offset=${from_offset}`),
  clearCache:   () => del('/guide/cache'),
};

export const scraper = {
  status:      ()         => get('/scraper/status'),
  channels:    ()         => get('/scraper/channels'),
  addChannel:  (body)     => post('/scraper/channels',     body),
  removeChannel:(id)      => del(`/scraper/channels/${id}`),
  toggleChannel:(id, body)=> request('PATCH', `/scraper/channels/${id}`, body),
  search:      (q, country) => get(`/scraper/search?q=${encodeURIComponent(q || '')}&country=${encodeURIComponent(country || '')}`),
  sites:       ()         => get('/scraper/sites'),
  guideXmlUrl: ()         => '/api/scraper/guide.xml',
  runStream:   ()         => '/api/scraper/run',  // SSE
};
