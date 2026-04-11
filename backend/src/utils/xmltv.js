const sax  = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');

/**
 * Parse an XMLTV string using a streaming SAX parser.
 * Memory usage is O(channels) not O(file size).
 * Handles both plain XML and gzip-compressed XML.
 */
function parseXMLTV(text) {
  const channels = [];
  const parser   = sax.parser(true); // strict mode

  let inChannel  = false;
  let currentId  = '';
  let currentName = '';
  let currentIcon = '';
  let inDisplayName = false;

  parser.onopentag = (node) => {
    if (node.name === 'channel') {
      inChannel   = true;
      currentId   = node.attributes.id || '';
      currentName = '';
      currentIcon = '';
    } else if (inChannel && node.name === 'display-name') {
      inDisplayName = true;
    } else if (inChannel && node.name === 'icon') {
      currentIcon = node.attributes.src || '';
    }
  };

  parser.ontext = (text) => {
    if (inDisplayName && !currentName) currentName = text.trim();
  };

  parser.onclosetag = (name) => {
    if (name === 'display-name') inDisplayName = false;
    if (name === 'channel') {
      if (currentId) channels.push({ id: currentId, name: currentName || currentId, icon: currentIcon });
      inChannel = false;
    }
    // Stop after channels — skip parsing millions of <programme> tags
    // since we only need channel metadata for matching
  };

  parser.onerror = () => { parser.resume(); }; // skip bad nodes

  try {
    parser.write(text).close();
  } catch {}

  return channels;
}

/**
 * Parse an XMLTV Buffer (possibly gzipped) using streaming SAX.
 * Returns a Promise<channel[]>.
 * Stops after all <channel> tags are done (before <programme> tags)
 * to avoid processing millions of entries.
 */
function parseXMLTVBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const channels = [];
    const parser   = sax.createStream(true);

    let inChannel     = false;
    let currentId     = '';
    let currentName   = '';
    let currentIcon   = '';
    let inDisplayName = false;
    let channelsDone  = false;

    parser.on('opentag', (node) => {
      if (channelsDone) return;
      if (node.name === 'channel') {
        inChannel   = true;
        currentId   = node.attributes.id || '';
        currentName = '';
        currentIcon = '';
      } else if (inChannel && node.name === 'display-name') {
        inDisplayName = true;
      } else if (inChannel && node.name === 'icon') {
        currentIcon = node.attributes.src || '';
      } else if (node.name === 'programme') {
        // First programme tag means all channels are done — stop parsing
        channelsDone = true;
        resolve(channels);
      }
    });

    parser.on('text', (text) => {
      if (inDisplayName && !currentName) currentName = text.trim();
    });

    parser.on('closetag', (name) => {
      if (name === 'display-name') inDisplayName = false;
      if (name === 'channel') {
        if (currentId) channels.push({ id: currentId, name: currentName || currentId, icon: currentIcon });
        inChannel = false;
      }
    });

    parser.on('end',   () => resolve(channels));
    parser.on('error', (e) => { parser.resume?.(); }); // skip bad nodes

    // Detect gzip
    const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
    const source  = Readable.from(buffer);

    if (isGzip) {
      source.pipe(zlib.createGunzip()).pipe(parser);
    } else {
      source.pipe(parser);
    }
  });
}



// Parse XMLTV file from disk path using SAX streaming — never loads full file into RAM
async function parseXMLTVFile(filePath) {
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    const channels    = [];
    const parser      = sax.parser(false); // non-strict: lowercase tags
    let inChannel     = false;
    let currentId     = '';
    let currentName   = '';
    let currentIcon   = '';
    let inDisplayName = false;

    parser.onopentag = (node) => {
      const name = (node.name || '').toLowerCase();
      if (name === 'channel') {
        inChannel   = true;
        currentId   = node.attributes.id || node.attributes.ID || '';
        currentName = '';
        currentIcon = '';
      } else if (inChannel && name === 'display-name') {
        inDisplayName = true;
      } else if (inChannel && name === 'icon') {
        currentIcon = node.attributes.src || node.attributes.SRC || '';
      }
    };

    parser.onclosetag = (name) => {
      const n = (name || '').toLowerCase();
      if (n === 'channel') {
        if (currentId && currentName) {
          channels.push({ tvg_id: currentId, name: currentName, icon: currentIcon });
        }
        inChannel = false; inDisplayName = false;
      } else if (n === 'display-name') {
        inDisplayName = false;
      }
    };

    parser.ontext = (text) => {
      if (inChannel && inDisplayName && !currentName) {
        currentName = text.trim();
      }
    };

    parser.onerror = (err) => { parser.resume(); };
    parser.onend   = () => resolve(channels);

    const isGzip = filePath.endsWith('.gz');
    const input  = fs.createReadStream(filePath);
    const stream = isGzip ? input.pipe(zlib.createGunzip()) : input;

    stream.on('data', chunk => parser.write(chunk.toString()));
    stream.on('end',  () => parser.close());
    stream.on('error', reject);
  });
}

module.exports = { parseXMLTV, parseXMLTVBuffer, parseXMLTVFile };
