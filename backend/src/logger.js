const db = require('./db');

const LOG_RETENTION = Number(process.env.LOG_RETENTION || 5000);
const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const VALID_CATEGORIES = new Set(['system', 'playlist', 'scheduler', 'epg', 'scraper', 'auth', 'update']);

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  out = out.replace(/(password|passwd|pwd|api[_-]?key|token|jwt|cookie|smtp[_-]?password|tailscale[_-]?auth[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  out = out.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[REDACTED_QUERY]');
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  out = out.replace(/(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, '[REDACTED]');
  return out;
}

function sanitize(value) {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) {
      if (/(password|api[_-]?key|token|jwt|cookie|smtp|tailscale|secret|source_url|url)/i.test(k)) {
        o[k] = '[REDACTED]';
      } else {
        o[k] = sanitize(v);
      }
    }
    return o;
  }
  return value;
}

function log({ level = 'info', category = 'system', message, metadata = null }) {
  try {
    if (!message) return;
    const safeLevel = VALID_LEVELS.has(level) ? level : 'info';
    const safeCategory = VALID_CATEGORIES.has(category) ? category : 'system';
    const cleanMessage = sanitizeString(String(message));
    const cleanMetadata = metadata ? JSON.stringify(sanitize(metadata)) : null;
    db.prepare('INSERT INTO app_logs (ts, level, category, message, metadata) VALUES (datetime(\'now\'), ?, ?, ?, ?)')
      .run(safeLevel, safeCategory, cleanMessage, cleanMetadata);
    db.prepare('DELETE FROM app_logs WHERE id NOT IN (SELECT id FROM app_logs ORDER BY id DESC LIMIT ?)').run(LOG_RETENTION);
  } catch (_) {
    // never block app flows
  }
}

const logger = {
  debug: (category, message, metadata) => log({ level: 'debug', category, message, metadata }),
  info: (category, message, metadata) => log({ level: 'info', category, message, metadata }),
  warn: (category, message, metadata) => log({ level: 'warn', category, message, metadata }),
  error: (category, message, metadata) => log({ level: 'error', category, message, metadata }),
  sanitize,
};

module.exports = logger;
