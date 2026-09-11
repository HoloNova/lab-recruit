'use strict';
// 风险评分 —— 只做标记，不做拦截。人工审核时按分数排序。
const { codePoints } = require('./validate');

const LEVELS = [
  { min: 100, key: 'bot', label: '机器人' },
  { min: 60, key: 'suspicious', label: '可疑' },
  { min: 20, key: 'watch', label: '需留意' },
  { min: 0, key: 'normal', label: '正常' },
];

function levelFor(score) {
  return LEVELS.find((l) => score >= l.min).key;
}

const SEQUENTIAL_TAILS = new Set([
  '012345', '123456', '234567', '345678', '456789',
  '987654', '876543', '765432', '654321', '543210',
]);

function idLooksFake(studentId) {
  if (!studentId) return false;
  const tail = studentId.slice(4);
  if (!/^\d{6}$/.test(tail)) return false;
  if (tail === '000000') return true;
  if (/^(\d)\1{5}$/.test(tail)) return true;
  return SEQUENTIAL_TAILS.has(tail);
}

function nameLooksFake(name) {
  if (!name) return false;
  if (codePoints(name) < 2) return true;
  if (/(https?:\/\/|www\.)/i.test(name)) return true;
  if (/^(\S)\1+$/.test(name)) return true; // 啊啊啊 / aaaa
  return false;
}

/**
 * 计算风险分。
 * @param {object} o
 * @param {object} o.repo           仓储（只读查询）
 * @param {object} o.values         已校验归一的字段
 * @param {boolean} o.honeypot      蜜罐命中
 * @param {string} o.contentHash    长文本内容哈希
 * @param {string} o.ipHash         IP 哈希
 * @param {string} o.sid            会话 id
 * @param {number} o.dwellMs        服务端计算的填写耗时
 * @param {number} o.excludeId      编辑场景下排除自身
 * @param {number} o.now            epoch 毫秒
 * @param {object} o.config         阈值配置
 */
function assess(o) {
  const { repo, values, honeypot, contentHash, ipHash, sid, dwellMs, excludeId = null, now } = o;
  const cfg = o.config || {};
  const windowMs = cfg.riskWindowMs || 10 * 60_000;
  const since = now - windowMs;
  const flags = [];
  const add = (code, label, points) => flags.push({ code, label, points });

  if (honeypot) add('HONEYPOT', '蜜罐字段被填写（疑似自动脚本）', 100);

  if (idLooksFake(values.student_id)) add('ID_SUSPECT', '学号形如占位/顺序号', 50);

  if (contentHash) {
    const n = repo.countByContentHash(contentHash, excludeId);
    if (n > 0) add('DUP_CONTENT', `内容与已有 ${n} 份报名相同`, 40);
  }

  if (ipHash) {
    const n = repo.countRecentByIp(ipHash, since, excludeId);
    if (n >= 3) add('IP_BURST', `同 IP 10 分钟内已提交 ${n} 次（校园网络可能多人共用出口，需人工确认）`, 30);
  }

  if (values.contact_norm) {
    const n = repo.countByContactNorm(values.contact_norm, excludeId);
    if (n > 0) add('DUP_CONTACT', `联系方式与已有 ${n} 份报名重复`, 30);
  }

  if (sid) {
    const fails = repo.countRecentAbuse('captcha_fail', { sid }, since);
    if (fails >= 5) add('CAPTCHA_FAIL', `同会话验证码失败 ${fails} 次`, 30);
  }

  const recentTotal = repo.countRecentApplications(since);
  if (recentTotal > (cfg.floodThreshold ?? 50)) {
    add('FLOOD', `全站 10 分钟内提交 ${recentTotal} 次，触发洪峰标记`, 25);
  }

  if (typeof dwellMs === 'number' && dwellMs >= 0 && dwellMs < 30_000) {
    add('TOO_FAST', `填写耗时仅 ${Math.round(dwellMs / 1000)} 秒`, 20);
  }

  if (nameLooksFake(values.name)) add('NAME_SUSPECT', '姓名疑似占位内容', 20);

  const score = flags.reduce((s, f) => s + f.points, 0);
  return { score, flags, level: levelFor(score) };
}

module.exports = { assess, levelFor, LEVELS, idLooksFake, nameLooksFake };
