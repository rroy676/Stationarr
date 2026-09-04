const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const logger = require('../logger');

router.use(requireAuth);

// Read-only activity feed. Existing app_logs rows are returned with the
// activity vocabulary as a compatibility bridge for pre-history events.
router.get('/history', (req, res) => {
  const type = String(req.query.type || req.query.category || '').trim();
  const status = String(req.query.status || req.query.level || '').trim();
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size || req.query.limit || '25', 10) || 25, 1), 100);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const offset = (page - 1) * pageSize;
  const clauses = [];
  const params = [];
  if (type) { clauses.push('COALESCE(event_type, category) = ?'); params.push(type); }
  if (status) { clauses.push('COALESCE(status, level) = ?'); params.push(status); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM app_logs ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT id, ts, level, category, message, metadata,
      event_type, status, title, details
    FROM app_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

  const events = rows.map(row => {
    let parsedDetails = row.details || row.metadata;
    if (typeof parsedDetails === 'string') {
      try { parsedDetails = JSON.parse(parsedDetails); } catch { /* keep text */ }
    }
    return logger.sanitize({
      id: row.id,
      timestamp: row.ts,
      type: row.event_type || row.category,
      status: row.status || row.level,
      title: row.title || row.message,
      details: parsedDetails || null,
    });
  });

  res.json({ events, page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) });
});

module.exports = router;
