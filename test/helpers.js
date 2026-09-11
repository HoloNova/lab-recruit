'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const baseConfig = require('../config');
const { createApp } = require('../server');
const { openDatabase, createRepo } = require('../db');

const DEFAULT_SETTINGS = {
  registration_opens_at: '2026-10-08T02:00:00Z',
  registration_closes_at: '',
  phase_override: '',
  honeypot_field: 'website',
  total_cap: '',
  contact_email: '',
};

function makeConfig(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruit-test-'));
  return {
    ...baseConfig,
    IS_PROD: false,
    DB_PATH: path.join(dir, 'test.db'),
    QR_DIR: dir,
    PUBLIC_DIR: path.join(__dirname, '..', 'public'),
    ALLOWED_ORIGIN: '',
    TRUST_PROXY: 0,
    COOKIE_SECURE: false,
    COOKIE_NAME: 'recruit_sid',
    PEPPER_CAPTCHA: 'test-pepper-captcha',
    PEPPER_EDIT: 'test-pepper-edit',
    PEPPER_IP: 'test-pepper-ip',
    CONTACT_EMAIL: 'lab@test.local',
    DEFAULT_TOTAL_CAP: 2000,
    ...overrides,
    TEST_DIR: dir,
  };
}

/** 假验证码服务：答案固定为 'test'，一次性消费 */
function makeFakeCaptcha() {
  let n = 0;
  const issued = new Set();
  return {
    issued,
    issue() {
      n += 1;
      const id = `cap${n}`;
      issued.add(id);
      return { ok: true, id, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    verify({ id, answer }) {
      // 与真实服务保持一致：缺参数时返回 missing（→ CAPTCHA_REQUIRED）
      if (!id || typeof answer !== 'string') return { ok: false, reason: 'missing' };
      if (!issued.has(id)) return { ok: false, reason: 'not_found' };
      if (answer !== 'test') return { ok: false, reason: 'mismatch' };
      issued.delete(id);
      return { ok: true };
    },
  };
}

/**
 * 每个测试文件只创建一个服务器。
 * 原因：本运行环境中「关闭监听后再新建 127.0.0.1 监听」会不可达，
 * 因此改为长期复用一个服务器 + 重置数据库状态。
 */
async function createTestContext(overrides = {}, options = {}) {
  const config = makeConfig(overrides);
  const repo = createRepo(openDatabase(config.DB_PATH));
  const captcha = options.captchaFactory
    ? options.captchaFactory({ repo, config })
    : makeFakeCaptcha();
  const app = createApp({ config, repo, captcha });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, repo, captcha, config, server,
    reset: () => resetState({ repo, captcha }),
    close: () => new Promise((r) => server.close(r)),
  };
}

function resetState(ctx) {
  const { repo, captcha } = ctx;
  repo.raw.exec(`
    DELETE FROM applications;
    DELETE FROM captchas;
    DELETE FROM form_sessions;
    DELETE FROM abuse_events;
    DELETE FROM application_edits;
    DELETE FROM form_starts;
    DELETE FROM announcements;
    DELETE FROM settings;
  `);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) repo.setSetting(k, v);
  if (captcha && captcha.issued) captcha.issued.clear();
}

/** 极简 cookie jar（Node 的 fetch 不会自动保存 cookie） */
function makeClient(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async req(pathname, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (cookie && !headers.Cookie) headers.Cookie = cookie;
      const res = await fetch(base + pathname, { ...opts, headers });
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      return res;
    },
    async json(pathname, opts) {
      const res = await this.req(pathname, opts);
      const body = await res.json().catch(() => ({}));
      return { res, body };
    },
  };
}

const BASE_APPLICATION = {
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

/** 准备一次可用的提交：拿 form_id + captcha_id；可复用同一 client 以共享会话 */
async function prepareSubmit(ctx, overrides = {}, client) {
  const c = client || makeClient(ctx.base);
  const cfg = await (await c.req('/api/form-config')).json();
  const cap = await (await c.req('/api/captcha')).json();
  return {
    c,
    payload: {
      ...BASE_APPLICATION,
      // 与真实前端一致：蜜罐字段总是随表单一起发送（正常人留空）
      // 放在 overrides 之前，否则测试无法覆盖它
      website: '',
      ...overrides,
      form_id: cfg.form_id,
      captcha_id: cap.captcha_id,
      captcha_answer: 'test',
    },
  };
}

function postJson(c, pathname, body, extraHeaders = {}) {
  return c.req(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function openSignup(repo) {
  repo.setSetting('phase_override', 'signup');
}

module.exports = {
  makeConfig, createTestContext, resetState, makeClient, makeFakeCaptcha,
  prepareSubmit, postJson, openSignup, BASE_APPLICATION, DEFAULT_SETTINGS,
};
