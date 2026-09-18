/* ============================================================
   方案 C · Session —— 由**真实代码**拼装草稿（不是重画一遍）

   为什么不是把 HTML 重写一遍：这个页面的差异化资产是**真的在打字**的代码带
   （逐字 / 打错回删 / 整行重写 / 拉依赖 / 终端流式）。设计模型生成的 HTML
   只会画一个"像代码的背景"，动不起来。所以这里反过来：
     真实标记（Playwright 从运行的站点抓的终态 DOM）
   + 真实 themes / codefield.css（场域与语法色）
   + session.css（本轮的设计层 —— 唯一新写的东西）
   + **真实 codefield.js + codefield-data.js（内联）** → 画布上就地打字
   = 一张"能跑的"设计稿。设计评审看到的就是解效时的运动。

   输入：.superdesign/tmp/parts.json（extract.js 产物，随源码更新重跑）
   输出：.superdesign/drafts/03-session.html
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = '/home/holonova/workspace/432web';
const TMP = path.join(ROOT, '.superdesign/tmp');
const OUT = path.join(ROOT, '.superdesign/drafts');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const parts = JSON.parse(fs.readFileSync(path.join(TMP, 'parts.json'), 'utf8'));

/* 契约：草稿里不能有相对路径资源（画布不是本站的服务器）。 */
const TRANSPARENT = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'/%3E";
const neutralize = (html) => html.replace(/(src=")\/(?!\/)[^"]*(")/g, `$1${TRANSPARENT}$2`);

/* 静态稿没有 app.js：[hidden] 与 reveal 的初始态要自己保证 */
const STATIC_FIXES = `
[hidden] { display: none !important; }
`;

/* ---- 1. 顶栏：把阶段读数搬进状态栏（同一个 id，只出现一次） ---- */
const PHASE_RE = /<span class="top-status" id="phase-text">([\s\S]*?)<\/span>/;
const phaseMatch = parts.top.match(PHASE_RE);
if (!phaseMatch) throw new Error('parts.top 里找不到 #phase-text —— 源码结构变了，先重跑 extract.js');
const phaseText = phaseMatch[1];
const topHtml = parts.top.replace(PHASE_RE, '');

/* ---- 2. 状态栏：拇指区。承载三个真实读数，不加新功能 ---- */
const statusbar = `  <div class="statusbar" id="sb">
    <span class="sb-where" id="sb-file">❯ AuthController.java · java</span>
    <span class="sb-sp" aria-hidden="true"></span>
    <span class="sb-phase"><i class="statusdot" aria-hidden="true"></i><span class="top-status" id="phase-text">${phaseText}</span></span>
    <a class="sb-link" id="sb-join" href="#join">加群</a>
    <a class="sb-link sb-cta" id="sb-apply" href="#apply">报名</a>
  </div>`;

/* ---- 3. 场域：整屏。引擎自己会往 .cf-body 里打字，不需要预置终态 ---- */
const field = `  <div class="cf" id="cf-root" data-mode="editor" data-dir="sw" aria-hidden="true">
    <div class="cf-meta"><span class="cf-file">AuthController.java</span><span class="cf-lang">java</span></div>
    <div class="cf-body is-editor"></div>
  </div>`;

/* ---- 4. 草稿交互：把「点方向行」接到场上（真实站是 app.js §2 做的） ---- */
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
    if (pause) cf.pause();          // 手动选过就停自动轮播（真实行为）
    cf.go(row.dataset.dir); sync(row.dataset.dir);
  };
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => go(row, false));
    row.addEventListener('focus', () => go(row, false));
    row.addEventListener('click', () => go(row, true));
  });
  // 友链卡片的展开是真实行为（app.js 里也是 click 切 aria-expanded），
  // 静态稿没有 app.js，这里补上，好让评审能看到展开态。
  document.querySelectorAll('.link-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.open-btn')) return;   // 点链接本身不折叠
      card.setAttribute('aria-expanded', card.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
  });
  setTimeout(() => { const cf = window.codefield; if (cf) sync(cf.current); }, 80);
})();
`;

/* ---- 5. 拼装 ---- */
const style = (label, css) => `<style data-source="${label}">\n${css}\n</style>`;
const script = (label, js) => `<script data-source="${label}">\n${js}\n</script>`;

const doc = `<!DOCTYPE html>
<html lang="${parts.lang}" data-theme="editor-dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${parts.title}</title>
<meta name="description" content="${parts.description}">
<meta name="theme-color" content="#07090f">
${style('themes/02-editor-dark.css', read('themes/02-editor-dark.css'))}
${style('public/codefield.css', read('public/codefield.css'))}
${style('session.css (方案 C)', fs.readFileSync(path.join(OUT, 'session.css'), 'utf8'))}
${style('draft-static-fixes', STATIC_FIXES)}
</head>
<body>
<div>
${field}
${parts.hold}
${topHtml}
${neutralize(parts.main)}
${statusbar}
${script('public/codefield-data.js', read('public/codefield-data.js'))}
${script('public/codefield.js', read('public/codefield.js'))}
${script('draft-interaction', INTERACT)}
</div>
</body>
</html>
`;

fs.mkdirSync(OUT, { recursive: true });
const target = path.join(OUT, '03-session.html');
fs.writeFileSync(target, doc);

const ids = [...doc.matchAll(/<a\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
const anchorsWithoutId = [...doc.matchAll(/<a\b(?![^>]*\bid=)[^>]*>/g)].length;
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
console.log('wrote', path.relative(ROOT, target), (doc.length / 1024).toFixed(0) + 'KB');
console.log('phase-text moved to statusbar:', phaseText.trim(), '| top chars:', topHtml.length);
console.log('anchors:', ids.length, '| without id:', anchorsWithoutId, '| duplicate ids:', dupes.length ? dupes : 'none');
console.log('inline scripts KB:',
  [read('public/codefield-data.js'), read('public/codefield.js'), INTERACT]
    .map((s) => (s.length / 1024).toFixed(0)).join(' + '));
