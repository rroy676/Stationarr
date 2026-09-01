const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stationarr-serve-validation-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const app = require('../src/index');

let server;
let sourceServer;
let baseUrl;
let sourceUrl;

test.before(async () => {
  sourceServer = http.createServer((req, res) => {
    if (req.url === '/playlist.m3u') {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
      return res.end('#EXTM3U\n#EXTINF:-1,News\nhttp://example.test/live\n');
    }
    if (req.url === '/guide.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end('<?xml version="1.0"?><tv></tv>');
    }
    if (req.url === '/wrong.m3u') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('not a playlist');
    }
    res.writeHead(404);
    res.end('not found');
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => sourceServer.once('listening', resolve));
  sourceUrl = `http://127.0.0.1:${sourceServer.address().port}`;

  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await Promise.all([
    new Promise(resolve => server.close(resolve)),
    new Promise(resolve => sourceServer.close(resolve)),
  ]);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function validate(url, type) {
  const response = await fetch(`${baseUrl}/api/serve/validate-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type }),
  });
  return { response, body: await response.json() };
}

test('validates reachable M3U and warns about loopback URLs', async () => {
  const { response, body } = await validate(`${sourceUrl}/playlist.m3u`, 'm3u');
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    url: `${sourceUrl}/playlist.m3u`,
    reachable: true,
    contentType: 'audio/x-mpegurl',
    looksValid: true,
    warnings: ['This URL uses localhost and may only be reachable from the Stationarr container.'],
  });
});

test('validates XMLTV content and flags an invalid M3U response', async () => {
  const xml = await validate(`${sourceUrl}/guide.xml`, 'xmltv');
  assert.equal(xml.body.reachable, true);
  assert.equal(xml.body.looksValid, true);
  assert.equal(xml.body.contentType, 'application/xml');

  const m3u = await validate(`${sourceUrl}/wrong.m3u`, 'm3u');
  assert.equal(m3u.body.reachable, true);
  assert.equal(m3u.body.looksValid, false);
  assert.ok(m3u.body.warnings.length >= 2);
  assert.match(m3u.body.warnings[1], /does not look like an M3U/i);
});

test('reports failed HTTP checks and rejects missing URLs', async () => {
  const failed = await validate(`${sourceUrl}/missing.m3u`, 'm3u');
  assert.equal(failed.body.reachable, false);
  assert.equal(failed.body.looksValid, false);
  assert.ok(failed.body.warnings.length >= 1);
  assert.match(failed.body.warnings[0], /localhost|127\.0\.0\.1/i);

  const response = await fetch(`${baseUrl}/api/serve/validate-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
});
