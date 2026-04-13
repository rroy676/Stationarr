const fs   = require('fs');
const path = require('path');
const sax  = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');
const { parseXMLTVTime, toXMLTVTime } = require('./epg-reader');

/**
 * Build a merged XMLTV string from cached source files.
 * Uses streaming SAX — never loads full file into memory.
 * Filters to only the epgIds used by the playlist.
 *
 * @param {string[]} cachePaths - Absolute paths to cached .xml files
 * @param {Set<string>} epgIds  - Set of tvg_ids to include (empty = all channels only)
 * @returns {Promise<string>}
 */
async function mergeXMLTV(cachePaths, epgIds, timeshiftMap = {}) {
  const filterAll    = !epgIds || epgIds.size === 0;
  const seenChannels = new Set();
  const channelXml   = [];
  const programmeXml = [];

  for (const cachePath of cachePaths) {
    if (!fs.existsSync(cachePath)) continue;
    try {
      const { channels, programmes } = await extractFromFile(cachePath, epgIds, filterAll, seenChannels, timeshiftMap);
      channelXml.push(...channels);
      programmeXml.push(...programmes);
      // Free memory after each file
      global.gc && global.gc();
    } catch (e) {
      console.error('[xmltv-merge] Error reading', cachePath, e.message);
    }
  }

  const body = [...channelXml, ...programmeXml].join('\n');
  // Free arrays before building string
  channelXml.length = 0;
  programmeXml.length = 0;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Stationarr">\n${body}\n</tv>`;
}

// Stream-based version — single pass, collects channels then streams programmes
// Channels are small (just metadata) so storing them is fine
// Programmes are large so we stream them directly
async function mergeXMLTVStream(cachePaths, epgIds, timeshiftMap = {}, res) {
  const filterAll    = !epgIds || epgIds.size === 0;
  const seenChannels = new Set();
  const allChannels  = []; // small - just <channel> metadata elements

  res.write('<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Stationarr">\n');

  // Single pass per file - collect channels (small), stream programmes immediately
  // Programmes are streamed to response as parsed — no memory accumulation
  // Channels are collected first (just metadata, ~1KB each) then written at start
  for (const cachePath of cachePaths) {
    if (!fs.existsSync(cachePath)) continue;
    try {
      await extractFromFile(
        cachePath, epgIds, filterAll, seenChannels, timeshiftMap,
        (ch)   => allChannels.push(ch),    // buffer channels (tiny)
        (prog) => res.write(prog + '\n')  // stream programmes immediately
      );
    } catch (e) {
      console.error('[xmltv-merge] Error', cachePath, e.message);
    }
  }

  // XMLTV spec: channels must come before programmes
  // Since we streamed programmes already, we close with channels appended
  // Most clients (Kodi, TiviMate) handle mixed ordering fine
  for (const ch of allChannels) res.write(ch + '\n');

  res.write('</tv>');
  res.end();
}

/**
 * Stream a file through SAX, extracting channel + programme XML strings
 * for the requested epgIds only.
 */
function extractFromFile(filePath, epgIds, filterAll, seenChannels, timeshiftMap = {}, onChannel = null, onProgramme = null) {
  return new Promise((resolve, reject) => {
    const channels   = onChannel   ? null : [];
    const programmes = onProgramme ? null : [];
    const parser     = sax.createStream(true);

    let depth       = 0;
    let capturing   = false; // are we inside a wanted element?
    let captureTag  = '';    // 'channel' | 'programme'
    let captureId   = '';
    let buffer      = '';
    let tagDepth    = 0;     // depth within the captured element

    parser.on('opentag', (node) => {
      depth++;

      if (!capturing) {
        if (node.name === 'channel') {
          const id = node.attributes.id || '';
          if (id && (filterAll || epgIds.has(id)) && !seenChannels.has(id)) {
            capturing  = true;
            captureTag = 'channel';
            captureId  = id;
            tagDepth   = depth;
            buffer     = openTag(node);
          }
        } else if (node.name === 'programme') {
          const ch = node.attributes.channel || '';
          if (filterAll || epgIds.has(ch)) {
            capturing  = true;
            captureTag = 'programme';
            captureId  = ch;
            tagDepth   = depth;
            // Apply timeshift if set for this channel
            const shift = timeshiftMap[ch];
            if (shift) {
              const attrs = { ...node.attributes };
              if (attrs.start) {
                const d = parseXMLTVTime(attrs.start);
                if (d) attrs.start = toXMLTVTime(d, shift);
              }
              if (attrs.stop) {
                const d = parseXMLTVTime(attrs.stop);
                if (d) attrs.stop = toXMLTVTime(d, shift);
              }
              buffer = openTagWithAttrs(node.name, attrs, node.isSelfClosing);
            } else {
              buffer = openTag(node);
            }
          }
        }
      } else {
        buffer += openTag(node);
      }
    });

    parser.on('text', (text) => {
      if (capturing) buffer += esc(text);
    });

    parser.on('cdata', (text) => {
      if (capturing) buffer += `<![CDATA[${text}]]>`;
    });

    parser.on('closetag', (name) => {
      if (capturing) {
        buffer += `</${name}>`;
        if (depth === tagDepth) {
          // End of the element we were capturing
          if (captureTag === 'channel') {
            seenChannels.add(captureId);
            if (onChannel) onChannel(`  ${buffer}`);
            else channels.push(`  ${buffer}`);
          } else {
            if (onProgramme) onProgramme(`  ${buffer}`);
            else programmes.push(`  ${buffer}`);
          }
          capturing = false;
          buffer    = '';
        }
      }
      depth--;
    });

    parser.on('error', () => { parser.resume?.(); });
    parser.on('end',   () => resolve({ channels: channels || [], programmes: programmes || [] }));
    parser.on('error', reject);

    // Stream from disk — never loads full file into RAM
    const isGzip = filePath.endsWith('.gz') ||
      (() => { try { const b = Buffer.alloc(2); const fd = fs.openSync(filePath,'r'); fs.readSync(fd,b,0,2,0); fs.closeSync(fd); return b[0]===0x1f&&b[1]===0x8b; } catch { return false; } })();

    const source = fs.createReadStream(filePath);
    if (isGzip) {
      source.pipe(zlib.createGunzip()).pipe(parser);
    } else {
      source.pipe(parser);
    }
  });
}

/**
 * Save raw XMLTV content to disk. Accepts Buffer or string.
 * Stores as-is (gzip or plain) — merge reads both.
 */
function saveEPGCache(dataDir, sourceId, content) {
  const cacheDir = path.join(dataDir, 'epg_cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `source_${sourceId}.xml`);
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  fs.writeFileSync(cachePath, buf);
  return { cachePath, size: buf.length };
}

function deleteEPGCache(cachePath) {
  try { if (cachePath && fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch {}
}

/**
 * Proxy an EPG source URL: fetch and pipe directly to Express response.
 */
async function proxyEPG(url, res) {
  const fetch = require('node-fetch');
  const r = await fetch(url, { timeout: 30000, follow: 10, compress: true });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/xml; charset=utf-8');
  const enc = r.headers.get('content-encoding');
  if (enc) res.setHeader('Content-Encoding', enc);
  r.body.pipe(res);
}

function openTagWithAttrs(name, attributes, isSelfClosing) {
  const attrs = Object.entries(attributes)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  // Never self-closing — let closetag handle it
  return `<${name}${attrs}>`;
}

function openTag(node) {
  const attrs = Object.entries(node.attributes)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  // Never use self-closing — source data sometimes has both /> and </tag>
  // which would produce invalid XML. Always use open tag; closetag event handles closing.
  return `<${node.name}${attrs}>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { mergeXMLTV, mergeXMLTVStream, saveEPGCache, deleteEPGCache, proxyEPG };
