'use strict';
// 集成测试：用「真实的验证码服务」跑完整 HTTP 流程。
// 与 api.test.js 的区别是这里不替换验证码实现，覆盖 HMAC 校验、
// 一次性消费、表单计时等真实路径。
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createTestContext, makeClient, postJson, openSignup } = require('./helpers');
const { createCaptchaService } = require('../lib/captcha');

const ANSWER = 'abcd';
let ctx;

before(async () => {
  ctx = await createTestContext({}, {
    captchaFactory: ({ repo, config }) => createCaptchaService({
      repo, config, generateAnswer: () => ANSWER,
    }),
  });
});
after(async () => { await ctx.close(); });
beforeEach(() => { ctx.reset(); });

const APPLICATION = {
  student_id: '2026000001',
  name: '张三',
  class_name: '网络工程 2 班',
  major: '网络工程',
  contact_type: 'wechat',
  contact: 'zhangsan_sec',
  direction: '软件',
  intro: '想学渗透测试和逆向。',
  learned: '',
  ai_views: '',
};

/** 走真实的 /api/captcha，但答案已知（生成器被注入） */
async function realSubmitPayload(c, overrides = {}) {
  const cfg = await (await c.req('/api/form-config')).json();
  const cap = await (await c.req('/api/captcha')).json();
  assert.equal(cap.ok, true);
  assert.match(cap.svg, /<svg/);
  return {
    ...APPLICATION,
    ...overrides,
    form_id: cfg.form_id,
    captcha_id: cap.captcha_id,
    captcha_answer: ANSWER,
  };
}

test('真实验证码服务：完整提交成功', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const payload = await realSubmitPayload(c);
  const res = await postJson(c, '/api/applications', payload);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'created');
  assert.equal(ctx.repo.countApplications(), 1);
  // 服务端计时应被记录（form_start → submit）
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(row.dwell_ms !== null && row.dwell_ms >= 0);
});

test('真实验证码服务：答案大小写与空格容错', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const payload = await realSubmitPayload(c);
  payload.captcha_answer = '  ABcd ';
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
});

test('真实验证码服务：错误答案被拒且不落库', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const payload = await realSubmitPayload(c);
  payload.captcha_answer = 'zzzz';
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'CAPTCHA_INVALID');
  assert.equal(ctx.repo.countApplications(), 0);
});

test('真实验证码服务：成功后重放被拒', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const payload = await realSubmitPayload(c);
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
  const replay = await postJson(c, '/api/applications', { ...payload, student_id: '2026000002' });
  assert.equal(replay.status, 400);
  assert.equal(ctx.repo.countApplications(), 1);
});

test('真实验证码服务：验证码属于另一会话时不可用', async () => {
  openSignup(ctx.repo);
  const a = makeClient(ctx.base);
  const payload = await realSubmitPayload(a);
  const b = makeClient(ctx.base); // 新会话 → 新 sid
  const res = await postJson(b, '/api/applications', payload);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'CAPTCHA_INVALID');
});

test('真实验证码服务：签发接口返回可用 SVG 且不泄露答案', async () => {
  const c = makeClient(ctx.base);
  const { res, body } = await c.json('/api/captcha');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(body.svg, /^<svg /);
  assert.ok(!body.svg.includes(ANSWER), 'SVG 中不得出现明文答案');
  assert.ok(!JSON.stringify(body).includes(ANSWER), '响应中不得出现明文答案');
});

test('开发环境下 pepper 缺失不会导致启动失败（config 层已兜底）', () => {
  // 这是一个回归护栏：config.js 在非生产环境应自动生成并持久化开发密钥
  const config = require('../config');
  assert.ok(config.PEPPER_CAPTCHA);
  assert.ok(config.PEPPER_EDIT);
  assert.ok(config.PEPPER_IP);
  assert.equal(config.PEPPER_CAPTCHA === config.PEPPER_EDIT, false, '三个 pepper 必须互相独立');
});

test('蜜罐字段名由服务端下发，前端不硬编码', async () => {
  ctx.repo.setSetting('honeypot_field', 'company_url');
  const c = makeClient(ctx.base);
  const cfg = await (await c.req('/api/form-config')).json();
  assert.equal(cfg.honeypot_field, 'company_url');

  openSignup(ctx.repo);
  const payload = await realSubmitPayload(c);
  payload.company_url = 'http://bot.example';
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(row.risk_score >= 100, '改名后的蜜罐字段仍应被识别');
});
