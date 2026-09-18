'use strict';
// 实验室招新网站 —— 后端入口
// 请求处理顺序即安全语义，见 docs/superpowers/specs/2026-09-11-anti-abuse-security-design.md §4
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const defaultConfig = require('./config');
const { openDatabase, createRepo } = require('./db');
const { createCaptchaService } = require('./lib/captcha');
const { phaseInfo } = require('./lib/phase');
const { validateApplication, cleanText, DEFAULT_HONEYPOT_FIELD } = require('./lib/validate');
const { assess } = require('./lib/risk');
const T = require('./lib/time');

const QR_BASENAME = 'wechat-qr';
const QR_EXTS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------- 工具

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

const SID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** IPv6 归一到 /64，IPv4-mapped 还原为 IPv4 */
function normalizeIp(ip) {
  if (!ip) return 'unknown';
  let s = String(ip).trim();
  if (s.startsWith('::ffff:')) s = s.slice(7);
  if (net.isIPv4(s)) return s;
  if (!net.isIPv6(s)) return 'unknown';
  const [head, tail] = s.split('::');
  const h = head ? head.split(':').filter(Boolean) : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':').filter(Boolean) : [];
  const missing = Math.max(0, 8 - h.length - t.length);
  const groups = [...h, ...Array(missing).fill('0'), ...t];
  return `${groups.slice(0, 4).join(':')}::/64`;
}

function isUniqueViolation(err) {
  if (!err) return false;
  if (err.errcode === 2067) return true;
  return /UNIQUE constraint failed/i.test(String(err.message || ''));
}

function hashText(pepper, text) {
  return crypto.createHmac('sha256', pepper).update(String(text)).digest('hex');
}

function newEditToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function contentHashOf(values) {
  const joined = [values.intro, values.learned, values.ai_views]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(joined).digest('hex');
}

function findQrFile(dir) {
  for (const ext of QR_EXTS) {
    const p = path.join(dir, `${QR_BASENAME}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function settingsView(repo, cfg) {
  const s = repo.getSettings();
  return {
    raw: s,
    honeypotField: s.honeypot_field || DEFAULT_HONEYPOT_FIELD,
    contactEmail: s.contact_email || cfg.CONTACT_EMAIL,
    totalCap: Number.parseInt(s.total_cap, 10) > 0 ? Number.parseInt(s.total_cap, 10) : cfg.DEFAULT_TOTAL_CAP,
  };
}

// ---------------------------------------------------------------- 主题仓库

/**
 * 把 themes/*.css 按文件名排序拼接成一个样式表。
 *
 * 加一个主题 = 丢一个文件，不改引擎代码。这也正是「仓库」的意义。
 * ETag 由每个文件的 mtime+size 派生，所以改主题文件后下次请求立即生效，
 * 不需要重启服务（与二维码换图的处理方式一致）。
 *
 * @returns {{css: string, etag: string|null, files: number}}
 */
function buildThemesCss(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.css')).sort();
  } catch {
    return { css: '', etag: null, files: 0 };
  }
  const parts = [];
  const stamps = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    stamps.push(`${name}:${st.mtimeMs.toString(36)}:${st.size.toString(36)}`);
    parts.push(`/* ——— ${name} ——— */\n${fs.readFileSync(file, 'utf8')}`);
  }
  if (!parts.length) return { css: '', etag: null, files: 0 };
  const etag = `"th${crypto.createHash('sha256').update(stamps.join('|')).digest('base64url').slice(0, 22)}"`;
  return { css: parts.join('\n'), etag, files: parts.length };
}

// ---------------------------------------------------------------- 应用工厂

function createApp(options = {}) {
  const config = options.config || defaultConfig;
  const now = options.now || (() => Date.now());

  const repo = options.repo || createRepo(openDatabase(config.DB_PATH));
  const captcha = options.captcha || createCaptchaService({ repo, config, now });

  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);

  // ---- 安全响应头（留在 Node 里，可被测试断言，而不是散落在 nginx 配置）----
  app.use((req, res, next) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      // 现有页面使用 Google Fonts；收紧时需一并自托管字体
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; ');
    res.set('Content-Security-Policy', csp);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.IS_PROD) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // 注意：不在此处全局解析 body。写接口的链条是
  // origin → length → phase → cap → content-type → parse，
  // 未通过前置守卫的请求根本不会被解析（见 spec §4）。
  const jsonParser = express.json({ limit: config.BODY_LIMIT, strict: true });

  // ---- 会话 ----
  function ensureSid(req, res) {
    if (req._sid) return req._sid;
    const cookies = parseCookies(req.get('cookie'));
    let sid = cookies[config.COOKIE_NAME];
    if (!sid || !SID_PATTERN.test(sid)) {
      sid = crypto.randomBytes(18).toString('base64url');
      const attrs = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${60 * 60 * 24 * 30}`];
      if (config.COOKIE_SECURE) attrs.push('Secure');
      res.append('Set-Cookie', `${config.COOKIE_NAME}=${encodeURIComponent(sid)}; ${attrs.join('; ')}`);
    }
    req._sid = sid;
    repo.ensureSession(sid, now());
    return sid;
  }

  function clientIpHash(req) {
    return hashText(config.PEPPER_IP, normalizeIp(req.ip));
  }

  // ---- 前置守卫 ----
  function originGuard(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');
    const expected = config.ALLOWED_ORIGIN || `${req.protocol}://${req.get('host')}`;

    const deny = (why) => {
      repo.logEvent({ kind: 'bad_origin', ipHash: clientIpHash(req), detail: `${why}:${origin || '-'}`, nowMs: now() });
      res.status(403).json({ ok: false, code: 'BAD_ORIGIN', message: '请求来源不合法' });
    };

    if (site && site !== 'same-origin' && site !== 'none') return deny(`site=${site}`);
    // 精确字符串匹配：禁止后缀/Host 匹配，否则 campuslink.vip.evil.com 能通过
    if (origin && origin !== expected) return deny('origin-mismatch');
    if (!origin && !site) {
      let expectedHost = null;
      try { expectedHost = new URL(expected).host; } catch { expectedHost = null; }
      if (expectedHost && req.get('host') !== expectedHost) return deny('host-mismatch');
    }
    return next();
  }

  function lengthGuard(req, res, next) {
    const len = Number.parseInt(req.get('content-length') || '0', 10);
    if (Number.isFinite(len) && len > config.BODY_LIMIT) {
      return res.status(413).json({ ok: false, code: 'TOO_LARGE', message: '请求体过大' });
    }
    next();
  }

  function requireJson(req, res, next) {
    if (!req.is('application/json')) {
      return res.status(415).json({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: '请求格式不受支持' });
    }
    next();
  }

  /** 阶段门控：报名与修改仅在开放期可用 */
  function phaseGuard(req, res, next) {
    const info = phaseInfo(repo.getSettings(), now());
    if (!info.open) {
      repo.logEvent({ kind: 'phase_block', ipHash: clientIpHash(req), detail: info.phase, nowMs: now() });
      return res.status(403).json({
        ok: false,
        code: 'REGISTRATION_CLOSED',
        message: info.phase === 'warmup' ? '报名尚未开放' : '报名已截止',
        opens_at: info.opens_at,
        closes_at: info.closes_at,
        phase: info.phase,
      });
    }
    next();
  }

  function capGuard(req, res, next) {
    const { totalCap } = settingsView(repo, config);
    if (repo.countApplications() >= totalCap) {
      repo.logEvent({ kind: 'flood', ipHash: clientIpHash(req), detail: `total_cap=${totalCap}`, nowMs: now() });
      return res.status(503).json({ ok: false, code: 'TOTAL_CAP', message: '报名人数已达上限，请联系管理员' });
    }
    next();
  }

  // ---- 静态资源 ----
  app.use(express.static(config.PUBLIC_DIR, {
    index: 'index.html',
    dotfiles: 'ignore',
    etag: true,
    setHeaders(res) {
      res.set('Cache-Control', 'no-cache');
    },
  }));

  // ---------------------------------------------------------------- 接口

  app.get('/api/health', (req, res) => {
    const info = phaseInfo(repo.getSettings(), now());
    res.json({ ok: true, phase: info.phase });
  });

  app.get('/api/form-config', (req, res) => {
    const sid = ensureSid(req, res);
    const t = now();
    repo.touchSession(sid, t);
    repo.pruneFormStarts(t - 24 * 60 * 60_000);

    const formId = crypto.randomBytes(12).toString('base64url');
    repo.insertFormStart(formId, sid, t);

    const { honeypotField, contactEmail } = settingsView(repo, config);
    const info = phaseInfo(repo.getSettings(), t);

    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      phase: info.phase,
      registration: {
        open: info.open,
        opens_at: info.opens_at,
        closes_at: info.closes_at,
      },
      form_id: formId,
      honeypot_field: honeypotField,
      contact_email: contactEmail,
      wechat_qr_url: '/api/wechat-qr',
      student_id_pattern: '^2026\\d{6}$',
      limits: { name: 20, class_name: 30, contact: 50, major: 30, intro: 200, learned: 200, ai_views: 200 },
      directions: ['软件', '硬件', '算法', '人工智能'],
      contact_types: ['wechat', 'phone'],
    });
  });

  app.get('/api/captcha', (req, res) => {
    const sid = ensureSid(req, res);
    const result = captcha.issue(sid);
    res.set('Cache-Control', 'no-store');
    if (!result.ok) {
      return res.status(429).json({ ok: false, code: 'CAPTCHA_QUOTA', message: '请求过于频繁，请稍后再试' });
    }
    res.json({ ok: true, captcha_id: result.id, svg: result.svg });
  });

  app.get('/api/announcements', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      announcements: repo.listVisibleAnnouncements(20).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned === 1,
        published_at: a.published_at,
      })),
    });
  });

  app.get('/api/links', (req, res) => {
    res.json({ ok: true, links: repo.getLinks() });
  });

  // ---- 主题仓库 ----
  app.get('/api/themes.css', (req, res) => {
    const { css, etag, files } = buildThemesCss(config.THEMES_DIR);
    if (!files) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).type('text/css').send('/* themes/ 下没有主题文件 */');
    }
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache'); // 允许缓存但每次回源校验；改主题后立即生效
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.type('text/css').send(css);
  });

  app.get('/api/wechat-qr', (req, res) => {
    const file = findQrFile(config.QR_DIR);
    if (!file) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).json({ ok: false, code: 'QR_UNAVAILABLE', message: '招新群二维码暂未配置' });
    }
    const st = fs.statSync(file);
    // mtime 精度不足，带上 size 降低碰撞
    const etag = `"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache'); // 允许缓存但每次回源校验；换图后立即生效
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.set('Content-Type', MIME_BY_EXT[path.extname(file)] || 'application/octet-stream');
    res.sendFile(file);
  });

  // ---- 提交报名 ----
  app.post('/api/applications',
    originGuard, lengthGuard, phaseGuard, capGuard, requireJson, jsonParser,
    (req, res) => {
      const t = now();
      const sid = ensureSid(req, res);
      const ipHash = clientIpHash(req);
      const cfg = settingsView(repo, config);
      const payload = req.body || {};

      // 7. 字段校验（先便宜的先拒）
      const v = validateApplication(payload, { honeypotField: cfg.honeypotField });
      if (!v.ok) {
        return res.status(400).json({
          ok: false, code: 'VALIDATION', message: v.errors[0].message,
          errors: v.errors,
        });
      }

      // 8. 会话配额（在验证码之前检查，避免被限流的用户白白损失一张验证码）
      const used = repo.windowCount(sid, 'submit', t, config.QUOTA.submitWindowMs);
      if (used >= config.QUOTA.submitPerWindow) {
        repo.logEvent({ kind: 'quota', sid, ipHash, detail: 'submit', nowMs: t });
        return res.status(429).json({ ok: false, code: 'SESSION_QUOTA', message: '提交过于频繁，请稍后再试' });
      }

      // 9. 验证码校验 + 原子消费
      const cap = captcha.verify({
        id: payload.captcha_id,
        sid,
        answer: payload.captcha_answer,
      });
      if (!cap.ok) {
        repo.logEvent({ kind: 'captcha_fail', sid, ipHash, detail: cap.reason, nowMs: t });
        if (cap.reason === 'missing') {
          return res.status(400).json({ ok: false, code: 'CAPTCHA_REQUIRED', message: '请完成人机验证' });
        }
        return res.status(400).json({ ok: false, code: 'CAPTCHA_INVALID', message: '验证码错误或已过期，请点"换一张"重试' });
      }
      repo.bumpWindowed(sid, 'submit', t, config.QUOTA.submitWindowMs);

      // 10. 归一化 + 哈希
      const values = v.values;
      const contentHash = contentHashOf(values);
      const dwellMs = (() => {
        if (!payload.form_id || typeof payload.form_id !== 'string') return null;
        const started = repo.takeFormStart(payload.form_id, sid);
        return started === null ? null : Math.max(0, t - started);
      })();

      // 11. 风险评分
      const risk = assess({
        repo, values, honeypot: v.honeypot, contentHash, ipHash, sid, dwellMs, now: t,
        config: {
          riskWindowMs: config.RISK_WINDOW_MS,
          floodThreshold: config.FLOOD_THRESHOLD,
        },
      });

      // 12. 写入（数据库唯一约束兜底，不用"先查后插"）
      const editToken = newEditToken();
      let newId;
      try {
        newId = repo.insertApplication({
          ...values,
          edit_token_hash: hashText(config.PEPPER_EDIT, editToken),
          content_hash: contentHash,
          risk_score: risk.score,
          risk_flags: JSON.stringify(risk.flags),
          ip_hash: ipHash,
          ua_hash: hashText(config.PEPPER_IP, req.get('user-agent') || ''),
          dwell_ms: dwellMs,
          created_ms: t,
          created_at: T.utcSql(t),
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          repo.logEvent({ kind: 'student_dup', sid, ipHash, detail: 'create', nowMs: t });
          return res.status(409).json({
            ok: false,
            code: 'STUDENT_EXISTS',
            // 注意：不得包含任何已有记录的信息（姓名/联系方式/id 都不出现）
            message: `该学号已提交过报名。如为本人修改信息，请使用首次提交时显示的编辑码；如编辑码已丢失，请联系 ${cfg.contactEmail} 人工核验。`,
          });
        }
        throw err;
      }

      if (v.honeypot) {
        repo.logEvent({ kind: 'honeypot', sid, ipHash, detail: `id=${newId}`, nowMs: t });
      }

      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        status: 'created',
        edit_token: editToken, // 仅此一次返回，服务端只存 HMAC
        message: '报名已提交。请立即保存下方编辑码，修改信息时需要它，我们不会再次显示。',
      });
    });

  // ---- 编辑：第一步，凭学号 + 编辑码取回当前值 ----
  app.post('/api/applications/edit/lookup',
    originGuard, lengthGuard, phaseGuard, requireJson, jsonParser,
    (req, res) => {
      const t = now();
      const sid = ensureSid(req, res);
      const ipHash = clientIpHash(req);
      const cfg = settingsView(repo, config);
      const { student_id, edit_token } = req.body || {};

      const fails = repo.windowCount(sid, 'edit_fail', t, config.QUOTA.editFailWindowMs);
      if (fails >= config.QUOTA.editFailPerWindow) {
        repo.logEvent({ kind: 'quota', sid, ipHash, detail: 'edit_lookup', nowMs: t });
        return res.status(429).json({ ok: false, code: 'SESSION_QUOTA', message: '尝试过于频繁，请稍后再试' });
      }

      const row = typeof student_id === 'string' ? repo.findByStudentId(cleanText(student_id)) : null;
      const submittedHash = hashText(config.PEPPER_EDIT, typeof edit_token === 'string' ? edit_token : '');
      // 无论记录是否存在都做一次恒定时间比较，避免用响应时间区分"学号是否存在"
      const expectedHash = row ? row.edit_token_hash : crypto.createHash('sha256').update('absent').digest('hex');
      const tokenOk = crypto.timingSafeEqual(
        Buffer.from(submittedHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );

      if (!row || !tokenOk) {
        repo.bumpWindowed(sid, 'edit_fail', t, config.QUOTA.editFailWindowMs);
        repo.logEvent({ kind: 'edit_token_fail', sid, ipHash, detail: 'lookup', nowMs: t });
        return res.status(401).json({ ok: false, code: 'TOKEN_INVALID', message: '学号或编辑码不正确。' });
      }

      res.set('Cache-Control', 'no-store');
      // 不含 id / ip_hash / risk_* / review_*
      res.json({
        ok: true,
        current: {
          student_id: row.student_id,
          name: row.name,
          class_name: row.class_name,
          contact_type: row.contact_type,
          contact: row.contact,
          major: row.major,
          direction: row.direction,
          intro: row.intro,
          learned: row.learned || '',
          ai_views: row.ai_views || '',
        },
      });
    });

  // ---- 编辑：第二步，提交修改 ----
  app.post('/api/applications/edit',
    originGuard, lengthGuard, phaseGuard, capGuard, requireJson, jsonParser,
    (req, res) => {
      const t = now();
      const sid = ensureSid(req, res);
      const ipHash = clientIpHash(req);
      const cfg = settingsView(repo, config);
      const payload = req.body || {};

      const fails = repo.windowCount(sid, 'edit_fail', t, config.QUOTA.editFailWindowMs);
      if (fails >= config.QUOTA.editFailPerWindow) {
        repo.logEvent({ kind: 'quota', sid, ipHash, detail: 'edit', nowMs: t });
        return res.status(429).json({ ok: false, code: 'SESSION_QUOTA', message: '尝试过于频繁，请稍后再试' });
      }

      const v = validateApplication(payload, { honeypotField: cfg.honeypotField });
      if (!v.ok) {
        return res.status(400).json({
          ok: false, code: 'VALIDATION', message: v.errors[0].message, errors: v.errors,
        });
      }

      const { student_id, edit_token } = payload;
      const row = typeof student_id === 'string' ? repo.findByStudentId(cleanText(student_id)) : null;
      const submittedHash = hashText(config.PEPPER_EDIT, typeof edit_token === 'string' ? edit_token : '');
      const expectedHash = row ? row.edit_token_hash : crypto.createHash('sha256').update('absent').digest('hex');
      const tokenOk = crypto.timingSafeEqual(
        Buffer.from(submittedHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
      if (!row || !tokenOk) {
        repo.bumpWindowed(sid, 'edit_fail', t, config.QUOTA.editFailWindowMs);
        repo.logEvent({ kind: 'edit_token_fail', sid, ipHash, detail: 'update', nowMs: t });
        return res.status(401).json({ ok: false, code: 'TOKEN_INVALID', message: '学号或编辑码不正确。' });
      }

      const used = repo.windowCount(sid, 'submit', t, config.QUOTA.submitWindowMs);
      if (used >= config.QUOTA.submitPerWindow) {
        repo.logEvent({ kind: 'quota', sid, ipHash, detail: 'edit_submit', nowMs: t });
        return res.status(429).json({ ok: false, code: 'SESSION_QUOTA', message: '提交过于频繁，请稍后再试' });
      }

      const cap = captcha.verify({ id: payload.captcha_id, sid, answer: payload.captcha_answer });
      if (!cap.ok) {
        repo.logEvent({ kind: 'captcha_fail', sid, ipHash, detail: cap.reason, nowMs: t });
        if (cap.reason === 'missing') {
          return res.status(400).json({ ok: false, code: 'CAPTCHA_REQUIRED', message: '请完成人机验证' });
        }
        return res.status(400).json({ ok: false, code: 'CAPTCHA_INVALID', message: '验证码错误或已过期，请点"换一张"重试' });
      }
      repo.bumpWindowed(sid, 'submit', t, config.QUOTA.submitWindowMs);

      const values = v.values;
      const contentHash = contentHashOf(values);
      const changed = [];
      for (const f of ['name', 'class_name', 'contact_type', 'contact', 'major', 'direction', 'intro', 'learned', 'ai_views']) {
        const before = row[f] === null || row[f] === undefined ? '' : row[f];
        const after = values[f] === null || values[f] === undefined ? '' : values[f];
        if (String(before) !== String(after)) changed.push(f);
      }

      const risk = assess({
        repo, values, honeypot: v.honeypot, contentHash, ipHash, sid, dwellMs: null,
        excludeId: row.id, now: t,
        config: { riskWindowMs: config.RISK_WINDOW_MS, floodThreshold: config.FLOOD_THRESHOLD },
      });

      repo.raw.exec('BEGIN');
      try {
        repo.updateApplication(row.id, {
          ...values,
          content_hash: contentHash,
          risk_score: risk.score,
          risk_flags: JSON.stringify(risk.flags),
          updated_ms: t,
          updated_at: T.utcSql(t),
        });
        repo.insertEdit({ application_id: row.id, fields: changed, ip_hash: ipHash, ts_ms: t });
        repo.raw.exec('COMMIT');
      } catch (err) {
        repo.raw.exec('ROLLBACK');
        throw err;
      }

      // 编辑后重新签发编辑码：用户可能已把旧的弄丢，这里再给一次
      const freshToken = newEditToken();
      repo.setEditTokenHash(row.id, hashText(config.PEPPER_EDIT, freshToken));

      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        status: 'updated',
        edit_token: freshToken,
        changed,
        message: '报名信息已更新。新的编辑码如下，请重新保存。',
      });
    });

  // ---- 404 / 错误处理 ----
  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '接口不存在' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, code: 'BAD_JSON', message: '请求体不是合法的 JSON' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, code: 'TOO_LARGE', message: '请求体过大' });
    }
    // 细节只进服务端日志，绝不回给客户端
    const requestId = crypto.randomBytes(6).toString('hex');
    console.error(`[error ${requestId}]`, err && err.stack ? err.stack : err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: '服务器开小差了，请稍后重试', request_id: requestId });
  });

  app.locals.repo = repo;
  app.locals.config = config;
  app.locals.captcha = captcha;
  return app;
}

// ---------------------------------------------------------------- 直接启动

if (require.main === module) {
  const app = createApp();
  const { PORT } = defaultConfig;
  // 显式绑定 IPv4 0.0.0.0：WSL mirrored 网络下只有 IPv4 监听才能被转发到 Windows localhost
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 实验室招新网站已启动: http://localhost:${PORT}`);
    console.log(`   数据库: ${defaultConfig.DB_PATH}`);
    const info = phaseInfo(app.locals.repo.getSettings(), Date.now());
    console.log(`   当前阶段: ${info.phase}${info.open ? '（报名开放）' : '（报名未开放）'}`);
  });
}

module.exports = { createApp, normalizeIp, isUniqueViolation, parseCookies, contentHashOf, buildThemesCss };
