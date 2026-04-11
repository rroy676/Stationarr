const fs   = require('fs');
const sax  = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');

/**
 * Read programmes from a cached XMLTV file for one or more epg_ids,
 * within an optional time window [from, to].
 *
 * @param {string}          filePath  - Path to cached file
 * @param {string|string[]} epgIds    - Single id or array of ids
 * @param {object}          opts
 * @param {Date}            opts.from - Start of window (default: now)
 * @param {Date}            opts.to   - End of window   (default: now + 6h)
 * @param {number}          opts.max  - Max results per channel (default: 50)
 * @returns {Promise<Map<string, programme[]>>}  epgId → programmes
 */
function readProgrammes(filePath, epgIds, opts = {}) {
  const ids    = new Set(Array.isArray(epgIds) ? epgIds : [epgIds]);
  const from   = opts.from instanceof Date ? opts.from : new Date();
  const to     = opts.to   instanceof Date ? opts.to   : new Date(from.getTime() + 6 * 60 * 60 * 1000);
  const max    = opts.max  ?? 50;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve(new Map());

    const results = new Map(); // epgId → programme[]
    ids.forEach(id => results.set(id, []));

    const parser = sax.createStream(true);

    let inProg   = false;
    let current  = null;
    let field    = null;
    let targetId = null;

    parser.on('opentag', (node) => {
      if (node.name === 'programme') {
        const ch = node.attributes.channel || '';
        if (ids.has(ch)) {
          const start = parseXMLTVTime(node.attributes.start || '');
          const stop  = parseXMLTVTime(node.attributes.stop  || '');
          // Include if programme overlaps the window
          if (stop && start && stop > from && start < to) {
            inProg   = true;
            targetId = ch;
            current  = { start, stop, title: '', subtitle: '', desc: '', category: '' };
          }
        }
      } else if (inProg && ['title','desc','category','sub-title'].includes(node.name)) {
        field = node.name;
      }
    });

    parser.on('text', (text) => {
      if (!inProg || !field || !current) return;
      const t = text.trim();
      if (!t) return;
      if (field === 'title')     current.title    += t;
      if (field === 'desc')      current.desc     += t;
      if (field === 'category')  current.category += t;
      if (field === 'sub-title') current.subtitle += t;
    });

    parser.on('closetag', (name) => {
      if (['title','desc','category','sub-title'].includes(name)) field = null;
      if (name === 'programme' && inProg && current && targetId) {
        const list = results.get(targetId);
        if (list && list.length < max) list.push(current);
        inProg = false; current = null; targetId = null;
      }
    });

    parser.on('error', () => { parser.resume?.(); });
    parser.on('end',   () => resolve(results));

    const buf    = fs.readFileSync(filePath);
    const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
    const source = Readable.from(buf);
    if (isGzip) source.pipe(zlib.createGunzip()).pipe(parser);
    else source.pipe(parser);
  });
}

function parseXMLTVTime(str) {
  if (!str) return null;
  const m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc, tz] = m;
  const off = tz ? tz.slice(0,3) + ':' + tz.slice(3) : 'Z';
  return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${off}`);
}

function toXMLTVTime(date, offsetMinutes = 0) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs  = Math.abs(offsetMinutes);
  return (
    `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth()+1)}${pad(shifted.getUTCDate())}` +
    `${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}` +
    ` ${sign}${pad(Math.floor(abs/60))}${pad(abs%60)}`
  );
}

module.exports = { readProgrammes, parseXMLTVTime, toXMLTVTime };
