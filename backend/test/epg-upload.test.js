const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const jwt = require('jsonwebtoken');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stationarr-upload-test-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'epg-upload-test-secret';
process.env.EPG_UPLOAD_MAX_SIZE_MB = '25';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const app = require('../src/index');

const user = db.prepare('INSERT INTO users (username,email,password) VALUES (?,?,?)')
  .run('upload-test', 'upload@example.test', 'unused');
const token = jwt.sign({ id: Number(user.lastInsertRowid) }, process.env.JWT_SECRET);
const authHeaders = { Authorization: `Bearer ${token}` };

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function createSource(name) {
  return Number(db.prepare('INSERT INTO epg_sources (user_id,name) VALUES (?,?)')
    .run(Number(user.lastInsertRowid), name).lastInsertRowid);
}

function xmltv(paddingBytes = 0) {
  return Buffer.from(
    '<?xml version="1.0"?><tv><channel id="news"><display-name>News</display-name></channel>' +
    ' '.repeat(paddingBytes) +
    '<programme channel="news" start="20260901000000 +0000" stop="20260901010000 +0000"><title>Bulletin</title></programme></tv>'
  );
}

async function upload(sourceId, body, contentType = 'application/octet-stream') {
  return fetch(`${baseUrl}/api/epg/${sourceId}/upload`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': contentType },
    body,
  });
}

test('streams a raw XML upload larger than the global 20 MB JSON limit and updates metadata', async () => {
  const sourceId = createSource('large raw');
  const body = xmltv(20 * 1024 * 1024 + 1024);
  const response = await upload(sourceId, body, 'application/xml');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.loaded, 1);
  assert.equal(result.programme_count, 1);
  assert.equal(result.cache_size, body.length);

  const source = db.prepare('SELECT * FROM epg_sources WHERE id=?').get(sourceId);
  assert.equal(source.channel_count, 1);
  assert.equal(source.programme_count, 1);
  assert.equal(fs.statSync(source.cache_path).size, body.length);
  assert.deepEqual(db.prepare('SELECT tvg_id,name FROM epg_channels WHERE source_id=?').all(sourceId), [
    { tvg_id: 'news', name: 'News' },
  ]);
});

test('accepts an extensionless gzip payload using magic-byte detection', async () => {
  const sourceId = createSource('gzip');
  const compressed = zlib.gzipSync(xmltv());
  const response = await upload(sourceId, compressed);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.loaded, 1);
  assert.equal(result.programme_count, 1);
  const cache = fs.readFileSync(db.prepare('SELECT cache_path FROM epg_sources WHERE id=?').get(sourceId).cache_path);
  assert.deepEqual(cache.subarray(0, 2), Buffer.from([0x1f, 0x8b]));
});

test('rejects uploads over the EPG-specific limit and removes the temporary file', async () => {
  const sourceId = createSource('too large');
  process.env.EPG_UPLOAD_MAX_SIZE_MB = '0.001';
  const response = await upload(sourceId, xmltv(2048));
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /limit/i);
  const cacheDir = path.join(dataDir, 'epg_cache');
  assert.equal(fs.readdirSync(cacheDir).some((name) => name.startsWith(`.upload_${sourceId}_`)), false);
  process.env.EPG_UPLOAD_MAX_SIZE_MB = '25';
});

test('removes the temporary file when parsing fails', async () => {
  const sourceId = createSource('invalid');
  const response = await upload(sourceId, Buffer.from('<tv><channel id="broken"></tv>'), 'application/xml');
  assert.equal(response.status, 400);
  const cacheDir = path.join(dataDir, 'epg_cache');
  assert.equal(fs.readdirSync(cacheDir).some((name) => name.startsWith(`.upload_${sourceId}_`)), false);
  assert.equal(db.prepare('SELECT cache_path FROM epg_sources WHERE id=?').get(sourceId).cache_path, null);
});

test('keeps the normal JSON parser limit at 20 MB', async () => {
  const response = await fetch(`${baseUrl}/api/epg`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x'.repeat(20 * 1024 * 1024 + 1) }),
  });
  assert.equal(response.status, 413);
});
