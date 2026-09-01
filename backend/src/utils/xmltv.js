const fs = require('fs');
const sax = require('sax');
const zlib = require('zlib');
const { Readable } = require('stream');

function isGzip(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function parsingError(error) {
  // sax includes a line, column, and a small source excerpt in its message. Do
  // not add the source path/URL here: EPG URLs can contain credentials.
  const detail = String(error?.message || error).split('\n').slice(0, 3).join('\n');
  return new Error(`Invalid XMLTV data: ${detail}`, { cause: error });
}

/**
 * Create the one parser used by string, buffer, upload, refresh, and file
 * imports. SAX handles all XML whitespace around attributes; using the same
 * strict XML parser everywhere prevents the old paths from disagreeing.
 */
function createChannelParser() {
  const channels = [];
  const parser = sax.parser(true, { trim: false, normalize: false });
  let current = null;
  let displayName = null;

  parser.onopentag = (node) => {
    if (node.name === 'channel') {
      current = { id: node.attributes.id || '', name: '', icon: '' };
    } else if (current && node.name === 'display-name' && displayName === null) {
      displayName = '';
    } else if (current && node.name === 'icon' && !current.icon) {
      current.icon = node.attributes.src || '';
    }
  };

  parser.ontext = (text) => {
    if (current && displayName !== null) displayName += text;
  };

  parser.oncdata = (text) => {
    if (current && displayName !== null) displayName += text;
  };

  parser.onclosetag = (name) => {
    if (name === 'display-name' && current && displayName !== null) {
      const nameText = displayName.trim();
      if (nameText && !current.name) current.name = nameText;
      displayName = null;
    } else if (name === 'channel' && current) {
      if (current.id) {
        current.name ||= current.id;
        channels.push(current);
      }
      current = null;
      displayName = null;
    }
  };

  return { parser, channels };
}

/** Parse XMLTV text. Memory usage is O(channels), not O(programmes). */
function parseXMLTV(text) {
  const { parser, channels } = createChannelParser();
  let firstError;
  parser.onerror = (error) => { firstError ||= parsingError(error); };
  try {
    parser.write(String(text || '')).close();
  } catch (error) {
    firstError ||= parsingError(error);
  }
  if (firstError) throw firstError;
  return channels;
}

async function parseXMLTVStream(source, gzipped = false) {
  const { parser, channels } = createChannelParser();
  let firstError;
  parser.onerror = (error) => { firstError ||= parsingError(error); };
  const input = gzipped ? source.pipe(zlib.createGunzip()) : source;
  const decoder = new TextDecoder();

  try {
    for await (const chunk of input) {
      parser.write(decoder.decode(chunk, { stream: true }));
      if (firstError) throw firstError;
    }
    parser.write(decoder.decode()).close();
  } catch (error) {
    const usefulError = firstError || parsingError(error);
    console.error(`[xmltv] ${usefulError.message}`);
    throw usefulError;
  }
  return channels;
}

/** Parse an XMLTV Buffer, detecting gzip by its magic bytes. */
function parseXMLTVBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return Promise.reject(new TypeError('XMLTV input must be a Buffer'));
  return parseXMLTVStream(Readable.from([buffer]), isGzip(buffer));
}

/** Parse an XMLTV file without loading the whole document into memory. */
async function parseXMLTVFile(filePath) {
  // Cache files retain their .gz suffix; magic-byte detection also supports
  // gzipped uploads stored under a temporary extension.
  const handle = await fs.promises.open(filePath, 'r');
  const header = Buffer.alloc(2);
  try {
    await handle.read(header, 0, 2, 0);
  } finally {
    await handle.close();
  }
  const input = fs.createReadStream(filePath);
  return parseXMLTVStream(input, isGzip(header));
}

module.exports = { parseXMLTV, parseXMLTVBuffer, parseXMLTVFile };
