const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const scheduler = require('../scheduler');

const CHECK_EVERY = 15 * 60 * 1000;

function nextRun(last, hours) {
  if (!last) return null;
  const date = new Date(`${last}Z`);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + hours * 3600000).toISOString();
}

function schedule(hours) {
  return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
}

router.get('/tasks', requireAuth, (req, res) => {
  const runtime = scheduler.getTaskStatuses();
  const tasks = [];
  const schedulerTask = runtime.scheduler;
  tasks.push({
    id: 'scheduler', name: 'Auto-refresh scheduler', type: 'system', schedule: 'Every 15 minutes',
    enabled: true, status: schedulerTask.status, last_run: schedulerTask.last_run,
    next_run: schedulerTask.next_run || new Date(Date.now() + CHECK_EVERY).toISOString(),
    duration_ms: schedulerTask.duration_ms,
  });

  db.prepare(`SELECT id, name, refresh_interval, last_refreshed FROM playlists
              WHERE user_id = ? AND auto_refresh = 1 ORDER BY name COLLATE NOCASE`).all(req.user.id)
    .forEach(pl => {
      const run = runtime.jobs[`playlist:${pl.id}`] || {};
      tasks.push({
        id: `playlist:${pl.id}`, name: `Playlist refresh: ${pl.name}`, type: 'playlist',
        resource_id: pl.id, schedule: schedule(pl.refresh_interval || 24), enabled: true,
        status: run.status || (pl.last_refreshed ? 'success' : 'idle'), last_run: run.last_run || (pl.last_refreshed ? new Date(`${pl.last_refreshed}Z`).toISOString() : null),
        next_run: run.next_run || nextRun(pl.last_refreshed, pl.refresh_interval || 24),
        duration_ms: run.duration_ms || null,
      });
    });

  db.prepare(`SELECT id, name, refresh_interval, last_refreshed FROM epg_sources
              WHERE user_id = ? AND auto_refresh = 1 AND url IS NOT NULL ORDER BY name COLLATE NOCASE`).all(req.user.id)
    .forEach(source => {
      const run = runtime.jobs[`epg:${source.id}`] || {};
      tasks.push({
        id: `epg:${source.id}`, name: `EPG refresh: ${source.name}`, type: 'epg',
        resource_id: source.id, schedule: schedule(source.refresh_interval || 24), enabled: true,
        status: run.status || (source.last_refreshed ? 'success' : 'idle'), last_run: run.last_run || (source.last_refreshed ? new Date(`${source.last_refreshed}Z`).toISOString() : null),
        next_run: run.next_run || nextRun(source.last_refreshed, source.refresh_interval || 24),
        duration_ms: run.duration_ms || null,
      });
    });

  res.json({ generated_at: new Date().toISOString(), check_interval_ms: CHECK_EVERY, tasks });
});

module.exports = router;
