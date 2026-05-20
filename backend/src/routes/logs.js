const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const logger = require('../logger');
const { version } = require('../../package.json');

router.use(requireAuth);

router.get('/', (req, res) => {
  const level = req.query.level || '';
  const category = req.query.category || '';
  const search = req.query.search || '';
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  const clauses = [];
  const params = [];
  if (level) { clauses.push('level = ?'); params.push(level); }
  if (category) { clauses.push('category = ?'); params.push(category); }
  if (search) { clauses.push('(message LIKE ? OR metadata LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM app_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    .map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));
  res.json(rows.map(logger.sanitize));
});

router.get('/export', (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'txt';
  const recent = db.prepare("SELECT * FROM app_logs ORDER BY id DESC LIMIT 1000").all();
  const warnings = db.prepare("SELECT * FROM app_logs WHERE level IN ('warn','error') ORDER BY id DESC LIMIT 200").all();
  const health = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    playlists: db.prepare('SELECT COUNT(*) c FROM playlists').get().c,
    epg_sources: db.prepare('SELECT COUNT(*) c FROM epg_sources').get().c,
    scraper_channels: db.prepare('SELECT COUNT(*) c FROM scraper_channels').get().c,
  };

  const payload = {
    stationarr_version: version,
    export_timestamp: new Date().toISOString(),
    health,
    recent_warnings_errors: warnings.map(r => logger.sanitize({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })),
    recent_app_logs: recent.map(r => logger.sanitize({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })),
  };

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(payload, null, 2));
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const lines = [];
  lines.push(`Stationarr version: ${payload.stationarr_version}`);
  lines.push(`Export timestamp: ${payload.export_timestamp}`);
  lines.push(`Health: ${JSON.stringify(payload.health)}`);
  lines.push('--- Recent warnings/errors ---');
  payload.recent_warnings_errors.forEach(l => lines.push(`[${l.ts}] [${l.level}] [${l.category}] ${l.message}`));
  lines.push('--- Recent app logs ---');
  payload.recent_app_logs.forEach(l => lines.push(`[${l.ts}] [${l.level}] [${l.category}] ${l.message}`));
  res.send(lines.join('\n'));
});

module.exports = router;
