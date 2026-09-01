const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stationarr-settings-test-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'settings-test-secret';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const app = require('../src/index');

const user = db.prepare('INSERT INTO users (username,email,password) VALUES (?,?,?)')
  .run('settings-test', 'settings@example.test', 'unused');
const token = jwt.sign({ id: Number(user.lastInsertRowid) }, process.env.JWT_SECRET);
const authHeaders = { Authorization: `Bearer ${token}` };

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function settings(method = 'GET', body, headers = authHeaders) {
  return fetch(`${baseUrl}/api/auth/settings`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('GET settings returns defaults', async () => {
  const response = await settings();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tailscale_url: null, url_mode: 'local' });
});

test('PUT settings updates tailscale URL', async () => {
  const response = await settings('PUT', { tailscale_url: 'http://stationarr.example.ts.net:3000' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tailscale_url: 'http://stationarr.example.ts.net:3000',
    url_mode: 'local',
  });
});

test('PUT settings updates URL mode', async () => {
  const response = await settings('PUT', { url_mode: 'tailscale' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tailscale_url: 'http://stationarr.example.ts.net:3000',
    url_mode: 'tailscale',
  });
});

test('settings requires authentication', async () => {
  assert.equal((await settings('GET', undefined, {})).status, 401);
  assert.equal((await settings('PUT', { url_mode: 'local' }, {})).status, 401);
});
