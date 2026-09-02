// 数据库初始化与查询（Node.js 内置 node:sqlite，无需原生编译）
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);

// 开启 WAL，查询方便
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  photo_path TEXT,
  major TEXT NOT NULL,
  direction TEXT NOT NULL,
  intro TEXT NOT NULL,
  learned TEXT,
  ai_views TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS friend_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`);

// 预置两条占位友链（仅当表为空时）
const linkCount = db.prepare('SELECT COUNT(*) AS c FROM friend_links').get().c;
if (linkCount === 0) {
  const insert = db.prepare('INSERT INTO friend_links (name, url, description, sort_order) VALUES (?, ?, ?, ?)');
  insert.run('第一个网站', 'https://example.com/1', '这里是第一个网站的简介，点击卡片展开后可在新标签页打开。', 1);
  insert.run('第二个网站', 'https://example.com/2', '这里是第二个网站的简介，点击卡片展开后可在新标签页打开。', 2);
}

function insertApplication(data) {
  const stmt = db.prepare(`
    INSERT INTO applications (name, photo_path, major, direction, intro, learned, ai_views)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    data.name, data.photo_path, data.major, data.direction,
    data.intro, data.learned || null, data.ai_views || null
  );
  return info.lastInsertRowid;
}

function getLinks() {
  return db.prepare('SELECT id, name, url, description FROM friend_links ORDER BY sort_order, id').all();
}

module.exports = { insertApplication, getLinks };
