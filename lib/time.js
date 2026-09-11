'use strict';
// 时区工具：全库时间戳存 UTC，展示与输入按 Asia/Shanghai 处理。
//
// 中国大陆自 1991 年起不再使用夏令时，Asia/Shanghai 恒为 UTC+8，
// 因此这里的固定偏移换算在可预见的将来都是精确的，无需引入时区库。
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 当前时间（epoch 毫秒） */
function nowMs() {
  return Date.now();
}

/** SQLite 可用的 UTC 时间字符串：YYYY-MM-DD HH:MM:SS */
function utcSql(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** epoch 毫秒 → 北京时间展示串 "2026-10-08 10:00" */
function formatCN(ms, withSeconds = false) {
  const d = new Date(ms + CN_OFFSET_MS);
  const base = d.toISOString().slice(0, 16).replace('T', ' ');
  return withSeconds ? `${base}:${d.toISOString().slice(17, 19)}` : base;
}

/**
 * 北京时间字符串 → epoch 毫秒。
 * 接受 "2026-10-08 10:00"、"2026-10-08T10:00"、"2026-10-08" 三种写法。
 * 非法输入返回 null（而不是 Invalid Date）。
 */
function parseCN(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace('T', ' ');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
  const utcMs = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  if (!Number.isFinite(utcMs)) return null;
  // Date.UTC 会静默修正 2 月 30 日这类越界日期，这里反向校验一次
  const check = new Date(utcMs);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d) {
    return null;
  }
  return utcMs - CN_OFFSET_MS;
}

/** 解析 ISO8601（含 Z 结尾）→ epoch 毫秒；非法返回 null */
function parseIso(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const ms = Date.parse(input.trim());
  return Number.isFinite(ms) ? ms : null;
}

/** epoch 毫秒 → ISO8601 UTC（存 settings 用） */
function toIso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { nowMs, utcSql, formatCN, parseCN, parseIso, toIso, CN_OFFSET_MS };
