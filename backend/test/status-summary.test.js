const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fetch = require('node-fetch');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stationarr-status-test-'));
process.env.DATA_DIR = dataDir;
process.env.APP_VERSION = 'test-version';
process.env.NODE_ENV = 'test';

const db = require('../src/db');
const app = require('../src/index');

const user = db.prepare('INSERT INTO users (username,email,password) VALUES (?,?,?)')
  .run('status-test', 'status@example.test', 'unused');
const userId = Number(user.lastInsertRowid);
const playlist = db.prepare('INSERT INTO playlists (user_id,name,slug,last_refreshed) VALUES (?,?,?,?)')
  .run(userId, 'Test playlist', 'status-playlist', '2026-09-01 10:00:00');
const playlistId = Number(playlist.lastInsertRowid);
db.prepare('INSERT INTO channels (playlist_id,name,url) VALUES (?,?,?)')
  .run(playlistId, 'One', 'http://example.test/one');
db.prepare('INSERT INTO channels (playlist_id,name,url) VALUES (?,?,?)')
  .run(playlistId, 'Two', 'http://example.test/two');
const source = db.prepare('INSERT INTO epg_sources (user_id,name,last_fetched,programme_count) VALUES (?,?,?,?)')
  .run(userId, 'Test EPG', '2026-09-01 11:00:00', 3);
const sourceId = Number(source.lastInsertRowid);
db.prepare('INSERT INTO epg_channels (source_id,tvg_id,name) VALUES (?,?,?)')
  .run(sourceId, 'one', 'One');
for (let i = 0; i < 3; i++) {
  db.prepare('INSERT INTO guide_programmes (source_id,epg_id,start,stop,title) VALUES (?,?,?,?,?)')
    .run(sourceId, 'one', `202609010${i}0000`, `202609010${i + 1}0000`, `Show ${i}`);
}

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

test('returns the unauthenticated status summary with correct fields and counts', async () => {
  const response = await fetch(`${baseUrl}/api/status/summary`);
  assert.equal(response.status, 200);
  const summary = await response.json();

  for (const field of [
    'status', 'version', 'users', 'playlists', 'channels', 'epg_sources',
    'epg_channels', 'guide_programmes', 'epg_programmes', 'scraper_channels',
    'last_refreshed', 'last_fetched', 'last_error',
  ]) assert.ok(Object.hasOwn(summary, field), `missing ${field}`);

  assert.equal(summary.status, 'ok');
  assert.equal(summary.version, 'test-version');
  assert.equal(summary.users, 1);
  assert.equal(summary.playlists, 1);
  assert.equal(summary.channels, 2);
  assert.equal(summary.epg_sources, 1);
  assert.equal(summary.epg_channels, 1);
  assert.equal(summary.guide_programmes, 3);
  assert.equal(summary.epg_programmes, 3);
  assert.equal(summary.scraper_channels, 0);
  assert.equal(summary.last_error, null);
});
