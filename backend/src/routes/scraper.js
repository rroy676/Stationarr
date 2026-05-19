const router = require('express').Router();
const db     = require('../db');
const requireAuth = require('../middleware/auth');
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');
const { exec, spawn } = require('child_process');

const DATA_DIR      = process.env.DATA_DIR || './data';
const SCRAPER_URL   = process.env.SCRAPER_URL || 'http://epg:3000';
const CHANNELS_PATH = process.env.SCRAPER_CHANNELS_PATH || path.join(DATA_DIR, 'scraper', 'channels.xml');
const EPG_SITES_DIR = process.env.EPG_SITES_DIR || '/epg/sites';
const EPG_SITES_REMOTE_BASE = process.env.EPG_SITES_REMOTE_BASE || 'https://raw.githubusercontent.com/iptv-org/epg/master/sites';
const SITE_DEF_CACHE_TTL_MS = Number(process.env.EPG_SITES_CACHE_TTL_MS || (6 * 60 * 60 * 1000));
const siteDefCache = new Map();

function getConfiguredChannelCountFromXML() {
  if (!fs.existsSync(CHANNELS_PATH)) return 0;
  const xml = fs.readFileSync(CHANNELS_PATH, 'utf8');
  const matches = xml.match(/<channel\b/g);
  return matches ? matches.length : 0;
}

async function getGuideStats(scraperUrl) {
  try {
    const r = await fetch(`${scraperUrl}/guide.xml`, { timeout: 30000 });
    if (!r.ok) return null;
    const xml = await r.text();
    const channelCount = (xml.match(/<channel\b/g) || []).length;
    const programmeCount = (xml.match(/<programme\b/g) || []).length;
    return { channelCount, programmeCount };
  } catch {
    return null;
  }
}

// ── Status ────────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  const enabledCount = db.prepare(
    'SELECT COUNT(*) AS n FROM scraper_channels WHERE user_id = ? AND enabled = 1'
  ).get(req.user.id).n || 0;
  const configuredCount = getConfiguredChannelCountFromXML();

  try {
    const r = await fetch(`${SCRAPER_URL}/guide.xml`, { method: 'HEAD', timeout: 5000 });
    const guideSize = r.headers.get('content-length');
    res.json({
      online:      true,
      url:         SCRAPER_URL,
      guide_url:   `${SCRAPER_URL}/guide.xml`,
      guide_size:  guideSize ? parseInt(guideSize) : null,
      enabled_channel_count: enabledCount,
      configured_channel_count: configuredCount,
      no_channels_configured: configuredCount === 0,
    });
  } catch {
    res.json({
      online: false,
      url: SCRAPER_URL,
      guide_url: null,
      guide_size: null,
      enabled_channel_count: enabledCount,
      configured_channel_count: configuredCount,
      no_channels_configured: configuredCount === 0,
    });
  }
});

// ── Channel list for this user ────────────────────────────────────
router.get('/channels', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM scraper_channels WHERE user_id = ? ORDER BY site, name').all(req.user.id));
});

// ── Add channel ───────────────────────────────────────────────────
router.post('/channels', requireAuth, async (req, res) => {
  const { xmltv_id, site, site_id, name, lang, channel_id } = req.body;
  if (!site || !name) {
    return res.status(400).json({ error: 'site and name required' });
  }

  const resolved = await resolveScraperChannelDefinition({ site, xmltv_id, site_id, name, channel_id });
  if (!resolved.ok) {
    return res.status(422).json({
      error: resolved.error,
      hint: 'Pick a different site for this channel, or update scraper definitions so this site/channel pair exists in iptv-org/epg.',
    });
  }

  // Check not duplicate
  const exists = db.prepare('SELECT id FROM scraper_channels WHERE user_id = ? AND xmltv_id = ? AND site = ?').get(req.user.id, resolved.xmltv_id, site);
  if (exists) return res.status(409).json({ error: 'Channel already added for this site' });

  const result = db.prepare(
    'INSERT INTO scraper_channels (user_id, xmltv_id, site, site_id, name, lang) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, resolved.xmltv_id, site, resolved.site_id, name, lang || 'en');

  const ch = db.prepare('SELECT * FROM scraper_channels WHERE id = ?').get(result.lastInsertRowid);
  writeChannelsXML(req.user.id);
  res.status(201).json(ch);
});

// ── Remove channel ────────────────────────────────────────────────
router.delete('/channels/:id', requireAuth, (req, res) => {
  const ch = db.prepare('SELECT * FROM scraper_channels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM scraper_channels WHERE id = ?').run(ch.id);
  writeChannelsXML(req.user.id);
  res.json({ ok: true });
});

// ── Toggle channel enabled ────────────────────────────────────────
router.patch('/channels/:id', requireAuth, (req, res) => {
  const ch = db.prepare('SELECT * FROM scraper_channels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : ch.enabled;
  db.prepare('UPDATE scraper_channels SET enabled = ? WHERE id = ?').run(enabled, ch.id);
  writeChannelsXML(req.user.id);
  res.json(db.prepare('SELECT * FROM scraper_channels WHERE id = ?').get(ch.id));
});

// ── Get current channels.xml content ─────────────────────────────
router.get('/channels.xml', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  if (fs.existsSync(CHANNELS_PATH)) {
    res.send(fs.readFileSync(CHANNELS_PATH, 'utf8'));
  } else {
    res.send(buildChannelsXML([]));
  }
});

// ── Search iptv-org channel database ─────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
  const { q, country } = req.query;
  if (!q && !country) return res.status(400).json({ error: 'q or country required' });

  try {
    // Fetch channel list from iptv-org database
    const url = 'https://raw.githubusercontent.com/iptv-org/database/master/data/channels.csv';
    const r   = await fetch(url, { timeout: 15000 });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const csv = await r.text();

    const channels = parseCSV(csv).filter(ch => {
      if (country && ch.country?.toLowerCase() !== country.toLowerCase()) return false;
      if (q) {
        const query = q.toLowerCase();
        return ch.name?.toLowerCase().includes(query) || ch.id?.toLowerCase().includes(query);
      }
      return true;
    }).slice(0, 50);

    res.json(channels);
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch channel database: ' + e.message });
  }
});

// ── List available scraper sites ─────────────────────────────────
router.get('/sites', requireAuth, async (req, res) => {
  // Return curated list of well-known sites with country info
  res.json(KNOWN_SITES);
});

// ── Proxy guide.xml from scraper ──────────────────────────────────
router.get('/guide.xml', requireAuth, async (req, res) => {
  const configuredCount = getConfiguredChannelCountFromXML();

  try {
    const r = await fetch(`${SCRAPER_URL}/guide.xml`, { timeout: 30000 });
    if (!r.ok) {
      if (r.status === 404 && configuredCount === 0) {
        return res.status(404).json({
          error: 'No guide generated yet because no scraper channels are selected.',
          code: 'NO_SCRAPER_CHANNELS',
          configured_channel_count: configuredCount,
        });
      }
      throw new Error('HTTP ' + r.status);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    r.body.pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'Scraper unavailable: ' + e.message });
  }
});

// ── Write channels.xml to disk ────────────────────────────────────
function writeChannelsXML(userId) {
  const channels = db.prepare(
    'SELECT * FROM scraper_channels WHERE user_id = ? AND enabled = 1 ORDER BY site, name'
  ).all(userId);

  const xml = buildChannelsXML(channels);
  const dir  = path.dirname(CHANNELS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CHANNELS_PATH, xml, 'utf8');
}

function buildChannelsXML(channels) {
  const items = channels.map(ch =>
    `  <channel site="${esc(ch.site)}" lang="${esc(ch.lang)}" xmltv_id="${esc(ch.xmltv_id)}" site_id="${esc(ch.site_id)}">${esc(ch.name)}</channel>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by Stationarr - do not edit manually -->\n<channels>\n${items}\n</channels>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseCSV(text) {
  const lines  = text.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj  = {};
    header.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  }).filter(ch => ch.id && ch.name);
}

async function resolveScraperChannelDefinition({ site, xmltv_id, site_id, name, channel_id }) {
  // Preserve site-specific definition when client already provides both fields
  if (xmltv_id && site_id) return { ok: true, xmltv_id, site_id };

  const defs = await loadSiteChannelDefinitions(site);
  if (!defs.length) {
    return {
      ok: false,
      error: `No scraper channel definitions found for site "${site}" (checked ${EPG_SITES_DIR} and ${EPG_SITES_REMOTE_BASE}).`,
    };
  }

  const norm = (v) => String(v || '').trim().toLowerCase();
  const byId = defs.find(d => norm(d.xmltv_id) === norm(xmltv_id));
  if (byId) return { ok: true, xmltv_id: byId.xmltv_id, site_id: byId.site_id };

  const byChannelId = defs.find(d => norm(d.channel_id) === norm(channel_id));
  if (byChannelId) return { ok: true, xmltv_id: byChannelId.xmltv_id, site_id: byChannelId.site_id };

  const byName = defs.find(d => norm(d.name) === norm(name));
  if (byName) return { ok: true, xmltv_id: byName.xmltv_id, site_id: byName.site_id };

  return { ok: false, error: `No valid site_id mapping found for "${name}" on ${site}.` };
}

async function loadSiteChannelDefinitions(site) {
  const cacheKey = String(site || '').toLowerCase();
  const now = Date.now();
  const cached = siteDefCache.get(cacheKey);
  if (cached && (now - cached.ts) < SITE_DEF_CACHE_TTL_MS) return cached.defs;

  const xml = await readSiteChannelsXML(site);
  const defs = xml ? parseSiteChannelsXML(xml) : [];
  siteDefCache.set(cacheKey, { ts: now, defs });
  return defs;
}

async function readSiteChannelsXML(site) {
  const safe = String(site || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const candidates = [
    path.join(EPG_SITES_DIR, safe + '.channels.xml'),
    path.join(EPG_SITES_DIR, safe, 'channels.xml'),
    path.join(EPG_SITES_DIR, safe + '.xml'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  }

  const remoteCandidates = [
    `${EPG_SITES_REMOTE_BASE}/${encodeURIComponent(safe)}.channels.xml`,
    `${EPG_SITES_REMOTE_BASE}/${encodeURIComponent(safe)}.xml`,
  ];
  for (const url of remoteCandidates) {
    try {
      const r = await fetch(url, { timeout: 10000 });
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

function parseSiteChannelsXML(xml) {
  const out = [];
  const regex = /<channel\b([^>]*)>([^<]*)<\/channel>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (!attrs.site_id || !attrs.xmltv_id) continue;
    out.push({
      site_id: attrs.site_id,
      xmltv_id: attrs.xmltv_id,
      channel_id: attrs.channel_id || '',
      name: (match[2] || '').trim(),
    });
  }
  return out;
}

function parseXmlAttrs(attrStr) {
  const attrs = {};
  const regex = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = regex.exec(attrStr)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

// Curated list of well-supported scraper sites
const KNOWN_SITES = [
  { site: 'tvguide.com',       countries: ['us'],          label: 'TV Guide (US)' },
  { site: 'tvtv.us',           countries: ['us'],          label: 'TVTV (US)' },
  { site: 'zap2it.com',        countries: ['us','ca'],     label: 'Zap2it (US/CA)' },
  { site: 'sky.com',           countries: ['gb'],          label: 'Sky (UK)' },
  { site: 'radiotimes.com',    countries: ['gb'],          label: 'Radio Times (UK)' },
  { site: 'bbc.co.uk',         countries: ['gb'],          label: 'BBC (UK)' },
  { site: 'telerama.fr',       countries: ['fr'],          label: 'Télérama (FR)' },
  { site: 'tvspielfilm.de',    countries: ['de'],          label: 'TV Spielfilm (DE)' },
  { site: 'movistarplus.es',   countries: ['es'],          label: 'Movistar+ (ES)' },
  { site: 'mediaset.it',       countries: ['it'],          label: 'Mediaset (IT)' },
  { site: 'tvgids.nl',         countries: ['nl'],          label: 'TVgids (NL)' },
  { site: 'horizon.tv',        countries: ['nl','be'],     label: 'Horizon TV (NL/BE)' },
  { site: 'tvprofil.net',      countries: ['rs','hr','ba'],label: 'TVProfil (RS/HR/BA)' },
  { site: 'tvcatchup.com',     countries: ['gb'],          label: 'TVCatchup (UK)' },
  { site: 'foxsports.com',     countries: ['us'],          label: 'Fox Sports (US)' },
  { site: 'espn.com',          countries: ['us'],          label: 'ESPN (US)' },
  { site: 'freeview.com.au',   countries: ['au'],          label: 'Freeview (AU)' },
  { site: 'tvnz.co.nz',        countries: ['nz'],          label: 'TVNZ (NZ)' },
  { site: 'canalplus.com',     countries: ['fr'],          label: 'Canal+ (FR)' },
  { site: 'teleguide.info',    countries: ['se','no','dk'],label: 'Teleguide (Scandinavia)' },
];

// ── Run scraper now (SSE stream of logs) ─────────────────────────
// EventSource can't send auth headers so token comes via query param
const jwt = require('jsonwebtoken');

router.get('/run', async (req, res) => {
  // Auth via query token
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).send('Unauthorized');
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).send('Invalid token'); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };
  const runLines = [];
  const pushRunLine = (line) => {
    const trimmed = (line || '').trim();
    if (!trimmed) return;
    runLines.push(trimmed);
    send({ type: 'log', msg: trimmed });
  };

  const scraperUrl = process.env.SCRAPER_URL || 'http://epg:3000';
  const configuredCount = getConfiguredChannelCountFromXML();
  if (configuredCount === 0) {
    send({ type: 'error', msg: 'No scraper channels are configured. Add and enable at least one channel before running.' });
    return res.end();
  }

  send({ type: 'log', msg: `Connecting to scraper at ${scraperUrl}...` });

  // Check scraper is reachable
  try {
    const check = await fetch(`${scraperUrl}/guide.xml`, { method: 'HEAD', timeout: 5000 });
    send({ type: 'log', msg: 'Scraper container is online.' });
  } catch (e) {
    send({ type: 'error', msg: `Cannot reach scraper at ${scraperUrl}. Is the epg container running? Error: ${e.message}` });
    return res.end();
  }

  // The iptv-org/epg container runs on a cron — we can trigger it by
  // calling its internal run endpoint if available, or use docker exec
  // Try docker exec first (requires docker socket mount)
  const { execFile } = require('child_process');

  // Find epg container name dynamically
  send({ type: 'log', msg: 'Looking for epg container...' });

  execFile('docker', ['ps', '--format', '{{.Names}}'], (err, stdout) => {
    if (err) {
      // docker not available — trigger via alternative method
      send({ type: 'log', msg: 'Docker CLI not available in container. Triggering via scraper API...' });
      triggerViaPoll(scraperUrl, send, res);
      return;
    }

    const containers = stdout.trim().split('\n');
    const epgContainer = containers.find(n => n.includes('epg'));

    if (!epgContainer) {
      send({ type: 'error', msg: 'No epg container found. Make sure the epg: service is running in docker-compose.' });
      return res.end();
    }

    send({ type: 'log', msg: `Found container: ${epgContainer}` });
    send({ type: 'log', msg: 'Starting scrape... this may take several minutes.' });

    const proc = spawn('docker', ['exec', '-w', '/epg', epgContainer, 'npm', 'run', 'grab', '--', '--channels=/epg/public/channels.xml']);

    proc.stdout.on('data', (d) => {
      d.toString().split('\n').forEach(pushRunLine);
    });
    proc.stderr.on('data', (d) => {
      d.toString().split('\n').forEach(pushRunLine);
    });
    proc.on('close', async (code) => {
      if (code === 0 || code === null) {
        const zeroProgramLines = runLines.filter(l => /\(0 programs\)/i.test(l));
        if (zeroProgramLines.length > 0) {
          send({ type: 'warning', msg: 'Scraper ran, but no programmes were found for the selected channels/source.' });
          send({ type: 'warning', msg: 'Try another scraper source/site for this channel.' });
          zeroProgramLines.slice(0, 5).forEach(l => send({ type: 'warning', msg: `↳ ${l}` }));
        }
        const stats = await getGuideStats(scraperUrl);
        if (stats) {
          send({ type: 'log', msg: `Generated guide.xml contains ${stats.channelCount} channel(s) and ${stats.programmeCount} programme(s).` });
          if (stats.channelCount > 0 && stats.programmeCount === 0) {
            send({ type: 'warning', msg: 'Scraper ran, but no programmes were found for the selected channels/source.' });
            send({ type: 'warning', msg: 'Try another scraper source/site for this channel.' });
          }
        }
        send({ type: 'done', msg: 'Scrape completed! Stationarr will now fetch the guide...' });
      } else {
        send({ type: 'error', msg: `Scraper exited with code ${code}` });
      }
      res.end();
    });
    proc.on('error', (err) => {
      send({ type: 'error', msg: `Failed to exec into container: ${err.message}` });
      res.end();
    });

    req.on('close', () => proc.kill());
  });
});

// Fallback: poll guide.xml for changes (when docker exec not available)
async function triggerViaPoll(scraperUrl, send, res) {
  send({ type: 'log', msg: 'Note: To enable real-time scraping, mount the Docker socket in docker-compose.yml:' });
  send({ type: 'log', msg: '  volumes:' });
  send({ type: 'log', msg: '    - /var/run/docker.sock:/var/run/docker.sock' });
  send({ type: 'log', msg: '' });
  send({ type: 'log', msg: 'For now, the scraper will run on its cron schedule (every 6 hours).' });
  send({ type: 'log', msg: 'The guide.xml is already accessible — fetching it now...' });
  send({ type: 'done', msg: 'Ready to fetch guide into Stationarr.' });
  res.end();
}

// ── Scraper run status (polling fallback) ────────────────────────
let lastRunStatus = { running: false, lastRun: null, lastResult: null };

router.get('/run-status', requireAuth, (req, res) => {
  res.json(lastRunStatus);
});

module.exports = router;
