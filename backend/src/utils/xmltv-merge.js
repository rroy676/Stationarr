const fs   = require('fs');
const path = require('path');
const sax  = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');
const { parseXMLTVTime, toXMLTVTime } = require('./epg-reader');

// Array.prototype.push spread syntax turns every item into a function
// argument. Large XMLTV feeds can contain more arguments than V8's call stack
// allows, even though the arrays themselves are perfectly valid. Append in a
// loop so the merge has no programme-count-dependent stack limit.
function appendAll(target, values) {
  for (const value of values) target.push(value);
}

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
      appendAll(channelXml, channels);
      appendAll(programmeXml, programmes);
    } catch (e) {
      console.error('[xmltv-merge] Error reading', cachePath, e.message);
    }
  }

  const body = channelXml.concat(programmeXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Stationarr">\n${body}\n</tv>`;
}

/**
 * Stream a file through SAX, extracting channel + programme XML strings
 * for the requested epgIds only.
 */
function extractFromFile(filePath, epgIds, filterAll, seenChannels, timeshiftMap = {}) {
  return new Promise((resolve, reject) => {
    const channels   = [];
    const programmes = [];
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
              buffer = openTagWithAttrs(node.name, attrs);
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
            channels.push(`  ${buffer}`);
          } else {
            programmes.push(`  ${buffer}`);
          }
          capturing = false;
          buffer    = '';
        }
      }
      depth--;
    });

    parser.on('error', () => { parser.resume?.(); });
    parser.on('end',   () => resolve({ channels, programmes }));
    parser.on('error', reject);

    const fileBuffer = fs.readFileSync(filePath);
    const isGzip     = fileBuffer[0] === 0x1f && fileBuffer[1] === 0x8b;
    const source     = Readable.from(fileBuffer);

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

function openTagWithAttrs(name, attributes) {
  const attrs = Object.entries(attributes)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  // Never self-close: SAX fires closetag even for self-closing elements,
  // so <foo/> + </foo> would produce <foo/></foo> — invalid XML that breaks
  // strict parsers like ChannelsDVR. Always use explicit open tag; closetag handles the close.
  return `<${name}${attrs}>`;
}

function openTag(node) {
  const attrs = Object.entries(node.attributes)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  // Never self-close — see openTagWithAttrs comment above.
  return `<${node.name}${attrs}>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { mergeXMLTV, saveEPGCache, deleteEPGCache, proxyEPG };
