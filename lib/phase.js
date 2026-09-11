'use strict';
// 阶段状态机：warmup（预热） / signup（报名） / review（初筛与面试）
// 由 settings 表驱动，运行时可变，无需重启服务。
const { parseIso, toIso, nowMs } = require('./time');

const PHASES = ['warmup', 'signup', 'review'];

function normalizeOverride(raw) {
  const v = String(raw || '').trim();
  return PHASES.includes(v) ? v : '';
}

/**
 * 判定当前阶段。
 * 优先级：phase_override > 截止时间 > 开放时间 > warmup
 */
function computePhase(settings, t = nowMs()) {
  const override = normalizeOverride(settings.phase_override);
  if (override) return override;

  const closes = parseIso(settings.registration_closes_at);
  if (closes !== null && t >= closes) return 'review';

  const opens = parseIso(settings.registration_opens_at);
  if (opens !== null && t >= opens) return 'signup';

  return 'warmup';
}

/** 供 /api/form-config 下发 */
function phaseInfo(settings, t = nowMs()) {
  const phase = computePhase(settings, t);
  const opensMs = parseIso(settings.registration_opens_at);
  const closesMs = parseIso(settings.registration_closes_at);
  return {
    phase,
    open: phase === 'signup',
    forced: normalizeOverride(settings.phase_override) !== '',
    opens_at: opensMs === null ? null : toIso(opensMs),
    closes_at: closesMs === null ? null : toIso(closesMs),
  };
}

module.exports = { PHASES, computePhase, phaseInfo, normalizeOverride };
