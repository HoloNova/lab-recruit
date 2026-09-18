/* 真正的 worst-case：把文件铺成终态，然后把整块卡片区域里**最亮的那一个像素**找出来，
   再拿三档文字色去比。前面按元素取样会漏掉「那行代码刚好很短」的位置。 */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL = 'file:///home/holonova/workspace/432web/.superdesign/drafts/03-session.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TIERS = [['--s-fg-0', '242, 245, 250'], ['--s-fg-1', '203, 210, 221'], ['--s-fg-2', '168, 178, 192'], ['--s-fg-3', '126, 136, 150']];
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(URL, { waitUntil: 'load' });
    await sleep(8500);
    await p.evaluate(() => { window.codefield.freeze(); });
    await sleep(400);
    // 把文档列滚到「方向」那块（内容最密、代码行最长的一屏），再藏字
    await p.evaluate(() => document.querySelector('#directions').scrollIntoView({ block: 'start' }));
    await sleep(300);
    await p.addStyleTag({ content: '*, *::before, *::after { color: transparent !important }' });
    await sleep(200);
    const box = await p.evaluate(() => {
      const r = document.querySelector('.shell').getBoundingClientRect();
      return { x: Math.max(0, r.x + 3), y: Math.max(0, r.y + 3), w: Math.min(r.width - 6, innerWidth), h: Math.min(r.height - 6, innerHeight - Math.max(0, r.y + 3)) };
    });
    const buf = await p.screenshot();
    const r = await p.evaluate(async ({ b64, box }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (p) => 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
      const px = cx.getImageData(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)).data;
      const ls = [];
      let maxL = -1, maxPx = null;
      for (let i = 0; i < px.length; i += 4) { const q = [px[i], px[i+1], px[i+2]]; const L = lum(q); ls.push(L); if (L > maxL) { maxL = L; maxPx = q; } }
      ls.sort((a, b2) => a - b2);
      return { maxL, maxPx, p999: ls[Math.floor(ls.length * 0.999)], p99: ls[Math.floor(ls.length * 0.99)], p90: ls[Math.floor(ls.length * 0.9)], n: ls.length };
    }, { b64: buf.toString('base64'), box });
    console.log(`\n=== ${name} · 卡片区域内所有像素（${r.n} px，整份文件已铺满）===`);
    console.log(`  背景亮度 max=${r.maxL.toFixed(4)} rgb(${r.maxPx})  p99.9=${r.p999.toFixed(4)}  p99=${r.p99.toFixed(4)}  中位附近 p90=${r.p90.toFixed(4)}`);
    for (const [name2, rgb] of TIERS) {
      const L = (() => { const v = rgb.split(',').map(Number); const ff = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * ff(v[0]) + 0.7152 * ff(v[1]) + 0.0722 * ff(v[2]); })();
      const c = (Math.max(L, r.maxL) + 0.05) / (Math.min(L, r.maxL) + 0.05);
      const c99 = (Math.max(L, r.p99) + 0.05) / (Math.min(L, r.p99) + 0.05);
      console.log(`  ${name2}  rgb(${rgb})  对全域最亮 ${c.toFixed(2)}:1 ${c >= 4.5 ? '✅' : c >= 3 ? '⚠️' : '❌'}   对 p99 亮峰 ${c99.toFixed(2)}:1`);
    }
    await p.close();
  }
  await b.close();
})();
