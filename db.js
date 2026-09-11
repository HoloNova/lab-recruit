'use strict';
// 数据库：打开/迁移/查询。使用 Node 内置 node:sqlite，无原生编译。
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // 顺序很关键：busy_timeout 必须先设，否则下面切 WAL 遇到锁会立即失败
  db.exec('PRAGMA busy_timeout = 5000');
  const row = db.prepare('PRAGMA journal_mode').get();
  const currentMode = String(Object.values(row || {})[0] || '').toLowerCase();
  // 已经是 WAL 就不重复设置：切换 journal_mode 需要短暂独占锁，
  // 会导致 CLI 与运行中的服务并发打开时互撞（database is locked）。
  if (currentMode !== 'wal') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= SCHEMA_VERSION) return current;

  db.exec('BEGIN');
  try {
    if (current < 1) {
      db.exec(`
CREATE TABLE applications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  contact_type    TEXT    NOT NULL,
  contact         TEXT    NOT NULL,
  contact_norm    TEXT    NOT NULL,
  major           TEXT    NOT NULL,
  direction       TEXT    NOT NULL,
  intro           TEXT    NOT NULL,
  learned         TEXT,
  ai_views        TEXT,
  edit_token_hash TEXT    NOT NULL,
  content_hash    TEXT    NOT NULL,
  risk_score      INTEGER NOT NULL DEFAULT 0,
  risk_flags      TEXT    NOT NULL DEFAULT '[]',
  review_status   TEXT    NOT NULL DEFAULT 'pending',
  review_note     TEXT,
  reviewed_ms     INTEGER,
  ip_hash         TEXT,
  ua_hash         TEXT,
  dwell_ms        INTEGER,
  edit_count      INTEGER NOT NULL DEFAULT 0,
  created_ms      INTEGER NOT NULL,
  updated_ms      INTEGER,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT,
  CHECK (length(student_id) <= 20),
  CHECK (length(name) <= 20),
  CHECK (length(class_name) <= 30),
  CHECK (length(contact) <= 50),
  CHECK (length(major) <= 30),
  CHECK (length(intro) <= 200),
  CHECK (length(learned) <= 200),
  CHECK (length(ai_views) <= 200)
);
CREATE UNIQUE INDEX idx_app_student_id   ON applications(student_id);
CREATE INDEX        idx_app_ip_created   ON applications(ip_hash, created_ms);
CREATE INDEX        idx_app_contact_norm ON applications(contact_norm);
CREATE INDEX        idx_app_content_hash ON applications(content_hash);
CREATE INDEX        idx_app_created      ON applications(created_ms);

CREATE TABLE captchas (
  id          TEXT    PRIMARY KEY,
  answer_hmac TEXT    NOT NULL,
  sid         TEXT    NOT NULL,
  issued_ms   INTEGER NOT NULL,
  expires_ms  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_ms INTEGER
);
CREATE INDEX idx_captchas_expires ON captchas(expires_ms);
CREATE INDEX idx_captchas_sid     ON captchas(sid, issued_ms);

CREATE TABLE form_sessions (
  sid               TEXT    PRIMARY KEY,
  issued_ms         INTEGER NOT NULL,
  last_seen_ms      INTEGER NOT NULL,
  captcha_count     INTEGER NOT NULL DEFAULT 0,
  captcha_window_ms INTEGER NOT NULL DEFAULT 0,
  submit_count      INTEGER NOT NULL DEFAULT 0,
  submit_window_ms  INTEGER NOT NULL DEFAULT 0,
  edit_fail_count   INTEGER NOT NULL DEFAULT 0,
  edit_fail_window_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE abuse_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_ms   INTEGER NOT NULL,
  ts      TEXT    NOT NULL,
  kind    TEXT    NOT NULL,
  sid     TEXT,
  ip_hash TEXT,
  detail  TEXT
);
CREATE INDEX idx_abuse_kind_ts ON abuse_events(kind, ts_ms);
CREATE INDEX idx_abuse_ip_ts   ON abuse_events(ip_hash, ts_ms);
CREATE INDEX idx_abuse_sid_ts  ON abuse_events(sid, ts_ms);

CREATE TABLE application_edits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  ts_ms          INTEGER NOT NULL,
  ts             TEXT    NOT NULL,
  fields         TEXT    NOT NULL,
  ip_hash        TEXT
);
CREATE INDEX idx_edits_app ON application_edits(application_id, ts_ms);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 表单开始时间：用于服务端计算填写耗时（不信前端传值）
CREATE TABLE form_starts (
  id        TEXT PRIMARY KEY,
  sid       TEXT NOT NULL,
  issued_ms INTEGER NOT NULL
);
CREATE INDEX idx_form_starts_ms ON form_starts(issued_ms);

CREATE TABLE announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1,
  published_ms INTEGER NOT NULL,
  published_at TEXT    NOT NULL
);

CREATE TABLE friend_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);
`);
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const nowSql = new Date(now).toISOString().slice(0, 19).replace('T', ' ');

      const insLink = db.prepare(
        'INSERT INTO friend_links (name, url, description, sort_order, created_at) VALUES (?,?,?,?,?)'
      );
      insLink.run('第一个网站', 'https://example.com/1',
        '这里是第一个网站的简介，点击卡片展开后可在新标签页打开。', 1, nowSql);
      insLink.run('第二个网站', 'https://example.com/2',
        '这里是第二个网站的简介，点击卡片展开后可在新标签页打开。', 2, nowSql);

      const insSetting = db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)'
      );
      insSetting.run('registration_opens_at', '2026-10-08T02:00:00Z', nowIso);
      insSetting.run('registration_closes_at', '', nowIso);
      insSetting.run('phase_override', '', nowIso);
      insSetting.run('honeypot_field', 'website', nowIso);
      insSetting.run('total_cap', '', nowIso);
      insSetting.run('contact_email', '', nowIso);

      db.prepare(
        `INSERT INTO announcements (title, body, pinned, visible, published_ms, published_at)
         VALUES (?,?,?,?,?,?)`
      ).run(
        '招新预热中',
        '实验室招新即将开始。正式报名预计在国庆假期后开放，具体时间会在招新群内和本页面同步通知。\n\n欢迎先加入招新群了解实验室的日常。',
        1, 1, now, nowIso
      );
    }

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return SCHEMA_VERSION;
}

// ---------------------------------------------------------------- 仓储

function createRepo(db) {
  const q = (sql) => db.prepare(sql);

  const stmts = {
    getSetting: q('SELECT value FROM settings WHERE key = ?'),
    allSettings: q('SELECT key, value FROM settings'),
    setSetting: q(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),

    insertApp: q(`INSERT INTO applications
      (student_id, name, class_name, contact_type, contact, contact_norm, major, direction,
       intro, learned, ai_views, edit_token_hash, content_hash, risk_score, risk_flags,
       ip_hash, ua_hash, dwell_ms, created_ms, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    byStudentId: q('SELECT * FROM applications WHERE student_id = ?'),
    byId: q('SELECT * FROM applications WHERE id = ?'),
    countAll: q('SELECT COUNT(*) AS c FROM applications'),
    countRecent: q('SELECT COUNT(*) AS c FROM applications WHERE created_ms >= ?'),
    countRecentIp: q(`SELECT COUNT(*) AS c FROM applications
                      WHERE ip_hash = ? AND created_ms >= ? AND id IS NOT ?`),
    countContactNorm: q(`SELECT COUNT(*) AS c FROM applications
                         WHERE contact_norm = ? AND id IS NOT ?`),
    countContentHash: q(`SELECT COUNT(*) AS c FROM applications
                         WHERE content_hash = ? AND id IS NOT ?`),
    updateApp: q(`UPDATE applications SET
        name = ?, class_name = ?, contact_type = ?, contact = ?, contact_norm = ?,
        major = ?, direction = ?, intro = ?, learned = ?, ai_views = ?,
        content_hash = ?, risk_score = ?, risk_flags = ?,
        edit_count = edit_count + 1, updated_ms = ?, updated_at = ?
      WHERE id = ?`),
    updateReview: q(`UPDATE applications SET review_status = ?, review_note = ?, reviewed_ms = ?
                    WHERE id = ?`),
    updateEditToken: q('UPDATE applications SET edit_token_hash = ? WHERE id = ?'),
    listApps: q(`SELECT * FROM applications ORDER BY risk_score DESC, created_ms ASC LIMIT ? OFFSET ?`),
    listAllForExport: q('SELECT * FROM applications ORDER BY created_ms ASC'),
    deleteBefore: q('DELETE FROM applications WHERE created_ms < ?'),

    insCaptcha: q(`INSERT INTO captchas (id, answer_hmac, sid, issued_ms, expires_ms)
                   VALUES (?,?,?,?,?)`),
    getCaptcha: q('SELECT * FROM captchas WHERE id = ? AND sid = ?'),
    consumeCaptcha: q(`UPDATE captchas SET consumed_ms = ?
                       WHERE id = ? AND sid = ? AND consumed_ms IS NULL`),
    bumpAttempts: q('UPDATE captchas SET attempts = attempts + 1 WHERE id = ?'),
    pruneCaptchas: q('DELETE FROM captchas WHERE expires_ms < ?'),
    countCaptchaIssued: q(`SELECT COUNT(*) AS c FROM captchas
                           WHERE sid = ? AND issued_ms >= ?`),

    getSession: q('SELECT * FROM form_sessions WHERE sid = ?'),
    insSession: q(`INSERT INTO form_sessions (sid, issued_ms, last_seen_ms)
                   VALUES (?,?,?)`),
    touchSession: q('UPDATE form_sessions SET last_seen_ms = ? WHERE sid = ?'),
    setCaptchaWindow: q('UPDATE form_sessions SET captcha_count = ?, captcha_window_ms = ? WHERE sid = ?'),
    setSubmitWindow: q('UPDATE form_sessions SET submit_count = ?, submit_window_ms = ? WHERE sid = ?'),
    setEditFailWindow: q('UPDATE form_sessions SET edit_fail_count = ?, edit_fail_window_ms = ? WHERE sid = ?'),

    insAbuse: q(`INSERT INTO abuse_events (ts_ms, ts, kind, sid, ip_hash, detail)
                 VALUES (?,?,?,?,?,?)`),
    countAbuseSid: q(`SELECT COUNT(*) AS c FROM abuse_events
                      WHERE kind = ? AND sid = ? AND ts_ms >= ?`),
    countAbuseIp: q(`SELECT COUNT(*) AS c FROM abuse_events
                     WHERE kind = ? AND ip_hash = ? AND ts_ms >= ?`),
    recentEvents: q('SELECT * FROM abuse_events ORDER BY ts_ms DESC LIMIT ?'),
    eventsSince: q('SELECT * FROM abuse_events WHERE ts_ms >= ? ORDER BY ts_ms DESC'),

    insEdit: q(`INSERT INTO application_edits (application_id, ts_ms, ts, fields, ip_hash)
                VALUES (?,?,?,?,?)`),
    editsFor: q('SELECT * FROM application_edits WHERE application_id = ? ORDER BY ts_ms DESC'),

    listVisibleAnn: q(`SELECT id, title, body, pinned, published_at FROM announcements
                       WHERE visible = 1 ORDER BY pinned DESC, published_ms DESC LIMIT ?`),
    allAnn: q('SELECT * FROM announcements ORDER BY pinned DESC, published_ms DESC LIMIT ?'),
    insAnn: q(`INSERT INTO announcements (title, body, pinned, visible, published_ms, published_at)
               VALUES (?,?,?,?,?,?)`),
    setAnnVisible: q('UPDATE announcements SET visible = ? WHERE id = ?'),
    setAnnPinned: q('UPDATE announcements SET pinned = ? WHERE id = ?'),
    byIdAnn: q('SELECT * FROM announcements WHERE id = ?'),

    getLinks: q('SELECT id, name, url, description FROM friend_links ORDER BY sort_order, id'),

    insFormStart: q('INSERT INTO form_starts (id, sid, issued_ms) VALUES (?,?,?)'),
    takeFormStart: q('DELETE FROM form_starts WHERE id = ? AND sid = ? RETURNING issued_ms'),
    pruneFormStarts: q('DELETE FROM form_starts WHERE issued_ms < ?'),
  };

  const repo = {
    raw: db,

    // ---- settings ----
    getSetting(key) {
      const row = stmts.getSetting.get(key);
      return row ? row.value : null;
    },
    getSettings() {
      const out = {};
      for (const r of stmts.allSettings.all()) out[r.key] = r.value;
      return out;
    },
    setSetting(key, value) {
      stmts.setSetting.run(key, String(value), new Date().toISOString());
    },

    // ---- applications ----
    insertApplication(a) {
      const info = stmts.insertApp.run(
        a.student_id, a.name, a.class_name, a.contact_type, a.contact, a.contact_norm,
        a.major, a.direction, a.intro, a.learned, a.ai_views,
        a.edit_token_hash, a.content_hash, a.risk_score, a.risk_flags,
        a.ip_hash, a.ua_hash, a.dwell_ms, a.created_ms, a.created_at
      );
      return Number(info.lastInsertRowid);
    },
    findByStudentId(studentId) { return stmts.byStudentId.get(studentId) || null; },
    findById(id) { return stmts.byId.get(id) || null; },
    countApplications() { return stmts.countAll.get().c; },
    countRecentApplications(sinceMs) { return stmts.countRecent.get(sinceMs).c; },
    countRecentByIp(ipHash, sinceMs, excludeId = null) {
      return stmts.countRecentIp.get(ipHash, sinceMs, excludeId).c;
    },
    countByContactNorm(norm, excludeId = null) {
      return stmts.countContactNorm.get(norm, excludeId).c;
    },
    countByContentHash(hash, excludeId = null) {
      return stmts.countContentHash.get(hash, excludeId).c;
    },
    updateApplication(id, a) {
      stmts.updateApp.run(
        a.name, a.class_name, a.contact_type, a.contact, a.contact_norm,
        a.major, a.direction, a.intro, a.learned, a.ai_views,
        a.content_hash, a.risk_score, a.risk_flags,
        a.updated_ms, a.updated_at, id
      );
    },
    setReview(id, status, note, nowMs) {
      stmts.updateReview.run(status, note, nowMs, id);
    },
    setEditTokenHash(id, hash) { stmts.updateEditToken.run(hash, id); },
    listApplications(limit = 50, offset = 0) {
      return stmts.listApps.all(limit, offset);
    },
    listAllForExport() { return stmts.listAllForExport.all(); },
    deleteCreatedBefore(ms) { return stmts.deleteBefore.run(ms).changes; },

    // ---- captcha ----
    insertCaptcha(c) { stmts.insCaptcha.run(c.id, c.answer_hmac, c.sid, c.issued_ms, c.expires_ms); },
    getCaptcha(id, sid) { return stmts.getCaptcha.get(id, sid) || null; },
    consumeCaptcha(id, sid, nowMs) { return stmts.consumeCaptcha.run(nowMs, id, sid).changes; },
    bumpCaptchaAttempts(id) { stmts.bumpAttempts.run(id); },
    pruneCaptchas(beforeMs) { return stmts.pruneCaptchas.run(beforeMs).changes; },
    countCaptchaIssued(sid, sinceMs) { return stmts.countCaptchaIssued.get(sid, sinceMs).c; },

    // ---- sessions ----
    ensureSession(sid, nowMs) {
      let row = stmts.getSession.get(sid);
      if (!row) {
        stmts.insSession.run(sid, nowMs, nowMs);
        row = stmts.getSession.get(sid);
      }
      return row;
    },
    touchSession(sid, nowMs) {
      stmts.touchSession.run(nowMs, sid);
    },
    /** 按窗口自增计数，返回窗口内新的计数值 */
    bumpWindowed(sid, field, nowMs, windowMs) {
      const row = repo.ensureSession(sid, nowMs);
      const countKey = `${field}_count`;
      const winKey = `${field}_window_ms`;
      let count = row[countKey] || 0;
      const win = row[winKey] || 0;
      if (nowMs - win > windowMs) { count = 1; } else { count += 1; }
      const setter = field === 'captcha' ? stmts.setCaptchaWindow
        : field === 'submit' ? stmts.setSubmitWindow
          : stmts.setEditFailWindow;
      setter.run(count, win === 0 || nowMs - win > windowMs ? nowMs : win, sid);
      return count;
    },
    windowCount(sid, field, nowMs, windowMs) {
      const row = stmts.getSession.get(sid);
      if (!row) return 0;
      const count = row[`${field}_count`] || 0;
      const win = row[`${field}_window_ms`] || 0;
      return nowMs - win > windowMs ? 0 : count;
    },

    // ---- abuse events ----
    logEvent({ kind, sid = null, ipHash = null, detail = null, nowMs }) {
      const iso = new Date(nowMs).toISOString();
      stmts.insAbuse.run(nowMs, iso, kind, sid, ipHash, detail);
    },
    countRecentAbuse(kind, { sid = null, ipHash = null }, sinceMs) {
      if (sid) return stmts.countAbuseSid.get(kind, sid, sinceMs).c;
      if (ipHash) return stmts.countAbuseIp.get(kind, ipHash, sinceMs).c;
      return 0;
    },
    recentEvents(limit = 30) { return stmts.recentEvents.all(limit); },
    eventsSince(sinceMs) { return stmts.eventsSince.all(sinceMs); },
    /** 枚举探测：同一 sid/ip 短时间大量学号重复命中 */
    probeGroups(sinceMs, threshold = 5) {
      return db.prepare(`
        SELECT COALESCE(sid,'') AS sid, COALESCE(ip_hash,'') AS ip_hash, COUNT(*) AS n
        FROM abuse_events
        WHERE kind = 'student_dup' AND ts_ms >= ?
        GROUP BY COALESCE(sid,''), COALESCE(ip_hash,'')
        HAVING COUNT(*) >= ?
        ORDER BY n DESC
      `).all(sinceMs, threshold);
    },

    // ---- edits ----
    insertEdit(e) {
      stmts.insEdit.run(e.application_id, e.ts_ms, new Date(e.ts_ms).toISOString(),
        JSON.stringify(e.fields), e.ip_hash ?? null);
    },
    editsFor(id) { return stmts.editsFor.all(id); },

    // ---- announcements ----
    listVisibleAnnouncements(limit = 20) { return stmts.listVisibleAnn.all(limit); },
    listAllAnnouncements(limit = 50) { return stmts.allAnn.all(limit); },
    insertAnnouncement({ title, body, pinned = 0, visible = 1, nowMs }) {
      const info = stmts.insAnn.run(title, body, pinned, visible, nowMs,
        new Date(nowMs).toISOString());
      return Number(info.lastInsertRowid);
    },
    getAnnouncement(id) { return stmts.byIdAnn.get(id) || null; },
    setAnnouncementVisible(id, visible) { stmts.setAnnVisible.run(visible, id); },
    setAnnouncementPinned(id, pinned) { stmts.setAnnPinned.run(pinned, id); },

    // ---- links ----
    getLinks() { return stmts.getLinks.all(); },

    // ---- form starts（填写耗时基准）----
    insertFormStart(id, sid, nowMs) { stmts.insFormStart.run(id, sid, nowMs); },
    /** 一次性取出并删除，防止重放 */
    takeFormStart(id, sid) {
      const row = stmts.takeFormStart.get(id, sid);
      return row ? row.issued_ms : null;
    },
    pruneFormStarts(beforeMs) { return stmts.pruneFormStarts.run(beforeMs).changes; },
  };

  return repo;
}

module.exports = { openDatabase, createRepo, migrate, SCHEMA_VERSION };
