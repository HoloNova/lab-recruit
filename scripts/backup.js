#!/usr/bin/env node
'use strict';
// 数据库备份 —— WAL 模式下直接 cp data.db 会拿到不一致快照，必须用 VACUUM INTO。
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const KEEP = Number.parseInt(process.env.BACKUP_KEEP || '14', 10);

fs.mkdirSync(config.BACKUP_DIR, { recursive: true, mode: 0o700 });

if (!fs.existsSync(config.DB_PATH)) {
  console.error(`✗ 数据库不存在: ${config.DB_PATH}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(config.BACKUP_DIR, `data-${stamp}.db`);

const db = new DatabaseSync(config.DB_PATH);
// 运行中的服务可能同时持有连接，VACUUM INTO 需要等待而非直接失败
db.exec('PRAGMA busy_timeout = 10000');
// VACUUM INTO 要求目标文件不存在，且路径中的单引号需转义
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

fs.chmodSync(dest, 0o600);
const size = (fs.statSync(dest).size / 1024).toFixed(1);
console.log(`✓ 备份完成 ${dest}（${size} KB）`);

// 保留最近 KEEP 份
const files = fs.readdirSync(config.BACKUP_DIR)
  .filter((f) => f.startsWith('data-') && f.endsWith('.db'))
  .sort();
for (const old of files.slice(0, Math.max(0, files.length - KEEP))) {
  fs.unlinkSync(path.join(config.BACKUP_DIR, old));
  console.log(`  已清理旧备份 ${old}`);
}
