const BASE = '/api';
const DEFAULT_STALE_SESSION_MESSAGE = 'Your session is no longer valid. Please log in again. If the database was reset, you may need to recreate your user account.';

function token() {
  return localStorage.getItem('token');
}

async function request(method, path, body, raw = false) {
  const currentToken = token();
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({}));
      const message = data.error || data.message || 'Unauthorized';
      const isStaleToken = data.code === 'STALE_TOKEN';
      const isAuthFormRequest = path === '/auth/login' || path === '/auth/register';

      if (!isAuthFormRequest && (currentToken || isStaleToken)) {
        localStorage.removeItem('token');
        sessionStorage.setItem('auth_error', isStaleToken ? (data.error || DEFAULT_STALE_SESSION_MESSAGE) : message);
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }

      throw new Error(isStaleToken ? (data.error || DEFAULT_STALE_SESSION_MESSAGE) : message);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const message = data.error || data.message || 'Unauthorized';
    const isStaleToken = data.code === 'STALE_TOKEN';
    const isAuthFormRequest = path === '/auth/login' || path === '/auth/register';

    if (!isAuthFormRequest && (currentToken || isStaleToken)) {
      localStorage.removeItem('token');
      sessionStorage.setItem('auth_error', isStaleToken ? (data.error || DEFAULT_STALE_SESSION_MESSAGE) : message);
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    throw new Error(isStaleToken ? (data.error || DEFAULT_STALE_SESSION_MESSAGE) : message);
  }

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
  regenCombinedToken: () => post('/playlists/combined-token/regenerate'),
  import: (id, body) => post(`/playlists/${id}/import`, body),
  refresh: (id)       => post(`/playlists/${id}/refresh`),
};

export const channels = {
  list:    (playlistId, params = {}) => {
    const query = new URLSearchParams({ playlist_id: String(playlistId) });
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return get(`/channels?${query.toString()}`);
  },
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
  load: (playlistId, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return get(`/guide/${playlistId}?${query.toString()}`);
  },
  clearCache: () => del('/guide/cache'),
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

export const backup = {
  download: () => {
    const token = localStorage.getItem('token');
    const a = document.createElement('a');
    a.href = `/api/backup?token=${token}`;
    a.download = `stationarr-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  },
  restore: (body) => post('/backup/restore', body),
};


export const logs = {
  list: (q = {}) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, v); });
    params.set('limit', q.limit || 200);
    return get('/logs?' + params.toString());
  },
  exportFile: (format = 'txt') => request('GET', `/logs/export?format=${format}`, undefined, true),
};
