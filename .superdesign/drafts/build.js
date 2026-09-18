const fs = require('fs');
const path = require('path');
const ROOT = '/home/holonova/workspace/432web';
const TMP = path.join(ROOT, '.superdesign/tmp');   // 中间产物（gitignore）
const LAYERS = path.join(ROOT, '.superdesign/drafts');   // 设计层（归档）
const OUT = path.join(ROOT, '.superdesign/drafts');
fs.mkdirSync(OUT, { recursive: true });

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const parts = JSON.parse(fs.readFileSync(path.join(TMP, 'parts.json'), 'utf8'));

// 契约：不能出现相对路径资源。二维码在真实页面是隐藏的（未配置），这里换成 1x1 data: 占位。
const TRANSPARENT = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'/%3E";
const neutralize = (html) => html.replace(/(src=")\/(?!\/)[^"]*(")/g, `$1${TRANSPARENT}$2`);

// 代码带拼装。split=true → 桌面端双栏分屏（软件 Java + 硬件 C）。
// 双栏是必须的：卡片 1120px 宽，单栏代码只覆盖 18% 宽度，其余 82% 的玻璃背后是空的。
function beltHtml(parts, split) {
  const pane = (p, extra = '') => `<div class="cf-pane${extra}">${p.meta}${p.body}</div>`;
  const inner = split
    ? `<div class="cf-panes">${pane(parts.panes[0])}${pane(parts.panes[1])}</div>`
    : pane(parts.panes[0]);
  return `<div class="cf" id="cf-root" data-mode="editor" aria-hidden="true" data-dir="${parts.panes[0].dir}">${inner}</div>`;
}

// 草稿专用的"静态帧修正"：真实页面靠 app.js 加 html.js 才启用隐藏态，
// 静态导入没有 JS，必须自己保证 [hidden] 与 reveal 初始态正确。
const STATIC_FIXES = `
/* ---- draft static fixes (非设计变更：静态稿没有 JS) ---- */
[hidden] { display: none !important; }
.js .reveal { opacity: 1 !important; transform: none !important; }
`;

function doc({ theme = 'editor-dark', extra = [], title, split = false }) {
  const style = (label, css) => `<style data-source="${label}">\n${css}\n</style>`;
  return `<!DOCTYPE html>
<html lang="${parts.lang}" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title || parts.title}</title>
<meta name="description" content="${parts.description}">
${style('themes/02-editor-dark.css', read('themes/02-editor-dark.css'))}
${style('public/style.css', read('public/style.css'))}
${style('public/codefield.css', read('public/codefield.css'))}
${style('draft-static-fixes', STATIC_FIXES)}
${extra.map(([label, file]) => style(label, fs.readFileSync(file, 'utf8'))).join('\n')}
</head>
<body>
<div>
${beltHtml(parts, split)}
${parts.hold}
${parts.top}
${neutralize(parts.main)}
</div>
</body>
</html>
`;
}

const files = [
  ['00-current.html', { title: '改动前 · 像素复刻（现状）' }],
  ['01-graphite-console.html', { split: true, extra: [['graphite.css (A)', path.join(LAYERS, 'graphite.css')], ['graphite-A-fullpage.css (A)', path.join(LAYERS, 'graphite-A-fullpage.css')]], title: 'Graphite Console · 冷石墨控制台（方案 A）' }],
  ['02-graphite-nebula.html', { split: true, extra: [['graphite.css', path.join(LAYERS, 'graphite.css')], ['graphite-nebula.css (B)', path.join(LAYERS, 'graphite-nebula.css')]], title: 'Graphite Nebula · 冷光控制台（方案 B）' }],
];
for (const [name, opts] of files) {
  fs.writeFileSync(path.join(OUT, name), doc(opts));
  console.log('wrote', path.join('.superdesign/drafts', name), fs.statSync(path.join(OUT, name)).size, 'bytes');
}
