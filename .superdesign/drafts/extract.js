const { chromium } = require('/home/holonova/workspace/432web/scout/node_modules/playwright-core');
const fs = require('fs');
const EXE = '/home/holonova/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

  await sleep(1500);   // 等引擎启动；终态由 freeze() 负责，不需要等打字

  // 抓两栏文档的「终态」：引擎自带 go(id) + freeze()（后者取消所有定时器、直接铺终态）。
  // 桌面端分屏的依据也来自这里 —— codefield-data.js 本来就有 4 份文档，用得上。
  const readPane = () => page.evaluate(() => {
    const cf = document.querySelector('.cf');
    return {
      dir: cf.getAttribute('data-dir'),
      mode: cf.getAttribute('data-mode'),
      meta: cf.querySelector('.cf-meta').outerHTML,
      body: cf.querySelector('.cf-body').outerHTML,
    };
  });
  const panes = [];
  for (const id of ['sw', 'hw']) {
    await page.evaluate((d) => { window.codefield.go(d); window.codefield.freeze(); }, id);
    await sleep(350);
    panes.push(await readPane());
  }

  const parts = await page.evaluate(() => {
    // 契约：每个 <a> 必须有唯一描述性 id（真实标记里没有，这里确定性补齐）
    const slug = (s) => (s || '').trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    document.querySelectorAll('a').forEach((a, i) => {
      if (!a.id) a.id = `link-${String(i + 1).padStart(2, '0')}-${slug(a.textContent) || slug(a.getAttribute('href')) || 'anchor'}`;
    });
    const root = document.documentElement;
    const htmlClass = [...root.classList].filter(c => c !== 'js').join(' ');
    return {
      lang: root.getAttribute('lang') || 'zh-CN',
      theme: root.dataset.theme || 'editor-dark',
      htmlClass,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      hold: document.querySelector('.cf-hold')?.outerHTML || '',
      top: document.querySelector('header.top')?.outerHTML || '',
      main: document.querySelector('main.page')?.outerHTML || '',
      anchors: [...document.querySelectorAll('a')].map(a => ({ id: a.id, href: a.getAttribute('href') })),
      badgeNote: document.querySelector('.cf-hold')?.hidden,
      images: [...document.querySelectorAll('img')].map(i => ({ id: i.id, src: (i.getAttribute('src') || '').slice(0, 60), hidden: i.hidden })),
    };
  });
  parts.panes = panes;   // panes 在 Node 作用域里抓的，浏览器端返回对象拿不到
  fs.writeFileSync('/home/holonova/workspace/432web/.superdesign/tmp/parts.json', JSON.stringify(parts, null, 2));
  console.log('lang/theme:', parts.lang, '/', parts.theme, '| htmlClass:', JSON.stringify(parts.htmlClass));
  console.log('panes:', parts.panes.map(x => `${x.dir}(cf-line=${(x.body.match(/cf-line/g) || []).length})`).join(' + '), '| main chars:', parts.main.length, '| top chars:', parts.top.length);
  console.log('anchors:', parts.anchors.map(a => a.id + '->' + a.href).join('  '));
  console.log('images:', JSON.stringify(parts.images));
  await browser.close();
})();
