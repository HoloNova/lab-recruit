'use strict';
// 服务端字段校验 —— 唯一权威。前端 maxlength / 正则只是体验，一律重新校验。

const LIMITS = {
  student_id: 20,
  name: 20,
  class_name: 30,
  contact: 50,
  major: 30,
  intro: 200,
  learned: 200,
  ai_views: 200,
};

const DIRECTIONS = ['软件', '硬件', '算法', '人工智能'];
const CONTACT_TYPES = ['wechat', 'phone'];
const STUDENT_ID_PATTERN = /^2026\d{6}$/;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const WECHAT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{5,19}$/;
const URL_LIKE = /(https?:\/\/|www\.|\.com|\.cn|\.net)/i;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

const DEFAULT_HONEYPOT_FIELD = 'website';

/**
 * 服务端接受的字段全名。
 * ⚠ 前端每新增一个随请求发送的字段，必须同时加到这里，
 *   否则会被当作「未知字段非空」而误判为蜜罐（HONEYPOT +100）。
 *   对应回归测试：test/api.test.js 「真实前端载荷不得被误判为机器人」。
 */
const KNOWN_KEYS = new Set([
  ...Object.keys(LIMITS),
  'contact_type',
  'direction',
  'captcha_id',
  'captcha_answer',
  'form_id',      // 服务端下发的表单计时凭证
  'edit_token',   // 仅编辑接口使用
]);

function codePoints(s) {
  return [...s].length;
}

function byteLength(s) {
  return Buffer.byteLength(s, 'utf8');
}

/** NFKC 归一 + 去零宽字符 + 去控制字符 + 折叠空白 + trim */
function cleanText(input, { multiline = false } = {}) {
  let out = String(input).normalize('NFKC').replace(ZERO_WIDTH, '');
  if (!multiline) out = out.replace(/[\r\n\t]+/g, ' ');
  out = out.replace(CONTROL, '');
  out = out.replace(/[ \t\u3000]{2,}/g, ' ');
  return out.trim();
}

function readRaw(payload, name) {
  const raw = payload[name];
  if (raw === undefined || raw === null) return { value: '', invalid: false };
  if (typeof raw === 'string') return { value: raw, invalid: false };
  if (typeof raw === 'number' && Number.isFinite(raw)) return { value: String(raw), invalid: false };
  return { value: '', invalid: true };
}

/** 手机号归一：去空格/横线/括号、去 +86 前缀 */
function normalizePhone(s) {
  let out = s.replace(/[\s\-()（）]/g, '');
  out = out.replace(/^\+?86/, '');
  return out;
}

/**
 * 校验并归一化报名数据。
 * @returns {{ok:boolean, errors:Array<{field:string,message:string}>,
 *            values:object, honeypot:boolean}}
 */
function validateApplication(payload, options = {}) {
  const honeypotField = options.honeypotField || DEFAULT_HONEYPOT_FIELD;
  const errors = [];
  const values = {};

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: [{ field: '', message: '请求体格式不正确' }], values, honeypot: false };
  }

  // 蜜罐 + 未知字段：任何白名单之外的字段只要非空，一律判定为机器人
  let honeypot = false;
  const rawHoneypot = payload[honeypotField];
  if (typeof rawHoneypot === 'string' && rawHoneypot.trim() !== '') honeypot = true;
  if (rawHoneypot !== undefined && rawHoneypot !== null && typeof rawHoneypot !== 'string') honeypot = true;

  for (const key of Object.keys(payload)) {
    if (KNOWN_KEYS.has(key) || key === honeypotField) continue;
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    honeypot = true; // 未知字段非空 → 与蜜罐同等处理
  }

  const fail = (field, message) => errors.push({ field, message });

  // ---- 通用文本字段 ----
  const textFields = [
    ['student_id', { multiline: false, required: true, label: '学号' }],
    ['name', { multiline: false, required: true, label: '姓名' }],
    ['class_name', { multiline: false, required: true, label: '班级' }],
    ['major', { multiline: false, required: true, label: '专业' }],
    ['intro', { multiline: true, required: true, label: '个人简介' }],
    ['learned', { multiline: true, required: false, label: '已学内容' }],
    ['ai_views', { multiline: true, required: false, label: '对 AI 的看法' }],
  ];

  for (const [field, opt] of textFields) {
    const { value: raw, invalid } = readRaw(payload, field);
    if (invalid) { fail(field, `${opt.label}格式不正确`); continue; }
    const cleaned = cleanText(raw, { multiline: opt.multiline });

    if (!cleaned) {
      values[field] = null;
      if (opt.required) fail(field, `请填写${opt.label}`);
      continue;
    }
    const max = LIMITS[field];
    if (codePoints(cleaned) > max) {
      fail(field, `${opt.label}最多 ${max} 个字`);
      continue;
    }
    if (byteLength(cleaned) > max * 4) {
      fail(field, `${opt.label}过长`);
      continue;
    }
    values[field] = cleaned;
  }

  // 学号格式（仅在长度校验通过后判断，避免重复报错）
  if (values.student_id && !STUDENT_ID_PATTERN.test(values.student_id)) {
    fail('student_id', '学号格式应为 2026 开头的 10 位数字');
  }

  // 姓名里的明显异常
  if (values.name) {
    if (codePoints(values.name) < 2) fail('name', '请填写完整姓名');
    else if (/\d/.test(values.name)) fail('name', '姓名中不应包含数字');
    else if (URL_LIKE.test(values.name)) fail('name', '姓名中不应包含网址');
  }

  // ---- 联系方式 ----
  const ctRaw = readRaw(payload, 'contact_type');
  const contactType = cleanText(ctRaw.value, { multiline: false });
  if (!CONTACT_TYPES.includes(contactType)) {
    fail('contact_type', '请选择联系方式类型');
  } else {
    values.contact_type = contactType;
  }

  const cRaw = readRaw(payload, 'contact');
  let contact = cleanText(cRaw.value, { multiline: false }).replace(/\s/g, '');
  if (!contact) {
    fail('contact', '请填写联系方式');
    values.contact = null;
    values.contact_norm = null;
  } else if (codePoints(contact) > LIMITS.contact) {
    fail('contact', `联系方式最多 ${LIMITS.contact} 个字符`);
    values.contact = null;
    values.contact_norm = null;
  } else if (contactType === 'phone') {
    const normalized = normalizePhone(contact);
    if (!PHONE_PATTERN.test(normalized)) {
      fail('contact', '手机号格式不正确（应为 11 位大陆手机号）');
      values.contact = null;
      values.contact_norm = null;
    } else {
      values.contact = normalized;
      values.contact_norm = normalized;
    }
  } else if (contactType === 'wechat') {
    const normalized = normalizePhone(contact);
    if (PHONE_PATTERN.test(normalized)) {
      // 很多人的微信号就是手机号
      values.contact = contact;
      values.contact_norm = normalized;
    } else if (WECHAT_PATTERN.test(contact)) {
      values.contact = contact;
      values.contact_norm = contact.toLowerCase();
    } else {
      fail('contact', '微信号格式不正确（字母开头，6-20 位字母/数字/下划线/短横线）');
      values.contact = null;
      values.contact_norm = null;
    }
  }

  // ---- 方向 ----
  const dRaw = readRaw(payload, 'direction');
  const direction = cleanText(dRaw.value, { multiline: false });
  if (!DIRECTIONS.includes(direction)) {
    fail('direction', '请选择有效的方向');
  } else {
    values.direction = direction;
  }

  return { ok: errors.length === 0, errors, values, honeypot };
}

module.exports = {
  LIMITS,
  DIRECTIONS,
  CONTACT_TYPES,
  STUDENT_ID_PATTERN,
  DEFAULT_HONEYPOT_FIELD,
  KNOWN_KEYS,
  cleanText,
  codePoints,
  byteLength,
  normalizePhone,
  validateApplication,
};
