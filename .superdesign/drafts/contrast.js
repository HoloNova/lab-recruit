/* ============================================================
   对比度实测（采像素，不是算的）

   方法来自本项目自己的教训（specs §16）：
     1. 只藏**文字**，不能藏容器 —— visibility:hidden 会连元素自己的背景一起藏掉，
        弹钮上曾因此量出 1.29:1 的假结论。这里统一用 color:transparent。
     2. 采样区向内缩 3px，避开元素边缘那 1px 的高光/描边。
        （曾量到玻璃自己的顶边高光，得出「2.09:1」的假结论，扫 18 组参数结论都不变
          —— 调参没影响，就说明测的不是那个东西。）

   要量的是「玻璃后面最亮的那块代码」—— 这是玻璃方案唯一的硬指标。
   每个元素先滚到视口中央再截：视口截图 + getBoundingClientRect 是同一套坐标系，
   不会出现「裁剪区在画面外」的假错误，也顺带覆盖了不同位置的代码亮度。
   ============================================================ */
const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL = 'file:///home/holonova/workspace/432web/.superdesign/drafts/03-session.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  ['.h1', 'hero 标题', '场域 + 遮罩上'],
  ['.lede', 'hero 导语', '场域 + 遮罩上'],
  ['.btn', '主按钮墨字', '亮蓝实底'],
  ['.shell .h2', '区块标题', '玻璃上'],
  ['.dir-desc', '方向说明', '玻璃上'],
  ['#dir-hint', '提示文字', '玻璃上'],
  ['.tl-desc', '流程说明', '玻璃上'],
  ['.pane-bar .pane-meta', '必填读数', '玻璃上的抬升面'],
  ['.pane-body .field label', '表单标签', '玻璃上的凹陷面'],
  ['.foot', '页脚（装饰档）', '玻璃上'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(9000);   // 等代码铺满、亮度进入常态
    // WORST=1：调 freeze() 把当前文件铺成**终态**（所有 token 都亮着）再量。
    // 打字过程中很多行还没显出来，只测「正在打」会得出偏乐观的数字。
    if (process.env.WORST) {
      await page.evaluate(() => { window.codefield.freeze(); });
      await sleep(400);
      console.log('  [终态 worst-case：整份文件已写完]');
    }

    // 一次性读齐所有目标元素的位置与文字色（**必须在藏字之前**，
    // 否则从第二个目标开始读到的就是 transparent，会得出 1.0:1 的假报废）。
    const targets = await page.evaluate((list) => list.map(([sel, label, where]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { sel, label, where, color: getComputedStyle(el).color };
    }).filter(Boolean), TARGETS);

    // 只让文字透明：一切背景（玻璃、遮罩、场域）保持原样，且只注入一次。
    // 必须连伪元素一起管：`*` 不匹配伪元素，.h2-en 的 `❯` 会继续用强调色画出来
    // —— 而它就在 .h2 的取样框里，会被当成「背景最亮像素」（实测就这么错过一次，
    // 得出 2.49:1 的假报废）。
    await page.addStyleTag({ content: '.page *, .page *::before, .page *::after, .top *, .top *::before, .top *::after { color: transparent !important }'  /* 只藏内容层 —— 绝不能碰 .cf，代码就是被测的那个「背景」 */ });
    await sleep(200);

    console.log(`\n=== ${name} ${vp.width}×${vp.height} · 文字 vs 玻璃背后最亮像素 ===`);
    for (const t of targets) {
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), t.sel);
      await sleep(300);
      const row = await page.evaluate(({ s, color }) => {
        const toLin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = (p) => 0.2126 * toLin(p[0]) + 0.7152 * toLin(p[1]) + 0.0722 * toLin(p[2]);
        const b = document.querySelector(s).getBoundingClientRect();
        return { color, box: { x: b.x, y: b.y, w: b.width, h: b.height }, lum: lum(color.match(/\d+/g).slice(0, 3).map(Number)) };
      }, { s: t.sel, color: t.color });
      const buf = await page.screenshot();
      const b64 = buf.toString('base64');

      const res = await page.evaluate(async ({ b64, box }) => {
        const toLin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = (p) => 0.2126 * toLin(p[0]) + 0.7152 * toLin(p[1]) + 0.0722 * toLin(p[2]);
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const sx = Math.max(0, Math.round(box.x) + 3), sy = Math.max(0, Math.round(box.y) + 3);
        const w = Math.max(1, Math.round(box.w) - 6), h = Math.max(1, Math.round(box.h) - 6);
        if (sx + w > cv.width || sy + h > cv.height) return { oob: true };
        const px = cx.getImageData(sx, sy, w, h).data;
        let maxL = -1, maxPx = null, sum = [0, 0, 0], n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const p = [px[i], px[i + 1], px[i + 2]];
          const L = lum(p);
          sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
          if (L > maxL) { maxL = L; maxPx = p; }
        }
        return { maxL, maxPx, avg: sum.map((v) => Math.round(v / n)) };
      }, { b64, box: row.box });

      if (res.oob) { console.log(`—   ${t.label}（元素被截断，跳过）`); continue; }
      const cMax = (Math.max(row.lum, res.maxL) + 0.05) / (Math.min(row.lum, res.maxL) + 0.05);
      const lumAvg = (() => { const c = res.avg; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); })();
      const cAvgReal = (Math.max(row.lum, lumAvg) + 0.05) / (Math.min(row.lum, lumAvg) + 0.05);
      const flag = cMax >= 4.5 ? '✅ AA' : cMax >= 3 ? '⚠️ 3–4.5' : '❌ 报废';
      console.log(`${flag}  ${t.label.padEnd(10)} ${cMax.toFixed(2).padStart(6)}:1 (常态 ${cAvgReal.toFixed(1)}:1)  文字${row.color.padEnd(18)} 背后最亮 rgb(${res.maxPx})  ${t.where}`);
    }
    await page.close();
  }
  await browser.close();
})();
