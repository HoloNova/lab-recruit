/* 草稿自检：在真浏览器里打开拼好的草稿，验证「能跑 + 不溢出 + 有对比度」。
   设计稿最容易撒的谎是"看起来对但动不起来"，所以这里量的是运行时的东西。 */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL = 'file:///home/holonova/workspace/432web/.superdesign/drafts/03-session.html';
const OUT = '/home/holonova/workspace/432web/.superdesign/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    await page.goto(URL, { waitUntil: 'load' });
    // 头 4–6 秒是「拉依赖」过渡（只有 .cf-tline），所以要等到编辑器档真正在打字再采。
    // 另外：token 是**先铺好、带 .is-hid 隐藏**的（见 codefield.js fillLine），
    // 所以「在打字」要看 .cf-t:not(.is-hid) 的增长，不能数 .cf-t。
    await sleep(7000);
    const a = await page.evaluate(() => document.querySelectorAll('.cf-t:not(.is-hid)').length);
    await sleep(1600);
    const r = await page.evaluate(() => {
      const cf = window.codefield || null;
      const box = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const small = [...document.querySelectorAll('a, button, input, select, textarea')]
        .filter((e) => !e.hidden && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44)
        .map((e) => (e.tagName + '.' + (e.className || '') + '#' + (e.id || '')).slice(0, 42) + '=' + Math.round(e.getBoundingClientRect().height));
      const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
      return {
        tokens: document.querySelectorAll('.cf-t:not(.is-hid)').length,
        booted: !!cf, current: cf && cf.current, paused: cf && cf.paused,
        cfBox: box('.cf'), bodyBox: box('.cf-body'),
        heroBox: box('.hero-in'), shellBox: box('.shell'),
        counter: cs('.h2', 'counterIncrement') ? getComputedStyle(document.querySelector('.h2'), '::before').content : null,
        eyebrow: getComputedStyle(document.querySelector('.h2-en'), '::before').content,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        docH: document.documentElement.scrollHeight,
        fg0: cs('.h1', 'color'), bg: cs('body', 'backgroundColor'),
        sbBg: cs('.statusbar', 'backgroundColor'),
        sbH: Math.round(document.querySelector('.statusbar').getBoundingClientRect().height),
        qrEmpty: getComputedStyle(document.querySelector('.qr'), '::after').content,
        small,
      };
    });
    await page.screenshot({ path: `${OUT}/shot-${name}.png`, fullPage: false });
    console.log(`\n=== ${name} ${vp.width}x${vp.height} ===`);
    console.log(`引擎: booted=${r.booted} current=${r.current} paused=${r.paused} | 可见 token 7.0s=${a} → 8.6s=${r.tokens} ${r.tokens > a ? '✅ 在打字' : '❌ 没动'}`);
    console.log(`场域: .cf=${JSON.stringify(r.cfBox)}  body=${JSON.stringify(r.bodyBox)}`);
    console.log(`内容: hero=${JSON.stringify(r.heroBox)}  shell=${JSON.stringify(r.shellBox)}`);
    console.log(`眉标⌄${r.eyebrow}  |  页高=${r.docH}px  横向溢出=${r.overflowX}px ${r.overflowX <= 1 ? '✅' : '❌'}`);
    console.log(`颜色: h1=${r.fg0} body=${r.bg} statusbar=${r.sbBg} h=${r.sbH}px | QR空态=${r.qrEmpty}`);
    console.log(`<44px 的可点元素 (${r.small.length}): ${r.small.slice(0, 6).join(' , ') || '无 ✅'}`);
    if (errs.length) console.log('页面错误:', errs);
    await page.close();
  }
  await browser.close();
})();
