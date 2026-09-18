/* 「玻璃到底透出多少背景」——最不含糊的量法：
   同一块卡片区域截两次，一次场域开着、一次把 .cf 藏掉（visibility:hidden），
   两者之差就是代码透过玻璃贡献的亮度。只藏文字，不藏任何容器。 */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL = 'file:///home/holonova/workspace/432web/.superdesign/drafts/03-session.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(URL, { waitUntil: 'load' });
    await sleep(8500);
    await p.evaluate(() => window.codefield.freeze());   // 整份文件铺满 = 最亮状态
    await sleep(300);
    await p.evaluate(() => document.querySelector('#directions').scrollIntoView({ block: 'start' }));
    await sleep(250);
    await p.addStyleTag({ content: '.page *, .page *::before, .page *::after, .top *, .top *::before, .top *::after { color: transparent !important }'  /* 只藏内容层 —— 绝不能碰 .cf，代码就是被测的那个「背景」 */ });
    await sleep(150);
    const rect = await p.evaluate(() => { const r = document.querySelector('.shell').getBoundingClientRect(); return { x: Math.round(r.x) + 3, y: Math.round(r.y) + 3, w: Math.round(r.width) - 6, h: Math.round(r.height) - 6 }; });

    const sample = async (label) => {
      const buf = await p.screenshot();
      return p.evaluate(async ({ b64, rect, label }) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lum = (q) => 0.2126 * f(q[0]) + 0.7152 * f(q[1]) + 0.0722 * f(q[2]);
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        const px = cx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        let sum = 0, n = 0, max = 0, maxPx = null, src = [0, 0, 0];
        for (let i = 0; i < px.length; i += 4) {
          const q = [px[i], px[i + 1], px[i + 2]];
          const L = lum(q); sum += L; n++;
          src[0] += q[0]; src[1] += q[1]; src[2] += q[2];
          if (L > max) { max = L; maxPx = q; }
        }
        return { label, mean: sum / n, max, maxPx, avg: src.map((v) => Math.round(v / n)) };
      }, { b64: buf.toString('base64'), rect, label });
    };

    const on = await sample('场域开着');
    await p.addStyleTag({ content: '.cf { visibility: hidden !important }' });
    await sleep(200);
    const off = await sample('场域藏掉');
    const rgbLum = (r) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r[0]) + 0.7152 * f(r[1]) + 0.0722 * f(r[2]); };
    console.log(`\n=== ${name} · 卡片区域 ${rect.w}×${rect.h} ===`);
    console.log(`  场域开着   平均 rgb(${on.avg})  L=${on.mean.toFixed(5)}   最亮 rgb(${on.maxPx}) L=${on.max.toFixed(4)}`);
    console.log(`  场域藏掉   平均 rgb(${off.avg})  L=${off.mean.toFixed(5)}`);
    console.log(`  → 透过玻璃的代码贡献：平均亮度 +${(((on.mean - off.mean) / off.mean) * 100).toFixed(0)}%（${rgbLum(off.avg) > 0 ? (on.mean / off.mean).toFixed(2) : '-'}×）`);
    console.log(`  → 与「旁边那截清晰代码」比：清晰代码最亮可达 rgb(220,220,170) L≈0.75，差 ${(0.75 / Math.max(on.max, 1e-6)).toFixed(0)}×`);
    await p.close();
  }
  await b.close();
})();
