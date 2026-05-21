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

function queueGuideIndex(sourceId, cachePath) {
  setImmediate(() => buildGuideIndex(sourceId, cachePath).catch(() => {}));
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

    let count = 0;
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
            ins.run(sourceId, cur.epgId, cur.start.toISOString(), cur.stop.toISOString(), cur.title, cur.subtitle, cur.desc, cur.category);
            count += 1;
          }
          inProg = false; cur = null;
        }
      });
      parser.on('error', reject);
      parser.on('end', resolve);
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

module.exports = { queueGuideIndex };
