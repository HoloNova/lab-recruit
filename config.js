'use strict';
// 配置集中点：所有 env 只在这里读取，其他模块一律 require 本文件。
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = __dirname;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(ROOT, 'data');

function intEnv(name, def) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

/**
 * 三个 pepper 用于 HMAC：验证码答案、编辑码、IP。
 * 生产环境必须显式提供；开发环境持久化到 data/dev-peppers.json，
 * 这样重启本地服务不会让已验证的编辑码全部失效。
 */
function loadPeppers() {
  const names = ['PEPPER_CAPTCHA', 'PEPPER_EDIT', 'PEPPER_IP'];
  const found = {};
  let missing = [];
  for (const n of names) {
    if (process.env[n]) found[n] = process.env[n];
    else missing.push(n);
  }
  if (missing.length === 0) return found;

  if (IS_PROD) {
    throw new Error(`生产环境缺少必需的密钥环境变量: ${missing.join(', ')}`);
  }

  const file = path.join(DATA_DIR, 'dev-peppers.json');
  let dev = {};
  try {
    dev = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* 首次运行或文件损坏 → 重建 */ }
  for (const n of names) {
    if (!found[n]) {
      if (!dev[n]) dev[n] = crypto.randomBytes(32).toString('base64url');
      found[n] = dev[n];
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(dev, null, 2), { mode: 0o600 });
  console.warn('[config] 未设置 PEPPER_*，已使用 data/dev-peppers.json 中的开发密钥（仅限本地）');
  return found;
}

const peppers = loadPeppers();

// 本地开发走 http，浏览器会拒收 Secure cookie；生产走 https 时启用 __Host- 前缀。
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === '1'
  : IS_PROD;

const config = {
  IS_PROD,
  ROOT,
  DATA_DIR,
  PORT: intEnv('PORT', 3001),
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, 'data.db'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  THEMES_DIR: path.join(ROOT, 'themes'),
  QR_DIR: DATA_DIR,
  BACKUP_DIR: path.join(DATA_DIR, 'backup'),

  // 精确字符串匹配，禁止后缀匹配（否则 campuslink.vip.evil.com 能通过）
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '',

  PEPPER_CAPTCHA: peppers.PEPPER_CAPTCHA,
  PEPPER_EDIT: peppers.PEPPER_EDIT,
  PEPPER_IP: peppers.PEPPER_IP,

  CONTACT_EMAIL: process.env.CONTACT_EMAIL || 'lab@example.com',

  // 只信任一层反代（nginx）。设成 true 会让客户端伪造 X-Forwarded-For 污染风控。
  TRUST_PROXY: intEnv('TRUST_PROXY', 0),

  COOKIE_SECURE: cookieSecure,
  COOKIE_NAME: cookieSecure ? '__Host-recruit_sid' : 'recruit_sid',

  BODY_LIMIT: 64 * 1024,
  CLIENT_MAX_BODY: 1024 * 1024,

  CAPTCHA: {
    ttlMs: 180_000,
    maxAttempts: 5,
    length: 4,
    issuePerWindow: 20,
    issueWindowMs: 10 * 60_000,
  },

  QUOTA: {
    submitPerWindow: 5,
    submitWindowMs: 10 * 60_000,
    editFailPerWindow: 5,
    editFailWindowMs: 10 * 60_000,
  },

  RISK_WINDOW_MS: 10 * 60_000,
  FLOOD_THRESHOLD: intEnv('FLOOD_THRESHOLD', 50),
  DUP_CONTENT_THRESHOLD: intEnv('DUP_CONTENT_THRESHOLD', 3),

  DEFAULT_TOTAL_CAP: intEnv('TOTAL_CAP', 2000),

  PHOTO_UPLOAD: false, // 照片上传已砍掉；保留此标记供前端提示
};

module.exports = config;
