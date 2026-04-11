const router = require('express').Router();
const db     = require('../db');
const requireAuth = require('../middleware/auth');
const { readProgrammes } = require('../utils/epg-reader');

router.use(requireAuth);

// Simple in-memory cache: key = `${playlistId}:${dateKey}` → { data, ts }
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

router.get('/', async (req, res) => {
  const { playlist_id, hours = 6, from_offset = 0 } = req.query;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });

  const pl = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(playlist_id, req.user.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  // Build time window
  const from = new Date();
  from.setMinutes(from.getMinutes() - 30, 0, 0);
  if (Number(from_offset)) from.setHours(from.getHours() + Number(from_offset));
  const to = new Date(from.getTime() + (Number(hours) + 1) * 3600000);

  // Cache key based on playlist + hour window
  const cacheKey = `${playlist_id}:${Math.floor(from.getTime() / (30 * 60000))}`;
  const cached   = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return res.json(cached.data);
  }

  const channels = db.prepare(
    'SELECT * FROM channels WHERE playlist_id = ? AND enabled = 1 ORDER BY ord ASC, id ASC'
  ).all(playlist_id);

  const sources = db.prepare(
    'SELECT * FROM epg_sources WHERE user_id = ? AND cache_path IS NOT NULL ORDER BY priority ASC, id ASC'
  ).all(req.user.id);

  // Collect all IDs we need to look up (primary + backup)
  const epgIds = [...new Set([
    ...channels.map(c => c.epg_id).filter(Boolean),
    ...channels.map(c => c.backup_epg_id).filter(Boolean),
  ])];
  const allProgs = new Map();
  epgIds.forEach(id => allProgs.set(id, []));

  // Read each cache file once for all channels
  for (const src of sources) {
    if (!epgIds.length) break;
    try {
      const results = await readProgrammes(src.cache_path, epgIds, { from, to, max: 25 });
      results.forEach((progs, epgId) => {
        const existing = allProgs.get(epgId) || [];
        // Deduplicate by start time
        const startKeys = new Set(existing.map(p => p.start?.getTime()));
        const newProgs  = progs.filter(p => !startKeys.has(p.start?.getTime()));
        allProgs.set(epgId, [...existing, ...newProgs]);
      });
    } catch (e) {
      console.error('[guide] Error reading', src.name, e.message);
    }
  }

  // For each channel: use primary epg_id programmes, fall back to backup_epg_id if primary empty
  const getProgs = (ch) => {
    const primary  = ch.epg_id      ? (allProgs.get(ch.epg_id)      || []) : [];
    const backup   = ch.backup_epg_id ? (allProgs.get(ch.backup_epg_id) || []) : [];
    return primary.length > 0 ? primary : backup;
  };

  // Sort: channels with EPG data first so progressive load shows useful content immediately
  const channelsWithEpg    = channels.filter(ch => getProgs(ch).length > 0);
  const channelsWithoutEpg = channels.filter(ch => getProgs(ch).length === 0);
  const sortedChannels = [...channelsWithEpg, ...channelsWithoutEpg];

  const result = {
    from:     from.toISOString(),
    to:       to.toISOString(),
    channels: sortedChannels.map(ch => ({
      id:             ch.id,
      name:           ch.name,
      tvg_logo:       ch.tvg_logo       || '',
      epg_id:         ch.epg_id         || '',
      backup_epg_id:  ch.backup_epg_id  || '',
      grp:            ch.grp,
      timeshift:      ch.timeshift || 0,
      programmes: getProgs(ch)
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map(p => ({
          title:    p.title,
          subtitle: p.subtitle || '',
          desc:     p.desc     || '',
          category: p.category || '',
          start:    p.start?.toISOString() || null,
          stop:     p.stop?.toISOString()  || null,
        })),
    })),
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });

  // Clean old cache entries
  for (const [k, v] of cache) {
    if (Date.now() - v.ts > CACHE_TTL * 2) cache.delete(k);
  }

  res.json(result);
});

// DELETE /api/guide/cache — invalidate guide cache (call after EPG refresh)
router.delete('/cache', (req, res) => {
  cache.clear();
  res.json({ ok: true });
});

function clearCache() { cache.clear(); }
module.exports = router;
module.exports.clearCache = clearCache;
