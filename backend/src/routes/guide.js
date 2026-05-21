const router = require('express').Router();
const db     = require('../db');
const requireAuth = require('../middleware/auth');
const { readProgrammes } = require('../utils/epg-reader');
const logger = require('../logger');

router.use(requireAuth);

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;
const VALID_PAGE_SIZES = new Set([25, 50, 100, 200]);
const DEFAULT_WINDOW_HOURS = 24;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

router.get('/:playlist_id', async (req, res) => {
  const playlistId = Number.parseInt(req.params.playlist_id, 10);
  if (!playlistId) return res.status(400).json({ error: 'playlist_id required' });

  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  const page = parsePositiveInt(req.query.page, 1);
  const requestedPageSize = parsePositiveInt(req.query.page_size, DEFAULT_PAGE_SIZE);
  const pageSize = VALID_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;
  const group = typeof req.query.group === 'string' ? req.query.group : '__all__';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 60000);
  const defaultEnd = new Date(defaultStart.getTime() + DEFAULT_WINDOW_HOURS * 3600000);
  const from = parseDate(req.query.start, defaultStart);
  const to = parseDate(req.query.end, defaultEnd);

  const where = ['playlist_id = ?', 'enabled = 1'];
  const args = [playlistId];

  if (group && group !== '__all__') {
    where.push('grp = ?');
    args.push(group);
  }

  if (q) {
    where.push('(LOWER(name) LIKE ? OR LOWER(tvg_id) LIKE ? OR LOWER(epg_id) LIKE ? OR LOWER(backup_epg_id) LIKE ?)');
    const like = `%${q.toLowerCase()}%`;
    args.push(like, like, like, like);
  }

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as total FROM channels WHERE ${whereSql}`).get(...args)?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const channels = db.prepare(
    `SELECT * FROM channels WHERE ${whereSql} ORDER BY ord ASC, id ASC LIMIT ? OFFSET ?`
  ).all(...args, pageSize, offset);

  const sources = db.prepare(
    'SELECT * FROM epg_sources WHERE user_id = ? AND cache_path IS NOT NULL ORDER BY priority ASC, id ASC'
  ).all(req.user.id);

  const epgIds = [...new Set([
    ...channels.map(c => c.epg_id).filter(Boolean),
    ...channels.map(c => c.backup_epg_id).filter(Boolean),
  ])];

  const cacheKey = JSON.stringify({
    playlistId,
    page: safePage,
    pageSize,
    group,
    q: q.toLowerCase(),
    start: from.toISOString(),
    end: to.toISOString(),
    ids: epgIds,
  });
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return res.json(cached.data);

  const t0 = Date.now();
  const allProgs = new Map();
  epgIds.forEach(id => allProgs.set(id, []));

  for (const src of sources) {
    if (!epgIds.length) break;
    try {
      const results = await readProgrammes(src.cache_path, epgIds, { from, to, max: 50 });
      results.forEach((progs, epgId) => {
        const existing = allProgs.get(epgId) || [];
        const startKeys = new Set(existing.map(p => p.start?.getTime()));
        const deduped = progs.filter(p => !startKeys.has(p.start?.getTime()));
        allProgs.set(epgId, [...existing, ...deduped]);
      });
    } catch (e) {
      logger.warn('epg', 'Guide EPG source read failed', { sourceId: src.id, sourceName: src.name, error: e.message });
    }
  }

  const getProgs = (ch) => {
    const primary = ch.epg_id ? (allProgs.get(ch.epg_id) || []) : [];
    const backup = ch.backup_epg_id ? (allProgs.get(ch.backup_epg_id) || []) : [];
    return primary.length > 0 ? primary : backup;
  };

  const result = {
    from: from.toISOString(),
    to: to.toISOString(),
    page: safePage,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    count: channels.length,
    channels: channels.map(ch => ({
      id: ch.id,
      name: ch.name,
      tvg_id: ch.tvg_id || '',
      tvg_logo: ch.tvg_logo || '',
      epg_id: ch.epg_id || '',
      backup_epg_id: ch.backup_epg_id || '',
      grp: ch.grp,
      timeshift: ch.timeshift || 0,
      programmes: getProgs(ch)
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map(p => ({
          title: p.title,
          subtitle: p.subtitle || '',
          desc: p.desc || '',
          category: p.category || '',
          start: p.start?.toISOString() || null,
          stop: p.stop?.toISOString() || null,
        })),
    })),
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });
  for (const [k, v] of cache) if (Date.now() - v.ts > CACHE_TTL * 2) cache.delete(k);

  const elapsed = Date.now() - t0;
  logger.info('epg', 'Guide page loaded', {
    playlistId,
    page: safePage,
    pageSize,
    total,
    channelsReturned: channels.length,
    epgIdCount: epgIds.length,
    sourceCount: sources.length,
    from: from.toISOString(),
    to: to.toISOString(),
    elapsedMs: elapsed,
    filteredByGroup: group !== '__all__',
    hasQuery: Boolean(q),
  });

  if (elapsed > 2000 || total > 5000) {
    logger.warn('epg', 'Heavy guide load detected', {
      playlistId,
      elapsedMs: elapsed,
      totalChannels: total,
      pageSize,
      page: safePage,
      epgIdCount: epgIds.length,
    });
  }

  res.json(result);
});

router.delete('/cache', (req, res) => {
  cache.clear();
  res.json({ ok: true });
});

function clearCache() { cache.clear(); }
module.exports = router;
module.exports.clearCache = clearCache;
