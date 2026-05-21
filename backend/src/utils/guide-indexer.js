const fs = require('fs');
const sax = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');
const db = require('../db');
const logger = require('../logger');

function setStatus(sourceId, status, message = null) {
  db.prepare('UPDATE epg_sources SET guide_index_status=?, guide_index_error=?, guide_index_updated=datetime(\'now\') WHERE id=?')
    .run(status, message, sourceId);
}

const pending = new Set();

function queueGuideIndex(sourceId, cachePath) {
  const key = String(sourceId);
  if (pending.has(key)) return;
  pending.add(key);
  setImmediate(() => buildGuideIndex(sourceId, cachePath).catch(() => {}).finally(() => pending.delete(key)));
}

function queueStaleGuideIndexes() {
  const stale = db.prepare(`
    SELECT id, cache_path
    FROM epg_sources
    WHERE cache_path IS NOT NULL
      AND cache_path != ''
      AND (guide_index_status IS NULL OR guide_index_status IN ('idle','failed'))
  `).all();
  stale.forEach(src => queueGuideIndex(src.id, src.cache_path));
  if (stale.length) logger.info('epg', 'Queued stale guide indexes on startup', { sourceCount: stale.length });
}

async function buildGuideIndex(sourceId, cachePath) {
  const start = Date.now();
  setStatus(sourceId, 'building', null);
  logger.info('epg', 'Guide index start', { sourceId });
  try {
    if (!cachePath || !fs.existsSync(cachePath)) throw new Error('EPG cache file not found');

    const del = db.prepare('DELETE FROM guide_programmes WHERE source_id = ?');
    const ins = db.prepare('INSERT INTO guide_programmes (source_id, epg_id, start, stop, title, subtitle, desc, category) VALUES (?,?,?,?,?,?,?,?)');

    db.transaction(() => del.run(sourceId))();

    const BATCH_SIZE = 1000;
    const flushBatch = db.transaction((rows) => {
      for (const r of rows) ins.run(sourceId, r.epgId, r.start, r.stop, r.title, r.subtitle, r.desc, r.category);
    });

    let count = 0;
    let batch = [];
    await new Promise((resolve, reject) => {
      const parser = sax.createStream(true);
      let inProg = false; let cur = null; let field = null;
      parser.on('opentag', (node) => {
        if (node.name === 'programme') {
          const epgId = String(node.attributes.channel || '').trim();
          const start = String(node.attributes.start || '');
          const stop = String(node.attributes.stop || '');
          if (!epgId || !start || !stop) return;
          inProg = true;
          cur = { epgId, start: parseXMLTVTime(start), stop: parseXMLTVTime(stop), title: '', subtitle: '', desc: '', category: '' };
        } else if (inProg && ['title','desc','category','sub-title'].includes(node.name)) field = node.name;
      });
      parser.on('text', (text) => {
        if (!inProg || !field || !cur) return;
        const t = text.trim(); if (!t) return;
        if (field === 'title') cur.title += t;
        if (field === 'desc') cur.desc += t;
        if (field === 'category') cur.category += t;
        if (field === 'sub-title') cur.subtitle += t;
      });
      parser.on('closetag', (name) => {
        if (['title','desc','category','sub-title'].includes(name)) field = null;
        if (name === 'programme' && inProg && cur) {
          if (cur.start && cur.stop) {
            batch.push({ epgId: cur.epgId, start: cur.start.toISOString(), stop: cur.stop.toISOString(), title: cur.title, subtitle: cur.subtitle, desc: cur.desc, category: cur.category });
            count += 1;
            if (batch.length >= BATCH_SIZE) { flushBatch(batch); batch = []; }
          }
          inProg = false; cur = null;
        }
      });
      parser.on('error', reject);
      parser.on('end', () => { if (batch.length) flushBatch(batch); resolve(); });
      const buf = fs.readFileSync(cachePath);
      const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
      const source = Readable.from(buf);
      if (isGzip) source.pipe(zlib.createGunzip()).pipe(parser);
      else source.pipe(parser);
    });

    setStatus(sourceId, 'ready', null);
    logger.info('epg', 'Guide index success', { sourceId, programmeCount: count, elapsedMs: Date.now() - start });
  } catch (e) {
    setStatus(sourceId, 'failed', e.message);
    logger.error('epg', 'Guide index failure', { sourceId, error: e.message, elapsedMs: Date.now() - start });
  }
}

function parseXMLTVTime(str) {
  const m = String(str || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc, tz] = m;
  const off = tz ? tz.slice(0,3) + ':' + tz.slice(3) : 'Z';
  return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${off}`);
}

module.exports = { queueGuideIndex, queueStaleGuideIndexes };
