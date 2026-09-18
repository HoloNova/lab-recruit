/* ============================================================
   三个方向的自检 —— 一次跑完「能不能用」与「读不读得清」

   刻意都在**实测**上，不在判断上：
     · 引擎在不在打字（可见 token 递增 —— token 是先铺好带 .is-hid 的）
     · 横向溢出 / 可点元素 <44px / 顶栏是否压住内容
     · 文字对**背后真实像素**的对比度（只藏内容层文字，绝不碰 .cf）
     · 场域透过表层的贡献（开/关 .cf 各截一次比）
   用法：node verify-dir.js <file.html> [tag]
   ============================================================ */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const file = process.argv[2];
const tag = process.argv[3] || file.split('/').pop().replace('.html', '');
const URL = 'file://' + require('path').resolve(file);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEL = [
  ['.h1', 'hero 标题'], ['.lede', 'hero 导语'], ['.btn', '主按钮'],
  ['.h2', '章节标题'], ['.dir-desc', '方向说明'], ['#dir-hint', '提示'],
  ['.tl-desc', '流程说明'], ['.field label', '表单标签'],
  ['.pane-meta', '必填读数'], ['.foot', '页脚'],
];

const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
const parse = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [vpName, vp] of [['桌面', { width: 1440, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 110)));
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(7600);
    const t1 = await page.evaluate(() => document.querySelectorAll('.cf-t:not(.is-hid)').length);
    await sleep(1500);
    const base = await page.evaluate(() => {
      const cf = window.codefield || null;
      const vh = innerHeight, vw = innerWidth;
      const r = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const small = [...document.querySelectorAll('a, button, input, select, textarea')]
        .filter((e) => !e.hidden && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44)
        .map((e) => (e.tagName + '.' + String(e.className).split(' ')[0] + '=' + Math.round(e.getBoundingClientRect().height)).slice(0, 40));
      const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : '—'; };
      return {
        tokens: document.querySelectorAll('.cf-t:not(.is-hid)').length,
        booted: !!cf, current: cf && cf.current,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pageH: document.documentElement.scrollHeight,
        field: r('.cf'), shell: r('.shell'), hero: r('.hero-in') || r('.hero'),
        chromeTop: cs('.chrome', 'top'), chromeBottom: cs('.chrome', 'bottom'),
        railDisplay: cs('.rail', 'display'),
        secBorderTop: cs('.sec', 'borderTopWidth') + ' ' + cs('.sec', 'borderTopColor'),
        small: small.slice(0, 5), smallN: small.length,
        vw, vh,
      };
    });

    // ---- 对比度：只藏内容层文字，代码场域一个字都不碰 ----
    const targets = await page.evaluate((list) => list.map(([s, label]) => {
      const e = document.querySelector(s); if (!e) return null;
      return { s, label, color: getComputedStyle(e).color };
    }).filter(Boolean), SEL);
    await page.addStyleTag({ content: '.page *, .page *::before, .page *::after, .top *, .top *::after, .chrome *, .chrome *::after, .rail * { color: transparent !important }' });
    await sleep(220);
    const rows = [];
    for (const t of targets) {
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), t.s);
      await sleep(230);
      const box = await page.evaluate((s) => {
        const e = document.querySelector(s) || document.querySelector(s.split(' ')[0]);
        const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        let best = null, bestArea = 0;
        while (walk.nextNode()) {
          if (!walk.currentNode.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(walk.currentNode);
          const r = rg.getBoundingClientRect();
          if (r.width * r.height > bestArea) { bestArea = r.width * r.height; best = r; }
        }
        const r = best && bestArea > 40 ? best : e.getBoundingClientRect();
        return { x: Math.max(0, Math.round(r.x) + 3), y: Math.max(0, Math.round(r.y) + 3),
                 w: Math.max(1, Math.round(r.width) - 6), h: Math.max(1, Math.round(r.height) - 6) };
      }, t.s);
      const buf = await page.screenshot();
      const res = await page.evaluate(async ({ b64, box }) => {
        const ff = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = (p) => 0.2126 * ff(p[0]) + 0.7152 * ff(p[1]) + 0.0722 * ff(p[2]);
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        if (box.x + box.w > cv.width || box.y + box.h > cv.height) return null;
        const px = cx.getImageData(box.x, box.y, box.w, box.h).data;
        let max = -1, mx = null, min = 2, mn = null;
        for (let i = 0; i < px.length; i += 4) {
          const p = [px[i], px[i+1], px[i+2]]; const l = L(p);
          if (l > max) { max = l; mx = p; }
          if (l < min) { min = l; mn = p; }
        }
        return { max, mx, min, mn };
      }, { b64: buf.toString('base64'), box });
      if (!res) continue;
      const tl = lum(parse(t.color));
      // 两侧最坏：浅字压深底看最亮像素，深字压浅底看最暗像素 —— 取更差的那侧
      const cMax = (Math.max(tl, res.max) + 0.05) / (Math.min(tl, res.max) + 0.05);
      const cMin = (Math.max(tl, res.min) + 0.05) / (Math.min(tl, res.min) + 0.05);
      const c = Math.min(cMax, cMin);
      const bad = cMax <= cMin ? res.mx : res.mn;
      rows.push({ label: t.label, color: t.color, c, mx: bad });
    }

    // ---- 场域透过表层的贡献 ----
    // 区域必须在**滚动之后**重新量一次：用滚动前的坐标采样会量到别的地方
    const region = await page.evaluate(() => {
      // 用带子**内部**的区域（.dir-list）：外壳会带上胶带/纸边之类的装饰，量到的不是「透过表层能看到什么」
      const e = document.querySelector('.dir-list') || document.querySelector('.hero-in');
      const b = e.getBoundingClientRect();
      const x = Math.max(0, Math.round(b.x) + 3), y = Math.max(0, Math.round(b.y) + 3);
      return { x, y, w: Math.min(Math.round(b.width) - 6, innerWidth - x), h: Math.min(Math.round(b.height) - 6, innerHeight - y) };
    });
    const sample = async () => {
      const buf = await page.screenshot();
      return page.evaluate(async ({ b64, box }) => {
        const ff = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = (p) => 0.2126 * ff(p[0]) + 0.7152 * ff(p[1]) + 0.0722 * ff(p[2]);
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        const px = cx.getImageData(box.x, box.y, Math.min(box.w, cv.width - box.x), Math.min(box.h, cv.height - box.y)).data;
        let sum = 0, n = 0, max = -1, mx = null; const ls = [];
        for (let i = 0; i < px.length; i += 4) {
          const p = [px[i], px[i + 1], px[i + 2]]; const l = L(p);
          sum += l; n++; ls.push(l);
          if (l > max) { max = l; mx = p; }
        }
        ls.sort((a, b) => a - b);
        return { mean: sum / n, max, mx, p999: ls[Math.floor(ls.length * 0.999)] };
      }, { b64: buf.toString('base64'), box: region });
    };
    await page.evaluate(() => window.codefield.freeze());
    await page.evaluate(() => { const e = document.querySelector('.shell') || document.querySelector('.hero-in'); e.scrollIntoView({ block: 'center' }); });
    await sleep(300);
    const on = await sample();
    await page.addStyleTag({ content: '.cf { visibility: hidden !important }' });
    await sleep(200);
    const off = await sample();

    console.log(`\n===== ${tag} · ${vpName} ${vp.width}×${vp.height} =====`);
    console.log(`引擎 ${base.booted ? '✅' : '❌'} current=${base.current} ｜ 可见 token ${t1} → ${base.tokens} ${base.tokens > t1 ? '✅ 在打字' : '❌ 没动'}`);
    console.log(`横向溢出 ${base.overflowX}px ${base.overflowX <= 1 ? '✅' : '❌'} ｜ 页高 ${base.pageH} ｜ <44px 可点元素 ${base.smallN} ${base.smallN === 0 ? '✅' : '❌ ' + base.small.join(' ')}`);
    console.log(`固定栏 top=${base.chromeTop} bottom=${base.chromeBottom} ｜ rail=${base.railDisplay} ｜ 章节上边 ${base.secBorderTop}`);
    console.log(`场域 ${JSON.stringify(base.field)} ｜ 表层 ${JSON.stringify(base.shell)} ｜ hero ${JSON.stringify(base.hero)}`);
    const d = (k) => ((on[k] / off[k] - 1) * 100).toFixed(0) + '%';
    console.log(`代码透过表层：均值 ${d('mean')} ｜ p99.9 ${d('p999')} ｜ 最亮 ${(on.max).toFixed(3)} vs ${(off.max).toFixed(3)}（rgb ${on.mx} vs ${off.mx}）`);
    const worst = rows.slice().sort((a, b) => a.c - b.c);
    console.log('对比度（对背后真实像素）：');
    for (const r of worst) {
      const flag = r.c >= 4.5 ? '✅' : r.c >= 3 ? '⚠️' : '❌';
      console.log(`   ${flag} ${r.label.padEnd(10)} ${r.c.toFixed(2).padStart(6)}:1  文字${r.color.padEnd(18)} 背后 rgb(${r.mx})`);
    }
    if (errs.length) console.log('页面错误:', errs.join(' | '));
    await page.screenshot({ path: `/home/holonova/workspace/432web/.superdesign/tmp/shot-${tag}-${vpName}.png`, fullPage: false });
    await page.close();
  }
  await browser.close();
})();
