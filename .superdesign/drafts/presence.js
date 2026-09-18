/* 「动效背景到底还剩多少」—— 全视口逐像素比：场域开着 vs 藏掉。
   与参数无关、与区域选择无关，这是最不含糊的问法。 */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FILES = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const f of FILES) {
    for (const [vpName, vp] of [['桌面', { width: 1440, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
      const p = await b.newPage({ viewport: vp });
      await p.goto('file://' + require('path').resolve(f), { waitUntil: 'load' });
      await sleep(8000);
      await p.evaluate(() => window.codefield.freeze());   // 终态 = 最亮、最满
      await sleep(300);
      const shot = async () => (await p.screenshot()).toString('base64');
      const on = await shot();
      await p.addStyleTag({ content: '.cf { visibility: hidden !important }' });
      await sleep(250);
      const off = await shot();
      const r = await p.evaluate(async ({ a, b2 }) => {
        const load = async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
          const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
          return x.getImageData(0, 0, c.width, c.height); };
        const A = await load(a), B = await load(b2);
        let n = 0, big = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
        for (let i = 0; i < A.data.length; i += 4) {
          const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i+1] - B.data[i+1]) + Math.abs(A.data[i+2] - B.data[i+2]);
          if (d > 8) { n++; const px = (i / 4) % A.width, py = Math.floor((i / 4) / A.width);
            if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
          if (d > 60) big++;
        }
        return { n, big, total: A.width * A.height, box: maxX >= 0 ? [minX, minY, maxX, maxY] : null };
      }, { a: on, b2: off });
      const pct = (r.n / r.total * 100).toFixed(1), bigPct = (r.big / r.total * 100).toFixed(1);
      console.log(`${f.split('/').pop().padEnd(18)} ${vpName}  场域可见像素 ${pct}%（明显的 ${bigPct}%）  bbox=${JSON.stringify(r.box)}`);
      await p.close();
    }
  }
  await b.close();
})();
