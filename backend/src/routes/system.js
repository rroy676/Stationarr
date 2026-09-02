const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { version } = require('../../package.json');

const DATA_DIR = process.env.DATA_DIR || './data';
const CHANNELS_PATH = process.env.SCRAPER_CHANNELS_PATH || path.join(DATA_DIR, 'scraper', 'channels.xml');

function check(status, title, description, fix, action = null) {
  return { status, title, description, fix, action };
}

function latestFailure(category) {
  return db.prepare(`
    SELECT ts, message, metadata FROM app_logs
    WHERE category = ? AND level IN ('warn', 'error')
    ORDER BY id DESC LIMIT 1
  `).get(category);
}

router.get('/health', requireAuth, async (req, res) => {
  const checks = [];
  checks.push(check('ok', 'Stationarr version', `Stationarr v${process.env.APP_VERSION || version} is running.`, 'No action needed.'));
  let databaseOk = true;
  try {
    databaseOk = db.prepare('PRAGMA quick_check').get().quick_check === 'ok';
  } catch { databaseOk = false; }
  checks.push(databaseOk
    ? check('ok', 'Database writable', 'Stationarr can query its SQLite database.', 'No action needed.')
    : check('error', 'Database unavailable', 'Stationarr could not verify the SQLite database.', 'Check the data volume permissions and the application logs.'));

  let dataOk = true;
  try { fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK); } catch { dataOk = false; }
  checks.push(dataOk
    ? check('ok', 'Data directory writable', 'Stationarr can read and write its data directory.', 'No action needed.')
    : check('error', 'Data directory is not writable', 'Stationarr cannot write caches or generated scraper files.', 'Check DATA_DIR ownership and volume permissions.'));

  const playlistFailure = latestFailure('scheduler', req.user.id);
  checks.push(playlistFailure
    ? check('warning', 'Playlist refresh failure', `The latest playlist scheduler warning occurred at ${playlistFailure.ts}.`, 'Open Logs, inspect the source, and refresh the playlist after correcting its URL or credentials.', { label: 'Open Logs', href: '/logs' })
    : check('ok', 'Playlist refreshes', 'No recent playlist refresh failures were found.', 'No action needed.'));

  const epgFailure = latestFailure('epg', req.user.id);
  checks.push(epgFailure
    ? check('warning', 'EPG source failure', `The latest EPG warning occurred at ${epgFailure.ts}.`, 'Open EPG Sources, verify the source URL, and fetch it again.', { label: 'Open EPG Sources', href: '/settings', state: { openEpgSources: true } })
    : check('ok', 'EPG sources', 'No recent EPG source failures were found.', 'No action needed.'));

  const zeroProgrammes = db.prepare(`SELECT COUNT(*) AS n FROM epg_sources WHERE user_id = ? AND cache_path IS NOT NULL AND COALESCE(programme_count, 0) = 0`).get(req.user.id).n;
  checks.push(zeroProgrammes
    ? check('warning', 'EPG cache has no programmes', `${zeroProgrammes} cached EPG source(s) contain zero programme entries.`, 'Fetch the source again or verify that the provider supplies programme data.', { label: 'Open EPG Sources', href: '/settings', state: { openEpgSources: true } })
    : check('ok', 'EPG programme data', 'Cached EPG sources contain programme entries.', 'No action needed.'));

  const scraperConfigured = db.prepare('SELECT COUNT(*) AS n FROM scraper_channels WHERE user_id = ? AND enabled = 1').get(req.user.id).n;
  const guideExists = fs.existsSync(path.join(path.dirname(CHANNELS_PATH), 'guide.xml')) || fs.existsSync(path.join(DATA_DIR, 'scraper', 'guide.xml'));
  if (scraperConfigured && !guideExists) {
    checks.push(check('warning', 'guide.xml is missing', 'Scraper channels are configured, but no generated guide.xml was found locally.', 'Run the scraper sidecar or wait for its scheduled run, then fetch the guide.', { label: 'Open EPG Scraper', href: '/scraper' }));
  } else {
    checks.push(check('ok', 'Scraper guide file', scraperConfigured ? 'A scraper guide file is present.' : 'No scraper channels are configured.', scraperConfigured ? 'No action needed.' : 'Add scraper channels only if you need scraper-provided EPG data.', scraperConfigured ? null : { label: 'Open EPG Scraper', href: '/scraper' }));
  }

  const scraperUrl = process.env.SCRAPER_URL || 'http://epg:3000';
  let scraperOnline = false;
  let guideStats = null;
  try {
    const response = await fetch(`${scraperUrl}/guide.xml`, { timeout: 5000 });
    scraperOnline = response.ok || response.status === 404;
    if (response.ok) {
      const xml = await response.text();
      guideStats = {
        channels: (xml.match(/<channel\b/g) || []).length,
        programmes: (xml.match(/<programme\b/g) || []).length,
      };
    }
  } catch { /* an offline optional sidecar is reported below */ }
  if (scraperConfigured && !scraperOnline) {
    checks.push(check('warning', 'Scraper sidecar offline', 'Stationarr could not connect to the configured EPG scraper sidecar.', 'Start the scraper container and verify SCRAPER_URL.', { label: 'Open EPG Scraper', href: '/scraper' }));
  } else {
    checks.push(check('ok', 'Scraper sidecar online', scraperConfigured ? 'The EPG scraper sidecar responded.' : 'The scraper sidecar is not needed because no channels are configured.', 'No action needed.'));
  }
  if (guideStats && guideStats.programmes === 0) {
    checks.push(check('warning', 'Scraper guide has no programmes', `guide.xml contains ${guideStats.channels} channel(s) but zero programme entries.`, 'Check the selected scraper channels and upstream site support, then run the scraper.', { label: 'Open EPG Scraper', href: '/scraper' }));
  }
  if (scraperConfigured && !fs.existsSync('/var/run/docker.sock')) {
    checks.push(check('warning', 'Docker socket unavailable', 'The Docker socket is not mounted, so Run Now cannot trigger the scraper sidecar immediately.', 'Run the sidecar on its schedule or mount /var/run/docker.sock only on a trusted host.', { label: 'Open EPG Scraper', href: '/scraper' }));
  }
  if (String(process.env.REGISTRATION_OPEN || 'true').toLowerCase() !== 'false') {
    checks.push(check('warning', 'Registration is open', 'Anyone who can reach this instance can create an account.', 'Set REGISTRATION_OPEN=false after creating the accounts you need.', { label: 'Open Help', href: '/help' }));
  } else checks.push(check('ok', 'Registration is closed', 'New account registration is disabled.', 'No action needed.'));

  const baseUrl = process.env.BASE_URL || '';
  checks.push(!baseUrl
    ? check('warning', 'BASE_URL is not configured', 'Generated URLs default to localhost and may not work from other devices.', 'Set BASE_URL to the address clients use to reach Stationarr.')
    : !/^https?:\/\//i.test(baseUrl)
    ? check('warning', 'BASE_URL is invalid', 'Generated playlist URLs may not be reachable because BASE_URL is not an HTTP URL.', 'Set BASE_URL to the address clients use to reach Stationarr.')
    : check('ok', 'Generated URL configuration', baseUrl ? 'BASE_URL is configured with an HTTP URL.' : 'URLs use the current browser address.', 'No action needed.'));

  res.json({ ok: true, generated_at: new Date().toISOString(), checks });
});

module.exports = router;
