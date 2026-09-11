'use strict';
// 单元测试：验证码生命周期、字段校验、阶段判定、时区、风险规则。
// 这些用例不涉及 HTTP，不依赖网络。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { openDatabase, createRepo } = require('../db');
const { createCaptchaService, CHARS } = require('../lib/captcha');
const { validateApplication, cleanText, codePoints } = require('../lib/validate');
const { computePhase, phaseInfo } = require('../lib/phase');
const { idLooksFake, nameLooksFake, assess } = require('../lib/risk');
const T = require('../lib/time');
const { makeConfig } = require('./helpers');

function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruit-unit-'));
  return createRepo(openDatabase(path.join(dir, 'u.db')));
}

function captchaFixture({ answer = 'abcd', startMs = 1_000_000 } = {}) {
  const repo = freshRepo();
  const config = makeConfig();
  const clock = { ms: startMs };
  const svc = createCaptchaService({
    repo,
    config,
    now: () => clock.ms,
    generateAnswer: () => answer,
  });
  return { repo, svc, clock, config };
}

// ---------------------------------------------------------------- 验证码

test('验证码：签发返回 SVG 与 id，答案不落明文', () => {
  const { repo, svc } = captchaFixture({ answer: 'wxyz' });
  const r = svc.issue('sid-aaaaaaaaaaaaaaaa');
  assert.equal(r.ok, true);
  assert.match(r.id, /^[A-Za-z0-9_-]{20,}$/);
  assert.match(r.svg, /^<svg /);
  assert.match(r.svg, /<path /);

  const row = repo.getCaptcha(r.id, 'sid-aaaaaaaaaaaaaaaa');
  assert.ok(row.answer_hmac);
  assert.ok(!JSON.stringify(row).includes('wxyz'), '不得存储明文答案');
});

test('验证码：正确答案通过、大小写不敏感、成功后不可重放', () => {
  const { svc } = captchaFixture({ answer: 'abcd' });
  const { id } = svc.issue('sid-aaaaaaaaaaaaaaaa');

  // 先猜错一次，不应影响后续正确提交
  assert.deepEqual(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'zzzz' }),
    { ok: false, reason: 'mismatch' });

  assert.deepEqual(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: ' ABCD ' }), { ok: true });
  assert.deepEqual(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'abcd' }),
    { ok: false, reason: 'consumed' });
});

test('验证码：绑定会话，别人拿到 id 也用不了', () => {
  const { svc } = captchaFixture({ answer: 'abcd' });
  const { id } = svc.issue('sid-aaaaaaaaaaaaaaaa');
  assert.deepEqual(svc.verify({ id, sid: 'sid-bbbbbbbbbbbbbbbb', answer: 'abcd' }),
    { ok: false, reason: 'not_found' });
});

test('验证码：缺少参数返回 missing（对应 CAPTCHA_REQUIRED）', () => {
  const { svc } = captchaFixture();
  assert.equal(svc.verify({ id: undefined, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'x' }).reason, 'missing');
  assert.equal(svc.verify({ id: 'x', sid: 'sid-aaaaaaaaaaaaaaaa', answer: undefined }).reason, 'missing');
});

test('验证码：超过 TTL 失效', () => {
  const { svc, clock } = captchaFixture({ answer: 'abcd' });
  const { id } = svc.issue('sid-aaaaaaaaaaaaaaaa');
  clock.ms += 181_000;
  assert.deepEqual(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'abcd' }),
    { ok: false, reason: 'expired' });
});

test('验证码：连续猜错 5 次后即使猜对也失效', () => {
  const { svc } = captchaFixture({ answer: 'abcd' });
  const { id } = svc.issue('sid-aaaaaaaaaaaaaaaa');
  for (let i = 0; i < 5; i += 1) {
    assert.equal(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'zzzz' }).ok, false);
  }
  assert.deepEqual(svc.verify({ id, sid: 'sid-aaaaaaaaaaaaaaaa', answer: 'abcd' }),
    { ok: false, reason: 'too_many' });
});

test('验证码：同一会话签发超过上限被限流', () => {
  const { svc } = captchaFixture();
  const sid = 'sid-aaaaaaaaaaaaaaaa';
  for (let i = 0; i < 20; i += 1) assert.equal(svc.issue(sid).ok, true, `第 ${i + 1} 张应签发成功`);
  assert.deepEqual(svc.issue(sid), { ok: false, reason: 'quota' });
});

test('验证码：默认字符集不含易混字符', () => {
  for (const ch of '01loi') assert.ok(!CHARS.includes(ch), `字符集不应包含 ${ch}`);
});

// ---------------------------------------------------------------- 字段校验

const VALID = {
  student_id: '2026000001',
  name: '张三',
  class_name: '网络工程 2 班',
  major: '网络工程',
  contact_type: 'wechat',
  contact: 'zhangsan_sec',
  direction: '软件',
  intro: '想学渗透测试。',
  learned: '',
  ai_views: '',
};

test('校验：合法数据通过并归一化', () => {
  const r = validateApplication(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.honeypot, false);
  assert.equal(r.values.contact_norm, 'zhangsan_sec');
  assert.equal(r.values.learned, null, '空选填项归一为 null');
});

test('校验：微信联系方式大小写归一', () => {
  const r = validateApplication({ ...VALID, contact: 'ZhangSan_Sec' });
  assert.equal(r.values.contact_norm, 'zhangsan_sec');
});

test('校验：手机号去空格与 +86 前缀', () => {
  const r = validateApplication({ ...VALID, contact_type: 'phone', contact: '+86 138-0013-8000' });
  assert.equal(r.ok, true);
  assert.equal(r.values.contact, '13800138000');
});

test('校验：学号必须 2026 开头 10 位', () => {
  for (const bad of ['202612345', '20260000011', '2025000001', 'abcdefghij', '']) {
    const r = validateApplication({ ...VALID, student_id: bad });
    assert.equal(r.ok, false, `${bad} 应被拒`);
  }
});

test('校验：长度按码点计，中文同样受限', () => {
  const r = validateApplication({ ...VALID, intro: '字'.repeat(201) });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].field, 'intro');
});

test('校验：emoji 按码点计数不误判', () => {
  const r = validateApplication({ ...VALID, intro: '🙂'.repeat(200) });
  assert.equal(r.ok, true);
  assert.equal(codePoints('🙂'.repeat(200)), 200);
});

test('校验：姓名含数字或网址被拒', () => {
  assert.equal(validateApplication({ ...VALID, name: '张三123' }).ok, false);
  assert.equal(validateApplication({ ...VALID, name: 'http://x.com' }).ok, false);
});

test('校验：蜜罐字段非空被标记但不产生错误', () => {
  const r = validateApplication({ ...VALID, website: 'x' });
  assert.equal(r.ok, true, '蜜罐不应导致校验失败（要静默入库）');
  assert.equal(r.honeypot, true);
});

test('校验：未知字段非空同样标记为蜜罐', () => {
  assert.equal(validateApplication({ ...VALID, foo: 'bar' }).honeypot, true);
  assert.equal(validateApplication({ ...VALID, foo: '' }).honeypot, false);
  assert.equal(validateApplication({ ...VALID, foo: [] }).honeypot, false);
});

test('校验：蜜罐字段名可配置', () => {
  const r = validateApplication({ ...VALID, trapfield: 'x' }, { honeypotField: 'trapfield' });
  assert.equal(r.honeypot, true);
});

test('校验：前端完整载荷（含 form_id / captcha_* / 空蜜罐）不被误判', () => {
  // 这份载荷必须与 public/app.js 的 collectPayload() 保持一致
  const frontendPayload = {
    student_id: '2026000001',
    name: '张三',
    class_name: '网络工程 2 班',
    major: '网络工程',
    contact_type: 'wechat',
    contact: 'zhangsan_sec',
    direction: '软件',
    intro: '想学渗透测试。',
    learned: '',
    ai_views: '',
    captcha_id: 'some-captcha-id',
    captcha_answer: 'abcd',
    form_id: 'some-form-id',
    website: '',
  };
  const r = validateApplication(frontendPayload);
  assert.equal(r.ok, true);
  assert.equal(r.honeypot, false,
    '前端发送的每个字段都必须在 KNOWN_KEYS 中，否则所有真实用户都会被判为机器人');
});

test('校验：编辑载荷中的 edit_token 不被误判', () => {
  const r = validateApplication({
    ...VALID, captcha_id: 'c', captcha_answer: 'abcd', form_id: 'f', edit_token: 'tok', website: '',
  });
  assert.equal(r.honeypot, false);
  assert.equal(r.ok, true);
});

test('校验：对象/数组类型字段被拒而非被字符串化', () => {
  const r = validateApplication({ ...VALID, name: { evil: 1 } });
  assert.equal(r.ok, false);
});

test('校验：控制字符被剥离、换行在长文本中保留', () => {
  const r = validateApplication({ ...VALID, intro: '第一行\u0000\n第二行\u200B' });
  assert.equal(r.values.intro, '第一行\n第二行');
});

test('校验：非对象请求体被拒', () => {
  assert.equal(validateApplication(null).ok, false);
  assert.equal(validateApplication('str').ok, false);
  assert.equal(validateApplication([]).ok, false);
});

// ---------------------------------------------------------------- 数据库

test('数据库：同一文件重复打开不报 database is locked（CLI 与服务并发场景）', () => {
  const { openDatabase: open } = require('../db');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruit-lock-'));
  const dbPath = path.join(dir, 'lock.db');

  const first = open(dbPath);   // 首次会建立 WAL
  const second = open(dbPath);  // 已存在 WAL，不应再尝试切换 journal_mode
  const third = open(dbPath);

  assert.equal(
    String(Object.values(second.prepare('PRAGMA journal_mode').get())[0]).toLowerCase(),
    'wal'
  );
  assert.equal(Number(Object.values(third.prepare('PRAGMA busy_timeout').get())[0]) > 0, true,
    'busy_timeout 必须先于 journal_mode 设置');

  first.close(); second.close(); third.close();
});

test('数据库：迁移幂等，user_version 不重复变化', () => {
  const { openDatabase: open } = require('../db');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruit-mig-')) ;
  const dbPath = path.join(dir, 'm.db');
  const a = open(dbPath);
  const v1 = a.prepare('PRAGMA user_version').get().user_version;
  const b = open(dbPath);
  const v2 = b.prepare('PRAGMA user_version').get().user_version;
  assert.equal(v1, v2);
  assert.ok(v1 >= 1);
  a.close(); b.close();
});

test('cleanText：折叠空白并 trim', () => {
  assert.equal(cleanText('  a   b  '), 'a b');
  assert.equal(cleanText('a\n\nb', { multiline: true }), 'a\n\nb');
});

// ---------------------------------------------------------------- 阶段

test('阶段：默认按时间自动判定', () => {
  const opens = '2026-10-08T02:00:00Z';
  const closes = '2026-10-20T15:59:00Z';
  const before = T.parseIso('2026-09-11T00:00:00Z');
  const during = T.parseIso('2026-10-10T00:00:00Z');
  const after = T.parseIso('2026-10-21T00:00:00Z');

  assert.equal(computePhase({ registration_opens_at: opens, registration_closes_at: closes }, before), 'warmup');
  assert.equal(computePhase({ registration_opens_at: opens, registration_closes_at: closes }, during), 'signup');
  assert.equal(computePhase({ registration_opens_at: opens, registration_closes_at: closes }, after), 'review');
});

test('阶段：phase_override 优先于时间', () => {
  const s = {
    registration_opens_at: '2026-10-08T02:00:00Z',
    registration_closes_at: '',
    phase_override: 'signup',
  };
  assert.equal(computePhase(s, T.parseIso('2026-09-11T00:00:00Z')), 'signup', '强制开放应生效');
  assert.equal(computePhase({ ...s, phase_override: '' }, T.parseIso('2026-09-11T00:00:00Z')), 'warmup');
});

test('阶段：非法 override 被忽略', () => {
  assert.equal(computePhase({ phase_override: 'hacked' }, Date.now()), 'warmup');
});

test('阶段：只有 open 时 registration.open 才为真', () => {
  assert.equal(phaseInfo({ phase_override: 'warmup' }).open, false);
  assert.equal(phaseInfo({ phase_override: 'signup' }).open, true);
  assert.equal(phaseInfo({ phase_override: 'review' }).open, false);
});

// ---------------------------------------------------------------- 时区

test('时区：北京时间字符串解析为正确的 UTC 时刻', () => {
  const ms = T.parseCN('2026-10-08 10:00');
  assert.equal(new Date(ms).toISOString(), '2026-10-08T02:00:00.000Z');
});

test('时区：UTC ↔ 北京时间往返一致', () => {
  const ms = Date.parse('2026-10-08T02:00:00Z');
  assert.equal(T.formatCN(ms), '2026-10-08 10:00');
  assert.equal(T.formatCN(ms, true), '2026-10-08 10:00:00');
  assert.equal(T.parseIso(T.toIso(ms)), ms);
});

test('时区：非法日期返回 null 而不是 Invalid Date', () => {
  for (const bad of ['', '  ', '2026-13-01', '2026-02-30', '不是日期', null, undefined]) {
    assert.equal(T.parseCN(bad), null, `${bad} 应解析失败`);
  }
});

test('时区：跨日边界不串位', () => {
  // 北京时间 2026-10-08 00:30 对应 UTC 前一天 16:30
  assert.equal(T.toIso(T.parseCN('2026-10-08 00:30')), '2026-10-07T16:30:00Z');
});

// ---------------------------------------------------------------- 风险规则

test('风险：占位学号被识别', () => {
  assert.equal(idLooksFake('2026000000'), true);
  assert.equal(idLooksFake('2026111111'), true);
  assert.equal(idLooksFake('2026123456'), true);
  assert.equal(idLooksFake('2026837124'), false);
});

test('风险：异常姓名被识别', () => {
  assert.equal(nameLooksFake('a'), true);
  assert.equal(nameLooksFake('aaaa'), true);
  assert.equal(nameLooksFake('http://x'), true);
  assert.equal(nameLooksFake('张三'), false);
});

test('风险：蜜罐直接判机器人', () => {
  const repo = freshRepo();
  const r = assess({
    repo,
    values: { student_id: '2026837124', name: '张三', contact_norm: 'abc123' },
    honeypot: true, contentHash: 'h1', ipHash: 'ip1', sid: 'sid-aaaaaaaaaaaaaaaa',
    dwellMs: 120_000, now: Date.now(),
    config: { riskWindowMs: 600_000, floodThreshold: 50 },
  });
  assert.ok(r.score >= 100);
  assert.equal(r.level, 'bot');
  assert.ok(r.flags.some((f) => f.code === 'HONEYPOT'));
});

test('风险：正常填写的真实用户零标记', () => {
  const repo = freshRepo();
  const r = assess({
    repo,
    values: { student_id: '2026837124', name: '张三', contact_norm: 'zhangsan_sec' },
    honeypot: false, contentHash: 'unique-hash', ipHash: 'ip-unique', sid: 'sid-cccccccccccccccc',
    dwellMs: 240_000, now: Date.now(),
    config: { riskWindowMs: 600_000, floodThreshold: 50 },
  });
  assert.equal(r.score, 0);
  assert.equal(r.level, 'normal');
  assert.deepEqual(r.flags, []);
});

test('风险：填写过快被标记', () => {
  const repo = freshRepo();
  const r = assess({
    repo,
    values: { student_id: '2026837124', name: '张三', contact_norm: 'x1' },
    honeypot: false, contentHash: 'h2', ipHash: 'ip2', sid: 'sid-dddddddddddddddd',
    dwellMs: 5_000, now: Date.now(),
    config: { riskWindowMs: 600_000, floodThreshold: 50 },
  });
  assert.ok(r.flags.some((f) => f.code === 'TOO_FAST'));
});

test('风险：评分等级边界', () => {
  const { levelFor } = require('../lib/risk');
  assert.equal(levelFor(0), 'normal');
  assert.equal(levelFor(19), 'normal');
  assert.equal(levelFor(20), 'watch');
  assert.equal(levelFor(59), 'watch');
  assert.equal(levelFor(60), 'suspicious');
  assert.equal(levelFor(99), 'suspicious');
  assert.equal(levelFor(100), 'bot');
});
