const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stationarr-activity-test-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'activity-test-secret';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const logger = require('../src/logger');
const app = require('../src/index');
const user = db.prepare('INSERT INTO users (username,email,password) VALUES (?,?,?)')
  .run('activity-test', 'activity@example.test', 'unused');
const token = jwt.sign({ id: Number(user.lastInsertRowid) }, process.env.JWT_SECRET);

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

test('history returns event fields, filters, and redacted details', async () => {
  logger.event({
    type: 'playlist',
    status: 'success',
    title: 'Playlist import completed',
    details: {
      source_url: 'https://provider.example/list.m3u?username=alice&token=secret-token',
      password: 'super-secret',
      imported: 42,
    },
  });
  logger.event({ type: 'epg', status: 'warning', title: 'EPG returned no programmes', details: { count: 0 } });

  const response = await fetch(`${baseUrl}/api/activity/history?type=playlist&page_size=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].status, 'success');
  assert.equal(body.events[0].details.source_url, '[REDACTED]');
  assert.equal(body.events[0].details.password, '[REDACTED]');
  assert.equal(JSON.stringify(body), JSON.stringify(body).replace(/secret-token|super-secret/g, '[REDACTED]'));
});

