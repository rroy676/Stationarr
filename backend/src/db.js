const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'stationarr.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    is_admin    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    slug         TEXT    NOT NULL UNIQUE,
    source_url   TEXT,
    xtream_user  TEXT,
    xtream_pass  TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    duration    TEXT    NOT NULL DEFAULT '-1',
    tvg_id      TEXT    NOT NULL DEFAULT '',
    tvg_name    TEXT    NOT NULL DEFAULT '',
    tvg_logo    TEXT    NOT NULL DEFAULT '',
    grp         TEXT    NOT NULL DEFAULT 'Ungrouped',
    epg_id      TEXT    NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    ord         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS epg_sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    url           TEXT,
    last_fetched  TEXT,
    channel_count INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS epg_channels (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES epg_sources(id) ON DELETE CASCADE,
    tvg_id    TEXT NOT NULL,
    name      TEXT NOT NULL,
    icon      TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_channels_playlist   ON channels(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_epg_channels_source ON epg_channels(source_id);
  CREATE INDEX IF NOT EXISTS idx_playlists_user      ON playlists(user_id);
  CREATE INDEX IF NOT EXISTS idx_epg_sources_user    ON epg_sources(user_id);
`);

// Runtime migrations — safely add columns to existing DBs
const cols = db.prepare("PRAGMA table_info(playlists)").all().map(c => c.name);
if (!cols.includes('xtream_user')) {
  db.exec("ALTER TABLE playlists ADD COLUMN xtream_user TEXT");
}
if (!cols.includes('xtream_pass')) {
  db.exec("ALTER TABLE playlists ADD COLUMN xtream_pass TEXT");
}

module.exports = db;

// EPG cache columns migration
const epgCols = db.prepare("PRAGMA table_info(epg_sources)").all().map(c => c.name);
if (!epgCols.includes('cache_path'))    db.exec("ALTER TABLE epg_sources ADD COLUMN cache_path TEXT");
if (!epgCols.includes('cache_size'))    db.exec("ALTER TABLE epg_sources ADD COLUMN cache_size INTEGER DEFAULT 0");
if (!epgCols.includes('cache_updated')) db.exec("ALTER TABLE epg_sources ADD COLUMN cache_updated TEXT");

// Auto-refresh + source credentials migrations
const plCols = db.prepare("PRAGMA table_info(playlists)").all().map(c => c.name);
if (!plCols.includes('auto_refresh'))       db.exec("ALTER TABLE playlists ADD COLUMN auto_refresh INTEGER DEFAULT 0");
if (!plCols.includes('refresh_interval'))   db.exec("ALTER TABLE playlists ADD COLUMN refresh_interval INTEGER DEFAULT 24");
if (!plCols.includes('source_type'))        db.exec("ALTER TABLE playlists ADD COLUMN source_type TEXT DEFAULT 'url'");
if (!plCols.includes('source_server'))      db.exec("ALTER TABLE playlists ADD COLUMN source_server TEXT");
if (!plCols.includes('source_username'))    db.exec("ALTER TABLE playlists ADD COLUMN source_username TEXT");
if (!plCols.includes('source_password'))    db.exec("ALTER TABLE playlists ADD COLUMN source_password TEXT");
if (!plCols.includes('last_refreshed'))     db.exec("ALTER TABLE playlists ADD COLUMN last_refreshed TEXT");

const epgCols2 = db.prepare("PRAGMA table_info(epg_sources)").all().map(c => c.name);
if (!epgCols2.includes('auto_refresh'))     db.exec("ALTER TABLE epg_sources ADD COLUMN auto_refresh INTEGER DEFAULT 0");
if (!epgCols2.includes('refresh_interval')) db.exec("ALTER TABLE epg_sources ADD COLUMN refresh_interval INTEGER DEFAULT 24");
if (!epgCols2.includes('last_refreshed'))   db.exec("ALTER TABLE epg_sources ADD COLUMN last_refreshed TEXT");

// Timeshift column migration
const chCols = db.prepare("PRAGMA table_info(channels)").all().map(c => c.name);
if (!chCols.includes('timeshift')) db.exec("ALTER TABLE channels ADD COLUMN timeshift INTEGER DEFAULT 0");

// EPG source priority column
const epgCols3 = db.prepare("PRAGMA table_info(epg_sources)").all().map(c => c.name);
if (!epgCols3.includes('priority')) db.exec("ALTER TABLE epg_sources ADD COLUMN priority INTEGER DEFAULT 0");

// EPG scraper config table
db.exec(`
  CREATE TABLE IF NOT EXISTS scraper_channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    xmltv_id    TEXT NOT NULL,
    site        TEXT NOT NULL,
    site_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    lang        TEXT NOT NULL DEFAULT 'en',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_scraper_user ON scraper_channels(user_id);
`);

// Add backup_epg_id column to channels
const chCols2 = db.prepare("PRAGMA table_info(channels)").all().map(c => c.name);
if (!chCols2.includes('backup_epg_id')) {
  db.exec("ALTER TABLE channels ADD COLUMN backup_epg_id TEXT NOT NULL DEFAULT ''");
}
