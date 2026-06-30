const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const db = require('../db');
const requireAuth = require('../middleware/auth');

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function generateCombinedSlug() {
  let slug;
  do {
    slug = nanoid(16);
  } while (db.prepare('SELECT id FROM users WHERE combined_slug = ?').get(slug));
  return slug;
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  if (process.env.REGISTRATION_OPEN === 'false') {
    return res.status(403).json({ error: 'Registration is closed' });
  }
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const hash = bcrypt.hashSync(password, 12);

  // First user becomes admin
  const isFirst = db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0;

  try {
    const result = db
      .prepare('INSERT INTO users (username, email, password, is_admin, combined_slug) VALUES (?,?,?,?,?)')
      .run(username.trim(), email.trim().toLowerCase(), hash, isFirst ? 1 : 0, generateCombinedSlug());

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ token: sign(user), user: { id: user.id, username: user.username, is_admin: user.is_admin } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    throw e;
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign(user), user: { id: user.id, username: user.username, is_admin: user.is_admin } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const { current, next: next_ } = req.body;
  if (!current || !next_) return res.status(400).json({ error: 'current and next password required' });
  if (next_.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(next_, 12), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
