'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createTestContext, makeClient, prepareSubmit, postJson, openSignup, BASE_APPLICATION,
} = require('./helpers');

let ctx;
before(async () => { ctx = await createTestContext(); });
after(async () => { await ctx.close(); });
beforeEach(() => { ctx.reset(); });

// ---------------------------------------------------------------- 基础

test('健康检查返回阶段', async () => {
  const c = makeClient(ctx.base);
  const { res, body } = await c.json('/api/health');
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.phase, 'warmup');
});

test('安全响应头齐备且不泄露 x-powered-by', async () => {
  const c = makeClient(ctx.base);
  const res = await c.req('/api/health');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('未知接口返回 404 JSON', async () => {
  const c = makeClient(ctx.base);
  const { res, body } = await c.json('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'NOT_FOUND');
});

test('会话 cookie 在非 https 下不使用 __Host- 前缀', async () => {
  const c = makeClient(ctx.base);
  const res = await c.req('/api/form-config');
  const setCookie = res.headers.getSetCookie().join(';');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.ok(!setCookie.includes('__Host-'), 'http 环境用 __Host- 会被浏览器拒收');
});

// ---------------------------------------------------------------- 阶段门控

test('预热期提交被拒，且不落库、不消耗验证码', async () => {
  const { c, payload } = await prepareSubmit(ctx);
  const before = ctx.captcha.issued.size;
  const res = await postJson(c, '/api/applications', payload);
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.code, 'REGISTRATION_CLOSED');
  assert.equal(ctx.repo.countApplications(), 0);
  assert.equal(ctx.captcha.issued.size, before, '阶段检查应在验证码之前，不应消耗验证码');
});

test('phase_override=signup 后可正常入库', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const res = await postJson(c, '/api/applications', payload);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'created');
  assert.match(body.edit_token, /^[A-Za-z0-9_-]{40,50}$/);
  assert.equal(ctx.repo.countApplications(), 1);
});

test('截止时间已过 → 自动进入 review 阶段并拒绝', async () => {
  ctx.repo.setSetting('registration_closes_at', '2020-01-01T00:00:00Z');
  const { c, payload } = await prepareSubmit(ctx);
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).phase, 'review');
});

test('总量熔断生效', async () => {
  openSignup(ctx.repo);
  ctx.repo.setSetting('total_cap', '1');
  const first = await prepareSubmit(ctx);
  assert.equal((await postJson(first.c, '/api/applications', first.payload)).status, 200);

  const second = await prepareSubmit(ctx, { student_id: '2026000002' });
  const res = await postJson(second.c, '/api/applications', second.payload);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'TOTAL_CAP');
});

// ---------------------------------------------------------------- 来源与内容类型

test('跨站 Origin 被拒且不落库', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const res = await postJson(c, '/api/applications', payload, { Origin: 'https://evil.com' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'BAD_ORIGIN');
  assert.equal(ctx.repo.countApplications(), 0);
});

test('后缀型 Origin 不能绕过（精确匹配）', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const host = new URL(ctx.base).host;
  const res = await postJson(c, '/api/applications', payload, { Origin: `http://${host}.evil.com` });
  assert.equal(res.status, 403);
});

test('sec-fetch-site=cross-site 被拒', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const res = await postJson(c, '/api/applications', payload, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(res.status, 403);
});

test('跨站表单可用的 urlencoded 内容类型被拒（CSRF 防线）', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const res = await c.req('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'student_id=2026000001&name=x',
  });
  assert.equal(res.status, 415);
  assert.equal(ctx.repo.countApplications(), 0);
});

test('text/plain 内容类型同样被拒', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const res = await c.req('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(BASE_APPLICATION),
  });
  assert.equal(res.status, 415);
});

test('非法 JSON 返回 400 而非 500', async () => {
  openSignup(ctx.repo);
  const c = makeClient(ctx.base);
  const res = await c.req('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not json',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'BAD_JSON');
});

// ---------------------------------------------------------------- 验证码

test('缺少验证码 → 400 CAPTCHA_REQUIRED', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  delete payload.captcha_id;
  delete payload.captcha_answer;
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'CAPTCHA_REQUIRED');
  assert.equal(ctx.repo.countApplications(), 0);
});

test('验证码错误 → 400 CAPTCHA_INVALID', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  payload.captcha_answer = 'wrong';
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'CAPTCHA_INVALID');
  assert.equal(ctx.repo.countApplications(), 0);
});

test('验证码成功后重放同一 id 必失败', async () => {
  openSignup(ctx.repo);
  const first = await prepareSubmit(ctx);
  assert.equal((await postJson(first.c, '/api/applications', first.payload)).status, 200);

  const replay = await postJson(first.c, '/api/applications', {
    ...first.payload, student_id: '2026000002',
  });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).code, 'CAPTCHA_INVALID');
  assert.equal(ctx.repo.countApplications(), 1);
});

test('字段校验失败不消耗验证码（体验：填错姓名不该白烧一张）', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { name: '' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 400);
  // 同一个验证码在字段修正后仍可用
  payload.name = '张三';
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
});

// ---------------------------------------------------------------- 字段校验

test('字段超长被拒且不落库', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { name: '长'.repeat(21) });
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'VALIDATION');
  assert.equal(ctx.repo.countApplications(), 0);
});

test('学号格式不符被拒', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { student_id: '202612345' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 400);
  assert.equal(ctx.repo.countApplications(), 0);
});

test('方向必须是白名单值', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { direction: '不存在的方向' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 400);
});

test('手机号格式校验', async () => {
  openSignup(ctx.repo);
  const bad = await prepareSubmit(ctx, { contact_type: 'phone', contact: '12345' });
  assert.equal((await postJson(bad.c, '/api/applications', bad.payload)).status, 400);

  const good = await prepareSubmit(ctx, { contact_type: 'phone', contact: '13800138000' });
  assert.equal((await postJson(good.c, '/api/applications', good.payload)).status, 200);
});

test('微信号可以是手机号', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { contact_type: 'wechat', contact: '13800138000' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
});

test('全角学号会被 NFKC 归一后接受', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { student_id: '２０２６０００００１' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
  assert.notEqual(ctx.repo.findByStudentId('2026000001'), null);
});

test('控制字符与零宽字符被剥离', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { name: '张\u200B三\u0000' });
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 200);
  assert.equal(ctx.repo.findByStudentId('2026000001').name, '张三');
});

// ---------------------------------------------------------------- 蜜罐

test('蜜罐字段被填写 → 静默入库但标为机器人', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { website: 'http://spam.example' });
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 200, '不应告知机器人失败原因');
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(row.risk_score >= 100);
  assert.ok(JSON.parse(row.risk_flags).some((f) => f.code === 'HONEYPOT'));
});

test('未知字段非空同样按蜜罐处理', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { extra_sneaky: 'x' });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(JSON.parse(row.risk_flags).some((f) => f.code === 'HONEYPOT'));
});

test('真实前端完整载荷不得被误判为机器人（form_id 等字段回归）', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  // 模拟真实前端：带上全部服务端下发字段与空的蜜罐字段
  const res = await postJson(c, '/api/applications', payload);
  assert.equal(res.status, 200);

  const row = ctx.repo.findByStudentId('2026000001');
  const codes = JSON.parse(row.risk_flags).map((f) => f.code);
  assert.ok(!codes.includes('HONEYPOT'),
    '正常报名被误判为蜜罐 —— 很可能是前端新增字段未加入 validate.js 的 KNOWN_KEYS');
  assert.ok(row.risk_score < 100,
    `正常报名不应达到机器人等级（实际 ${row.risk_score}，标记 ${codes.join(',')}）`);
});

test('编辑载荷中的 edit_token 不被误判为未知字段', async () => {
  const { c, token } = await createThenGetToken();
  const res = await postJson(c, '/api/applications/edit', await editBody(c, token, { name: '改个名字' }));
  assert.equal(res.status, 200);
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(!JSON.parse(row.risk_flags).some((f) => f.code === 'HONEYPOT'));
});

// ---------------------------------------------------------------- 重复学号

test('重复学号 → 409，且响应体不含任何已有信息', async () => {
  openSignup(ctx.repo);
  const first = await prepareSubmit(ctx);
  await postJson(first.c, '/api/applications', first.payload);

  const second = await prepareSubmit(ctx, {
    student_id: '2026000001', name: '李四', contact: 'lisi_wechat', intro: '另一个人',
  });
  const res = await postJson(second.c, '/api/applications', second.payload);
  const text = await res.text();
  assert.equal(res.status, 409);
  assert.equal(JSON.parse(text).code, 'STUDENT_EXISTS');
  // 逐项断言：不得泄露已有记录的任何内容
  assert.ok(!text.includes('张三'), '不得回显已有姓名');
  assert.ok(!text.includes('zhangsan_sec'), '不得回显已有联系方式');
  assert.ok(!text.includes('网络工程 2 班'), '不得回显已有班级');
  assert.ok(!text.includes('想学渗透测试'), '不得回显已有简介');
  assert.ok(!/"(id|ip_hash|risk_score|review_status)"/.test(text), '不得回显内部字段');
  assert.equal(ctx.repo.countApplications(), 1);
});

test('重复学号会记录 student_dup 事件（供枚举探测聚合）', async () => {
  openSignup(ctx.repo);
  const first = await prepareSubmit(ctx);
  await postJson(first.c, '/api/applications', first.payload);
  const second = await prepareSubmit(ctx, { student_id: '2026000001' });
  await postJson(second.c, '/api/applications', second.payload);
  const events = ctx.repo.eventsSince(Date.now() - 60_000);
  assert.ok(events.some((e) => e.kind === 'student_dup'));
});

test('并发提交同一学号只成功一次', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const [a, b] = await Promise.all([
    postJson(c, '/api/applications', payload),
    postJson(c, '/api/applications', payload),
  ]);
  const statuses = [a.status, b.status];
  // 同一张验证码只能被消费一次，因此另一个请求会在验证码或唯一约束上失败
  assert.equal(statuses.filter((s) => s === 200).length, 1, '只能有一个成功');
  assert.equal(ctx.repo.countApplications(), 1, '绝不能写入两条');
});

// ---------------------------------------------------------------- 编辑流程

async function createThenGetToken() {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx);
  const res = await postJson(c, '/api/applications', payload);
  const body = await res.json();
  return { c, token: body.edit_token, studentId: payload.student_id, payload };
}

/** 编辑提交需要完整字段集（全量替换），与前端表单行为一致 */
async function editBody(c, token, overrides = {}) {
  const cfg = await (await c.req('/api/form-config')).json();
  const cap = await (await c.req('/api/captcha')).json();
  return {
    ...BASE_APPLICATION,
    ...overrides,
    edit_token: token,
    form_id: cfg.form_id,
    captcha_id: cap.captcha_id,
    captcha_answer: 'test',
  };
}

test('编辑码错误 → 401，且不泄露学号是否存在', async () => {
  const { c } = await createThenGetToken();
  const existing = await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000001', edit_token: 'wrong-token',
  });
  const missing = await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026999999', edit_token: 'wrong-token',
  });
  assert.equal(existing.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(await existing.json(), await missing.json(), '两种情况响应必须完全一致');
});

test('编辑码正确 → 返回当前值且不含内部字段', async () => {
  const { c, token } = await createThenGetToken();
  const res = await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000001', edit_token: token,
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.current.name, '张三');
  for (const leak of ['id', 'ip_hash', 'ua_hash', 'risk_score', 'risk_flags', 'review_status', 'edit_token_hash']) {
    assert.equal(body.current[leak], undefined, `不应返回 ${leak}`);
  }
});

test('A 的编辑码不能改 B 的报名', async () => {
  const { c, token } = await createThenGetToken();
  const second = await prepareSubmit(ctx, { student_id: '2026000002', name: '李四', contact: 'lisi_wechat' });
  assert.equal((await postJson(second.c, '/api/applications', second.payload)).status, 200);

  const res = await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000002', edit_token: token,
  });
  assert.equal(res.status, 401);
  assert.equal(ctx.repo.findByStudentId('2026000002').name, '李四');
});

test('修改成功：写入审计、created 不变、updated 更新、不新增记录', async () => {
  const { c, token } = await createThenGetToken();
  const before = ctx.repo.findByStudentId('2026000001');

  const body = await editBody(c, token, { name: '张三三', intro: '改成了新的简介。' });
  const res = await postJson(c, '/api/applications/edit', body);
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.status, 'updated');
  assert.deepEqual(out.changed.sort(), ['intro', 'name']);
  assert.match(out.edit_token, /^[A-Za-z0-9_-]{40,50}$/, '应重新签发编辑码');

  const after = ctx.repo.findByStudentId('2026000001');
  assert.equal(after.name, '张三三');
  assert.equal(after.created_ms, before.created_ms, 'created_ms 不应变化');
  assert.ok(after.updated_ms >= before.updated_ms);
  assert.equal(after.edit_count, 1);
  assert.equal(ctx.repo.editsFor(after.id).length, 1);
  assert.equal(ctx.repo.countApplications(), 1, '修改不应创建第二条记录');
});

test('修改后旧编辑码失效、新编辑码可用', async () => {
  const { c, token } = await createThenGetToken();
  const upd = await postJson(c, '/api/applications/edit', await editBody(c, token, { name: '新名字' }));
  const newToken = (await upd.json()).edit_token;
  assert.equal(upd.status, 200);

  assert.equal((await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000001', edit_token: token,
  })).status, 401);

  assert.equal((await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000001', edit_token: newToken,
  })).status, 200);
});

test('报名关闭后不能修改', async () => {
  const { c, token } = await createThenGetToken();
  ctx.repo.setSetting('phase_override', 'review');
  const res = await postJson(c, '/api/applications/edit/lookup', {
    student_id: '2026000001', edit_token: token,
  });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------- 公告 / 二维码

test('公告只返回可见项且按置顶排序', async () => {
  ctx.repo.insertAnnouncement({ title: '普通公告', body: '正文', nowMs: Date.now() - 1000 });
  ctx.repo.insertAnnouncement({ title: '重要公告', body: '正文', pinned: 1, nowMs: Date.now() });
  ctx.repo.insertAnnouncement({ title: '隐藏公告', body: '正文', visible: 0, nowMs: Date.now() });

  const c = makeClient(ctx.base);
  const { body } = await c.json('/api/announcements');
  assert.equal(body.announcements.length, 2);
  assert.equal(body.announcements[0].title, '重要公告');
  assert.ok(!body.announcements.some((a) => a.title === '隐藏公告'));
});

test('群二维码：未配置 404；配置后支持 ETag 与 304；换图后 ETag 变化', async () => {
  const c = makeClient(ctx.base);
  assert.equal((await c.req('/api/wechat-qr')).status, 404);

  const file = path.join(ctx.config.QR_DIR, 'wechat-qr.png');
  fs.writeFileSync(file, Buffer.from('fake-png-1'));
  const first = await c.req('/api/wechat-qr');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/png');
  assert.equal(first.headers.get('cache-control'), 'no-cache');
  const etag = first.headers.get('etag');
  assert.ok(etag);

  assert.equal((await c.req('/api/wechat-qr', { headers: { 'If-None-Match': etag } })).status, 304);

  fs.writeFileSync(file, Buffer.from('fake-png-2-longer'));
  const third = await c.req('/api/wechat-qr');
  assert.equal(third.status, 200);
  assert.notEqual(third.headers.get('etag'), etag, '换图后 ETag 必须变化');
  fs.unlinkSync(file);
});

// ---------------------------------------------------------------- 错误处理与配额

test('校验失败响应不含 SQL/堆栈/内部信息', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { name: '' });
  const res = await postJson(c, '/api/applications', payload);
  const text = await res.text();
  assert.equal(res.status, 400);
  for (const leak of ['SQLITE', 'at Object.', '.js:', 'stack', 'applications SET', 'INSERT INTO']) {
    assert.ok(!text.includes(leak), `响应不应包含 ${leak}`);
  }
});

test('会话配额：验证码通过后第 6 次提交被限流', async () => {
  openSignup(ctx.repo);
  const shared = makeClient(ctx.base);
  for (let i = 0; i < 5; i += 1) {
    const { payload } = await prepareSubmit(ctx, { student_id: `202600000${i}` }, shared);
    const res = await postJson(shared, '/api/applications', payload);
    assert.equal(res.status, 200, `第 ${i + 1} 次应成功`);
  }
  const sixth = await prepareSubmit(ctx, { student_id: '2026000009' }, shared);
  const res = await postJson(shared, '/api/applications', sixth.payload);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).code, 'SESSION_QUOTA');
});

test('风险标记：填写过快与联系方式重复会被标注', async () => {
  openSignup(ctx.repo);
  const first = await prepareSubmit(ctx);
  assert.equal((await postJson(first.c, '/api/applications', first.payload)).status, 200);

  const second = await prepareSubmit(ctx, {
    student_id: '2026000002', name: '李四', contact: 'zhangsan_sec',
  });
  assert.equal((await postJson(second.c, '/api/applications', second.payload)).status, 200);

  const row = ctx.repo.findByStudentId('2026000002');
  const codes = JSON.parse(row.risk_flags).map((f) => f.code);
  assert.ok(codes.includes('TOO_FAST'), '同会话快速连续提交应命中 TOO_FAST');
  assert.ok(codes.includes('DUP_CONTACT'), '重复联系方式应命中 DUP_CONTACT');
  assert.ok(row.risk_score > 0);
});

test('伪造的 dwell 无法绕过 TOO_FAST（服务端计时）', async () => {
  openSignup(ctx.repo);
  const { c, payload } = await prepareSubmit(ctx, { dwell_ms: 999999 });
  assert.equal((await postJson(c, '/api/applications', payload)).status, 200);
  const row = ctx.repo.findByStudentId('2026000001');
  assert.ok(row.dwell_ms < 30_000, '应使用服务端计时，忽略前端传入的 dwell_ms');
});
