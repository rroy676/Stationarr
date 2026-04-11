require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : '*' }));
app.use(express.json({ limit: '20mb' }));

const apiLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/channels',  require('./routes/channels'));
app.use('/api/epg',       require('./routes/epg'));
app.use('/api/serve',     require('./routes/serve'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/guide',     require('./routes/guide'));
app.use('/api/scraper',   require('./routes/scraper'));

// Xtream-compatible API — mounted at root
app.use('/', require('./routes/xtream'));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

// Serve frontend (production)
const DIST = path.join(__dirname, '../public');
const fs   = require('fs');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Stationarr running on http://localhost:${PORT}`);
  // Start background auto-refresh scheduler
  require('./scheduler').start();
});
