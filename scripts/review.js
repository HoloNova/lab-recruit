#!/usr/bin/env node
'use strict';
// CLI 审核工具 —— 零 HTTP 暴露，不监听任何端口。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');

const config = require('../config');
const { openDatabase, createRepo } = require('../db');
const { phaseInfo } = require('../lib/phase');
const { computePhase } = require('../lib/phase');
const T = require('../lib/time');
const { assess, levelFor } = require('../lib/risk');

const C = {
  reset: '\u001B[0m', dim: '\u001B[2m', bold: '\u001B[1m',
  green: '\u001B[32m', yellow: '\u001B[33m', red: '\u001B[31m', magenta: '\u001B[35m', cyan: '\u001B[36m',
};
const LEVEL_STYLE = {
  normal: { color: C.green, mark: '  ' },
  watch: { color: C.yellow, mark: '⚠ ' },
  suspicious: { color: C.red, mark: '⚠ ' },
  bot: { color: C.magenta, mark: '⛔' },
};

// 终端注入防护：用户内容可能含 ANSI 转义序列，直接打印会污染审核员终端
const ANSI = /\u001B\[[0-9;]*[A-Za-z]/g;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
function safe(s) {
  return String(s ?? '').replace(ANSI, '').replace(CTRL, ' ').trim();
}
function truncate(s, n) {
  const str = safe(s);
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

const args = parseArgs({
  options: {
    id: { type: 'string' },
    accept: { type: 'string' },
    reject: { type: 'string' },
    waitlist: { type: 'string' },
    note: { type: 'string' },
    events: { type: 'boolean' },
    export: { type: 'string' },
    'open-registration': { type: 'string' },
    'close-registration': { type: 'string' },
    phase: { type: 'string' },
    settings: { type: 'boolean' },
    announce: { type: 'string' },
    body: { type: 'string' },
    pin: { type: 'string' },
    unpublish: { type: 'string' },
    'reset-token': { type: 'string' },
    'qr-status': { type: 'boolean' },
    'set-qr': { type: 'string' },
    purge: { type: 'boolean' },
    before: { type: 'string' },
    limit: { type: 'string' },
    yes: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

const db = openDatabase(config.DB_PATH);
const repo = createRepo(db);
const NOW_MS = Date.now();

function fail(msg) {
  console.error(`${C.red}✗ ${msg}${C.reset}`);
  process.exit(1);
}

function intArg(v, name) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) fail(`--${name} 需要一个整数`);
  return n;
}

// ---------------------------------------------------------------- 列表

function printList() {
  const limit = args.limit ? intArg(args.limit, 'limit') : 50;
  const rows = repo.listApplications(limit, 0);
  if (rows.length === 0) {
    console.log(`${C.dim}暂无报名记录${C.reset}`);
    return;
  }
  console.log(`${C.bold}风险  学号         姓名        方向       提交时间           标记${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(96)}${C.reset}`);
  for (const r of rows) {
    const st = LEVEL_STYLE[levelFor(r.risk_score)] || LEVEL_STYLE.normal;
    let flags = [];
    try { flags = JSON.parse(r.risk_flags || '[]'); } catch { flags = []; }
    const flagText = flags.length ? flags.map((f) => f.label).join('；') : '';
    console.log(
      `${st.color}${st.mark}${String(r.risk_score).padStart(3)}${C.reset}  ` +
      `${safe(r.student_id).padEnd(12)} ${truncate(r.name, 10).padEnd(11)} ` +
      `${safe(r.direction).padEnd(10)} ${T.formatCN(r.created_ms)}  ` +
      `${C.dim}${truncate(flagText, 40)}${C.reset}`
    );
  }
  console.log(`\n${C.dim}共 ${rows.length} 条（最多显示 ${limit} 条，用 --limit 调整）${C.reset}`);
}

function printDetail(id) {
  const r = repo.findById(id);
  if (!r) fail(`找不到 id=${id} 的报名`);
  const st = LEVEL_STYLE[levelFor(r.risk_score)] || LEVEL_STYLE.normal;
  let flags = [];
  try { flags = JSON.parse(r.risk_flags || '[]'); } catch { flags = []; }

  const line = (k, v) => console.log(`  ${C.dim}${k.padEnd(12)}${C.reset}${safe(v) || C.dim + '（空）' + C.reset}`);

  console.log(`\n${st.color}${st.mark} id=${r.id}  风险 ${r.risk_score}（${st.color}${levelFor(r.risk_score)}${C.reset}）${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(72)}${C.reset}`);
  line('学号', r.student_id);
  line('姓名', r.name);
  line('班级', r.class_name);
  line('联系方式', `${r.contact_type === 'phone' ? '手机' : '微信'} ${r.contact}`);
  line('专业', r.major);
  line('方向', r.direction);
  line('个人简介', r.intro);
  line('已学内容', r.learned);
  line('AI 看法', r.ai_views);
  console.log(`${C.dim}${'─'.repeat(72)}${C.reset}`);
  line('提交时间', `${T.formatCN(r.created_ms, true)}（北京时间）`);
  if (r.updated_ms) line('最后修改', `${T.formatCN(r.updated_ms, true)}（共 ${r.edit_count} 次）`);
  line('填写耗时', r.dwell_ms === null ? '未知' : `${(r.dwell_ms / 1000).toFixed(1)} 秒`);
  line('审核状态', r.review_status + (r.review_note ? ` — ${r.review_note}` : ''));
  line('IP 指纹', r.ip_hash ? `${r.ip_hash.slice(0, 16)}…` : '（无）');

  if (flags.length) {
    console.log(`\n${C.bold}风险明细${C.reset}`);
    for (const f of flags) console.log(`  ${st.color}+${String(f.points).padStart(3)}${C.reset}  ${safe(f.label)} ${C.dim}(${f.code})${C.reset}`);
  }

  const edits = repo.editsFor(r.id);
  if (edits.length) {
    console.log(`\n${C.bold}修改历史${C.reset}`);
    for (const e of edits) {
      let fields = [];
      try { fields = JSON.parse(e.fields); } catch { /* ignore */ }
      console.log(`  ${T.formatCN(e.ts_ms, true)}  ${C.dim}${fields.join(', ') || '（无变化）'}${C.reset}`);
    }
  }
  console.log();
}

// ---------------------------------------------------------------- 审核动作

function setReview(id, status, note) {
  const r = repo.findById(id);
  if (!r) fail(`找不到 id=${id} 的报名`);
  repo.setReview(id, status, note || null, NOW_MS);
  console.log(`${C.green}✓${C.reset} id=${id} ${safe(r.name)} → ${C.bold}${status}${C.reset}${note ? `（${note}）` : ''}`);
}

// ---------------------------------------------------------------- 事件

function printEvents() {
  const since = NOW_MS - 7 * 24 * 60 * 60_000;
  const events = repo.eventsSince(since);
  const counts = new Map();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) || 0) + 1);

  console.log(`${C.bold}最近 7 天异常事件${C.reset}`);
  if (events.length === 0) {
    console.log(`${C.dim}无异常事件${C.reset}\n`);
    return;
  }
  for (const [kind, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(18)} ${String(n).padStart(5)}`);
  }

  const probes = repo.probeGroups(since, 5);
  if (probes.length) {
    console.log(`\n${C.red}${C.bold}⚠ 疑似学号枚举探测（ENUM_PROBE）${C.reset}`);
    for (const p of probes) {
      console.log(`  sid=${p.sid || '-'} ip=${p.ip_hash ? p.ip_hash.slice(0, 12) + '…' : '-'}  重复命中 ${p.n} 次`);
    }
  }

  console.log(`\n${C.dim}最近 15 条明细${C.reset}`);
  for (const e of events.slice(0, 15)) {
    console.log(`  ${T.formatCN(e.ts_ms, true)}  ${safe(e.kind).padEnd(16)} ${C.dim}${truncate(e.detail, 40)}${C.reset}`);
  }
  console.log();
}

// ---------------------------------------------------------------- 导出

function csvCell(v) {
  let s = safe(v);
  // 防 Excel 公式注入
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function doExport(dir) {
  const outDir = path.resolve(dir);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const rows = repo.listAllForExport();
  const cols = ['id', 'student_id', 'name', 'class_name', 'contact_type', 'contact', 'major',
    'direction', 'intro', 'learned', 'ai_views', 'risk_score', 'risk_flags',
    'review_status', 'review_note', 'created_at', 'updated_at'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  const file = path.join(outDir, `applications-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(file, `\uFEFF${lines.join('\n')}`, { mode: 0o600 });
  console.log(`${C.green}✓${C.reset} 已导出 ${rows.length} 条 → ${file}`);
}

// ---------------------------------------------------------------- 公告

function addAnnouncement(title, body) {
  if (!title || !body) fail('--announce 需要同时提供 --body');
  if ([...title].length > 80) fail('公告标题最多 80 个字');
  if ([...body].length > 2000) fail('公告正文最多 2000 个字');
  const id = repo.insertAnnouncement({ title, body, nowMs: NOW_MS });
  console.log(`${C.green}✓${C.reset} 公告已发布 id=${id}：${safe(title)}`);
}

// ---------------------------------------------------------------- 群二维码

function qrStatus() {
  const dir = config.QR_DIR;
  const exts = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const file = exts.map((e) => path.join(dir, `wechat-qr${e}`)).find((p) => fs.existsSync(p));
  if (!file) {
    console.log(`${C.yellow}⚠${C.reset} 尚未配置招新群二维码`);
    console.log(`  ${C.dim}把二维码图片保存为 ${path.join(dir, 'wechat-qr.png')} 即可（或用 --set-qr）${C.reset}`);
    return;
  }
  const st = fs.statSync(file);
  const ageDays = (Date.now() - st.mtimeMs) / 86_400_000;
  const warn = ageDays >= 6;
  console.log(`${warn ? C.yellow + '⚠' : C.green + '✓'}${C.reset} ${file}`);
  console.log(`  更新于 ${T.formatCN(st.mtimeMs, true)}（${ageDays.toFixed(1)} 天前）`);
  if (warn) console.log(`  ${C.yellow}微信群二维码 7 天失效，建议立即更换${C.reset}`);
}

function setQr(src) {
  if (!fs.existsSync(src)) fail(`文件不存在: ${src}`);
  const ext = path.extname(src).toLowerCase();
  if (!exts_includes(ext)) fail(`不支持的格式 ${ext}（支持 png/jpg/jpeg/svg/webp）`);
  const dest = path.join(config.QR_DIR, `wechat-qr${ext}`);
  for (const e of ['.png', '.jpg', '.jpeg', '.svg', '.webp']) {
    const old = path.join(config.QR_DIR, `wechat-qr${e}`);
    if (old !== dest && fs.existsSync(old)) fs.unlinkSync(old);
  }
  fs.copyFileSync(src, dest);
  console.log(`${C.green}✓${C.reset} 二维码已更新 → ${dest}`);
  console.log(`  ${C.dim}无需重启：ETag 基于 mtime+size，访客下次请求即可看到新图${C.reset}`);
}
function exts_includes(e) { return ['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(e); }

// ---------------------------------------------------------------- 清理

function purge(before, yes) {
  if (!yes) fail('--purge 是破坏性操作，请追加 --yes 确认');
  if (!before) fail('--purge 需要 --before "YYYY-MM-DD"');
  const ms = T.parseCN(before);
  if (ms === null) fail(`无法解析日期: ${before}`);
  const n = repo.deleteCreatedBefore(ms);
  db.exec('VACUUM');
  console.log(`${C.green}✓${C.reset} 已删除 ${n} 条 ${T.formatCN(ms)} 之前的报名，并执行 VACUUM`);
}

// ---------------------------------------------------------------- 设置

function showSettings() {
  const s = repo.getSettings();
  const info = phaseInfo(s, NOW_MS);
  console.log(`${C.bold}当前设置${C.reset}`);
  console.log(`  phase_override         ${s.phase_override || C.dim + '（空，按时间自动判定）' + C.reset}`);
  console.log(`  registration_opens_at  ${s.registration_opens_at || '（未设置）'}  → ${s.registration_opens_at ? T.formatCN(Date.parse(s.registration_opens_at)) + ' 北京' : ''}`);
  console.log(`  registration_closes_at ${s.registration_closes_at || '（未设置）'}  → ${s.registration_closes_at ? T.formatCN(Date.parse(s.registration_closes_at)) + ' 北京' : ''}`);
  console.log(`  honeypot_field         ${s.honeypot_field}`);
  console.log(`  total_cap              ${s.total_cap || '（空，用默认值）'}`);
  console.log(`  contact_email          ${s.contact_email || '（空，用 config 默认值）'}`);
  console.log(`\n  ${C.bold}当前阶段${C.reset} ${info.phase}  ${info.open ? C.green + '报名开放' + C.reset : C.dim + '报名关闭' + C.reset}`);
  console.log(`  报名总数 ${repo.countApplications()}`);
}

function setPhase(p) {
  const normalized = String(p || '').trim();
  const value = normalized === 'auto' ? '' : normalized;
  if (!['warmup', 'signup', 'review', ''].includes(value)) {
    fail('--phase 只能是 warmup / signup / review / auto');
  }
  repo.setSetting('phase_override', value);
  const info = phaseInfo(repo.getSettings(), NOW_MS);
  console.log(`${C.green}✓${C.reset} phase_override = ${value || 'auto'} → 当前阶段 ${C.bold}${info.phase}${C.reset}`);
}

function setOpen(value) {
  const ms = T.parseCN(value);
  if (ms === null) fail(`无法解析时间: ${value}（应形如 "2026-10-08 10:00"）`);
  repo.setSetting('registration_opens_at', T.toIso(ms));
  console.log(`${C.green}✓${C.reset} 报名开放时间 → ${T.formatCN(ms, true)}（北京时间 / 存 ${T.toIso(ms)}）`);
}

function setClose(value) {
  const ms = T.parseCN(value);
  if (ms === null) fail(`无法解析时间: ${value}（应形如 "2026-10-20 23:59"）`);
  repo.setSetting('registration_closes_at', T.toIso(ms));
  console.log(`${C.green}✓${C.reset} 报名截止时间 → ${T.formatCN(ms, true)}（北京时间 / 存 ${T.toIso(ms)}）`);
}

function resetToken(id) {
  const r = repo.findById(id);
  if (!r) fail(`找不到 id=${id} 的报名`);
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHmac('sha256', config.PEPPER_EDIT).update(token).digest('hex');
  repo.setEditTokenHash(id, hash);
  console.log(`${C.green}✓${C.reset} id=${id}（${safe(r.name)} / ${safe(r.student_id)}）的新编辑码：\n`);
  console.log(`  ${C.bold}${C.cyan}${token}${C.reset}\n`);
  console.log(`${C.yellow}此码只显示这一次，请核验身份后线下告知本人，不要截图发群里。${C.reset}`);
}

// ---------------------------------------------------------------- 入口

function printHelp() {
  console.log(`
${C.bold}实验室招新 · CLI 审核工具${C.reset}

  ${C.bold}审核${C.reset}
    --limit 50                 列表条数（默认 50，按风险分排序）
    --id <n>                   查看详情（全字段 + 风险明细 + 修改历史）
    --accept <n> [--note ..]   标记为通过
    --reject <n> [--note ..]   标记为不通过
    --waitlist <n> [--note ..] 标记为候补
    --events                   最近 7 天异常事件（含疑似学号枚举探测）
    --export <dir>             导出 CSV（含 Excel 公式注入防护）

  ${C.bold}阶段与设置${C.reset}
    --settings                 查看当前设置与阶段
    --open-registration "2026-10-08 10:00"   开放报名（北京时间）
    --close-registration "2026-10-20 23:59"  截止报名（北京时间）
    --phase warmup|signup|review|auto        强制阶段（auto 恢复按时间判定）

  ${C.bold}公告${C.reset}
    --announce "标题" --body "正文"
    --pin <id>                 置顶公告
    --unpublish <id>           下架公告

  ${C.bold}招新群二维码${C.reset}
    --qr-status                查看二维码文件时间与更换提醒
    --set-qr <图片路径>         更新二维码（无需重启）

  ${C.bold}维护${C.reset}
    --reset-token <id>         重新生成编辑码（只打印一次）
    --purge --before "2026-06-01" --yes   删除指定日期前的报名并 VACUUM

  不带参数运行 = 打印报名列表
`);
}

function main() {
  if (args.values.help) {
    printHelp();
    return;
  }

  if (args.values.accept) return setReview(intArg(args.values.accept, 'accept'), 'accepted', args.values.note);
  if (args.values.reject) return setReview(intArg(args.values.reject, 'reject'), 'rejected', args.values.note);
  if (args.values.waitlist) return setReview(intArg(args.values.waitlist, 'waitlist'), 'waitlist', args.values.note);
  if (args.values.id) return printDetail(intArg(args.values.id, 'id'));
  if (args.values.events) return printEvents();
  if (args.values.export) return doExport(args.values.export);

  if (args.values.settings) return showSettings();
  if (args.values['open-registration']) return setOpen(args.values['open-registration']);
  if (args.values['close-registration']) return setClose(args.values['close-registration']);
  if (args.values.phase !== undefined) return setPhase(args.values.phase);

  if (args.values.announce) return addAnnouncement(args.values.announce, args.values.body);
  if (args.values.pin) {
    const id = intArg(args.values.pin, 'pin');
    repo.setAnnouncementPinned(id, 1);
    return console.log(`${C.green}✓${C.reset} 公告 ${id} 已置顶`);
  }
  if (args.values.unpublish) {
    const id = intArg(args.values.unpublish, 'unpublish');
    repo.setAnnouncementVisible(id, 0);
    return console.log(`${C.green}✓${C.reset} 公告 ${id} 已下架`);
  }

  if (args.values['qr-status']) return qrStatus();
  if (args.values['set-qr']) return setQr(args.values['set-qr']);

  if (args.values['reset-token']) return resetToken(intArg(args.values['reset-token'], 'reset-token'));
  if (args.values.purge) return purge(args.values.before, args.values.yes);

  return printList();
}

main();
