/* ============================================================
   三个方向共用一台「打印机」

   素材是真实的，不是重画的：
     真实标记（Playwright 从运行中的站点抓的真实 DOM）
   + 真实 themes/02-editor-dark.css（语法色令牌）
   + 真实 public/codefield.css（场域本体）
   + base.css（机制）
   + <方向>.css（**唯一新写的东西** = 这一版的设计主张）
   + **内联真实 codefield.js / codefield-data.js** → 画布上就地打字

   这样三个方向共享同一份真内容与同一个活体背景，
   差别 100% 来自设计层 —— 比较才是公平的。

   用法：node build-dir.js [d1|d2|d3|all]
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = '/home/holonova/workspace/432web';
const DRAFTS = path.join(ROOT, '.superdesign/drafts');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const parts = JSON.parse(fs.readFileSync(path.join(ROOT, '.superdesign/tmp/parts.json'), 'utf8'));

const DIRS = {
  d1: {
    out: 'd1-trace.html',
    layer: 'd1-trace.css',
    title: 'D1 · 薄纸 TRACE（浅色报告 + 暗色证据窗）',
    rootClass: 'sd sd-d1',
  },
  d2: {
    out: 'd2-hazard.html',
    layer: 'd2-hazard.css',
    title: 'D2 · 警戒线 HAZARD（墨黑 + 警戒黄胶带）',
    rootClass: 'sd sd-d2',
  },
  d3: {
    out: 'd3-scan.html',
    layer: 'd3-scan.css',
    title: 'D3 · 扫描 SCAN（扫描结果表 + 跳数轨道）',
    rootClass: 'sd sd-d3',
  },
};

/* 契约：草稿里不能有相对路径资源 */
const TRANSPARENT = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'/%3E";
const neutralize = (html) => html.replace(/(src=")\/(?!\/)[^"]*(")/g, `$1${TRANSPARENT}$2`);

/* 阶段读数从顶栏搬进固定栏：同一个 id 只能出现一次 */
const PHASE_RE = /<span class="top-status" id="phase-text">([\s\S]*?)<\/span>/;
const phaseMatch = parts.top.match(PHASE_RE);
if (!phaseMatch) throw new Error('parts.top 里找不到 #phase-text —— 源码结构变了，先重跑 extract.js');
const phaseText = phaseMatch[1];
const topHtml = parts.top.replace(PHASE_RE, '');

/* 四个阶段：真实的四段流程（见 #flow 的 .tl-item[data-phase]）的短标签。
   rail 是纯装饰的重复呈现，所以 aria-hidden —— 信息本体在流程列表里。 */
const RAIL = `  <div class="rail" aria-hidden="true">
    <span class="rail-i" data-phase="warmup">预热</span>
    <span class="rail-i" data-phase="signup">报名</span>
    <span class="rail-i" data-phase="review">初筛面试</span>
    <span class="rail-i" data-phase="result">结果</span>
  </div>`;

/* 固定栏：三个真实读数（场域文件名 / 阶段 / 两个锚点），不是装饰 */
const chrome = (phase) => `  <div class="chrome">
    <span class="chrome-file" id="sb-file">❯ AuthController.java · java</span>
    <span class="chrome-sp"></span>
    <span class="chrome-phase"><i class="chrome-dot" aria-hidden="true"></i><span class="top-status" id="phase-text">${phase}</span></span>
    <a class="chrome-link" id="sb-join" href="#join">加群</a>
    <a class="chrome-link chrome-cta" id="sb-apply" href="#apply">报名</a>
  </div>`;

/* 草稿交互：方向行 → 切档（真实站由 app.js §2 做） */
const INTERACT = `
(() => {
  const rows = [...document.querySelectorAll('.dir-row')];
  const sbFile = document.getElementById('sb-file');
  const D = window.CODEFIELD_DATA || {};
  const label = (id) => { const d = D[id]; if (!d) return null;
    return '❯ ' + d.file + ' · ' + (d.lang === 'terminal' ? 'bash' : d.lang); };
  const sync = (id) => { const t = label(id); if (sbFile && t) sbFile.textContent = t;
    rows.forEach((r) => r.setAttribute('aria-pressed', String(r.dataset.dir === id))); };
  const go = (row, pause) => {
    const cf = window.codefield;
    if (!cf || !cf.go || !row.dataset.dir) return;
    if (pause) cf.pause();
    cf.go(row.dataset.dir); sync(row.dataset.dir);
  };
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => go(row, false));
    row.addEventListener('focus', () => go(row, false));
    row.addEventListener('click', () => go(row, true));
  });
  // 友链卡片的展开是真实行为，静态稿补上，好让评审能看到展开态
  document.querySelectorAll('.link-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.open-btn')) return;
      card.setAttribute('aria-expanded', card.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
  });
  setTimeout(() => { const cf = window.codefield; if (cf) sync(cf.current); }, 80);
})();
`;

const style = (label, css) => `<style data-source="${label}">\n${css}\n</style>`;
const script = (label, js) => `<script data-source="${label}">\n${js}\n</script>`;

function build(key) {
  const cfg = DIRS[key];
  const layer = fs.readFileSync(path.join(DRAFTS, cfg.layer), 'utf8');
  const doc = `<!DOCTYPE html>
<html lang="${parts.lang}" data-theme="editor-dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${parts.title}</title>
<meta name="description" content="${parts.description}">
<meta name="theme-color" content="#0b0b0d">
${style('themes/02-editor-dark.css', read('themes/02-editor-dark.css'))}
${style('public/codefield.css', read('public/codefield.css'))}
${style('base.css', fs.readFileSync(path.join(DRAFTS, 'base.css'), 'utf8'))}
${style(cfg.layer + ' (' + key.toUpperCase() + ')', layer)}
</head>
<body>
<div class="${cfg.rootClass}">
  <div class="cf" id="cf-root" data-mode="editor" data-dir="sw" aria-hidden="true">
    <div class="cf-meta"><span class="cf-file">AuthController.java</span><span class="cf-lang">java</span></div>
    <div class="cf-body is-editor"></div>
  </div>
  ${parts.hold}
${RAIL}
${topHtml}
${neutralize(parts.main)}
${chrome(phaseText.trim())}
${script('public/codefield-data.js', read('public/codefield-data.js'))}
${script('public/codefield.js', read('public/codefield.js'))}
${script('draft-interaction', INTERACT)}
</div>
</body>
</html>
`;
  const target = path.join(DRAFTS, cfg.out);
  fs.writeFileSync(target, doc);
  const ids = [...doc.matchAll(/<a\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  const noId = [...doc.matchAll(/<a\b(?![^>]*\bid=)[^>]*>/g)].length;
  console.log(`${key}: ${cfg.out}  ${(doc.length / 1024).toFixed(0)}KB  anchors=${ids.length} 无id=${noId} 重复id=${dupes.length || '0'}`);
}

const which = process.argv[2] || 'all';
for (const key of (which === 'all' ? Object.keys(DIRS) : [which])) build(key);
