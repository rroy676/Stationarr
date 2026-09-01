const zlib = require('zlib');
const fs = require('fs');
const sax = require('sax');

function looksLikeGzip(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function countProgrammeEntriesFromXmlText(text) {
  const matches = String(text || '').match(/<programme\b/g);
  return matches ? matches.length : 0;
}

function countProgrammeEntriesFromBuffer(buf) {
  try {
    if (!Buffer.isBuffer(buf)) return 0;
    const xmlBuffer = looksLikeGzip(buf) ? zlib.gunzipSync(buf) : buf;
    return countProgrammeEntriesFromXmlText(xmlBuffer.toString('utf8'));
  } catch {
    return 0;
  }
}

async function countProgrammeEntriesFromFile(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  const header = Buffer.alloc(2);
  try {
    await handle.read(header, 0, 2, 0);
  } finally {
    await handle.close();
  }

  const parser = sax.createStream(true, { trim: false, normalize: false });
  let count = 0;
  parser.on('opentag', (node) => { if (node.name === 'programme') count += 1; });
  const source = fs.createReadStream(filePath);
  const input = looksLikeGzip(header) ? source.pipe(zlib.createGunzip()) : source;
  await new Promise((resolve, reject) => {
    input.pipe(parser);
    source.on('error', reject);
    input.on('error', reject);
    parser.on('error', reject);
    parser.on('end', resolve);
  });
  return count;
}

module.exports = {
  countProgrammeEntriesFromBuffer,
  countProgrammeEntriesFromFile,
  countProgrammeEntriesFromXmlText,
};
