const zlib = require('zlib');

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

module.exports = {
  countProgrammeEntriesFromBuffer,
  countProgrammeEntriesFromXmlText,
};
