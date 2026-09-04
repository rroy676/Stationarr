require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

function getPackageVersion() {
  const packagePaths = [
    path.join(__dirname, '../../package.json'),
    path.join(__dirname, '../package.json'),
  ];

  for (const packagePath of packagePaths) {
    if (!fs.existsSync(packagePath)) continue;

    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (packageJson.name === 'stationarr' && packageJson.version) {
      return packageJson.version;
    }
  }

  return null;
}

const version = process.env.APP_VERSION || getPackageVersion() || 'unknown';

const app  = express();
const PORT = process.env.PORT || 3000;
const trustProxy = String(process.env.TRUST_PROXY || '').toLowerCase();

if (trustProxy === 'true' || trustProxy === '1') {
  app.set('trust proxy', 1);
}

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
app.use('/api/backup',    require('./routes/backup'));
app.use('/api/scraper',   require('./routes/scraper'));
app.use('/api/logs',      require('./routes/logs'));
app.use('/api/activity',  require('./routes/activity'));

// Xtream-compatible API — mounted at root
app.use('/', require('./routes/xtream'));

app.get('/api/health', (_req, res) => res.json({ ok: true, version }));

// Serve frontend (production)
const DIST = path.join(__dirname, '../public');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

if (require.main === module) app.listen(PORT, () => {
  console.log(`Stationarr running on http://localhost:${PORT}`);
  logger.info('system', 'Stationarr startup', { port: PORT, version });
  // Start background auto-refresh scheduler
  require('./scheduler').start();
  // Queue existing stale guide indexes for cached EPG sources
  require('./utils/guide-indexer').queueStaleGuideIndexes();
});

module.exports = app;
