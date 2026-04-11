const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

router.use(requireAuth, requireAdmin);

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
           COUNT(DISTINCT p.id) as playlist_count,
           COUNT(DISTINCT c.id) as channel_count
    FROM users u
    LEFT JOIN playlists p ON p.user_id = u.id
    LEFT JOIN channels  c ON c.playlist_id = p.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// PATCH /api/admin/users/:id — toggle admin / reset password
router.patch('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  // Prevent de-admining yourself
  if (req.body.is_admin === false && user.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot remove your own admin status' });
  }

  const updates = {};
  if (req.body.is_admin !== undefined) updates.is_admin = req.body.is_admin ? 1 : 0;
  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    updates.password = bcrypt.hashSync(req.body.password, 12);
  }

  if (!Object.keys(updates).length) return res.json(user);

  const set = Object.keys(updates).map(k => `${k}=@${k}`).join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id=@id`).run({ ...updates, id: user.id });
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  res.json({
    users:     db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    playlists: db.prepare('SELECT COUNT(*) as c FROM playlists').get().c,
    channels:  db.prepare('SELECT COUNT(*) as c FROM channels').get().c,
    epg_sources: db.prepare('SELECT COUNT(*) as c FROM epg_sources').get().c,
  });
});

// POST /api/admin/users — create user directly (registration may be closed)
router.post('/users', (req, res) => {
  const { username, email, password, is_admin } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password min 8 chars' });

  try {
    const result = db.prepare(
      'INSERT INTO users (username, email, password, is_admin) VALUES (?,?,?,?)'
    ).run(username.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 12), is_admin ? 1 : 0);
    res.status(201).json(db.prepare('SELECT id, username, email, is_admin, created_at FROM users WHERE id=?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already taken' });
    throw e;
  }
});

module.exports = router;
