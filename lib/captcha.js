'use strict';
// 图形验证码：答案由 crypto.randomInt 生成，svg-captcha 只负责渲染。
// 库内部的 Math.random() 仅用于噪声线条位置/颜色/元素顺序，不参与答案。
const crypto = require('node:crypto');
const svgCaptcha = require('svg-captcha');

// 去掉 0/o/1/l/i 等易混字符
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function createCaptchaService({ repo, config, now = Date.now, generateAnswer: injectedGenerator }) {
  const pepper = config.PEPPER_CAPTCHA;
  const { ttlMs, maxAttempts, length, issuePerWindow, issueWindowMs } = config.CAPTCHA;

  function hmac(answer) {
    return crypto.createHmac('sha256', pepper).update(answer).digest('hex');
  }

  function hmacEquals(a, b) {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  function randomAnswer() {
    let out = '';
    for (let i = 0; i < length; i += 1) out += CHARS[crypto.randomInt(CHARS.length)];
    return out;
  }

  // 答案生成器可注入（仅用于测试）；生产路径始终使用 crypto.randomInt
  const generateAnswer = injectedGenerator || randomAnswer;

  return {
    /**
     * 签发验证码。
     * @returns {{ok:true, id:string, svg:string} | {ok:false, reason:'quota'}}
     */
    issue(sid) {
      const t = now();
      repo.pruneCaptchas(t - 10 * 60_000);

      const issued = repo.countCaptchaIssued(sid, t - issueWindowMs);
      if (issued >= issuePerWindow) return { ok: false, reason: 'quota' };

      const answer = generateAnswer();
      const id = crypto.randomBytes(16).toString('base64url');
      repo.insertCaptcha({
        id,
        answer_hmac: hmac(answer.toLowerCase()),
        sid,
        issued_ms: t,
        expires_ms: t + ttlMs,
      });

      const svg = svgCaptcha(answer, {
        width: 150,
        height: 50,
        fontSize: 45,
        noise: 3,
        // 注意：设置 background 会让库强制开启彩色（源码 `if (bg) options.color = true`），
        // 因此这里是浅色底板 + 彩色字形。彩色噪声对简单 OCR 干扰更强。
        background: '#f4f4f4',
      });

      return { ok: true, id, svg };
    },

    /**
     * 校验并原子消费。
     * @returns {{ok:boolean, reason?:string}}
     */
    verify({ id, sid, answer }) {
      const t = now();
      if (!id || !sid || typeof answer !== 'string') return { ok: false, reason: 'missing' };

      const row = repo.getCaptcha(id, sid);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.consumed_ms) return { ok: false, reason: 'consumed' };
      if (t > row.expires_ms) return { ok: false, reason: 'expired' };
      if (row.attempts >= maxAttempts) return { ok: false, reason: 'too_many' };

      const submitted = answer.normalize('NFKC').trim().toLowerCase().replace(/\s/g, '');
      if (!hmacEquals(hmac(submitted), row.answer_hmac)) {
        repo.bumpCaptchaAttempts(id);
        return { ok: false, reason: 'mismatch' };
      }

      // 原子消费：并发/重放下只有一次能成功
      const changed = repo.consumeCaptcha(id, sid, t);
      if (changed !== 1) return { ok: false, reason: 'replayed' };
      return { ok: true };
    },
  };
}

module.exports = { createCaptchaService, CHARS };
