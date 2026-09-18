# layouts.md — shared layout components (FULL source)

Everything shared across the page lives here. The site is a **single document** (`public/index.html`);
it has no app shell framework, no layout components in JS — the "shell" is the fixed document head +
the z-index layer stack + `main.page`.

## Layer stack (the layout contract)
```
body
├─ body::before            atmosphere wash        position:fixed  z-index:0
├─ .cf  #cf-root           code belt              position:fixed  z-index:1   aria-hidden
├─ .cf-hold (span)         pause badge            position:fixed  z-index:4   (must stay OUTSIDE .cf)
├─ header.top              glass top bar          position:sticky z-index:4
└─ main.page               content                position:relative z-index:2
   ├─ section.hero  #hero
   ├─ section.sec   #directions
   ├─ section.sec   #flow
   ├─ section.sec.apply #apply
   └─ section.sec   #join   (contains footer.foot)
```
The belt is `position: fixed`, so **it contributes nothing to layout** — content starts at the top of the
page and slides over it. `.cf` carries `contain: layout paint style` plus a transform; anything
`position: fixed` that belongs to the page must therefore live outside it.

---

## 1. Document head + script order
Source: `public/index.html` L1–33 and L324–331
Description: no webfonts; the **stylesheet order is load-bearing** — `style.css` first, then
theme CSS from `/api/themes.css` (same specificity, source order decides), then `codefield.css`
(belt only). `theme-init.js` is a synchronous external script after the stylesheets so it can read the
resolved `--ed-bg` before first paint and set `data-theme` + `<meta theme-color>`.
Do not reorder these links, and do not inline the script (CSP `script-src 'self'`).
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>网络攻防与信息安全 · 实验室招新</title>
  <meta name="description" content="网络攻防与信息安全实验室招新 —— 软件 / 硬件 / 算法 / 人工智能">
  <meta name="theme-color" content="#ffffff">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23ffffff'/%3E%3Ctext x='4' y='22' font-family='monospace' font-size='18' fill='%23005fb8'%3E%26gt;_%3C/text%3E%3C/svg%3E">

  <!--
    字体：全部用系统字体，零下载。
    VSCode 的界面字体就是系统 UI 字体、代码字体就是平台等宽字体，
    所以「跟随系统」才是对这套意象最忠实的实现。
    另：系统等宽 7.83px/字符，比 Martian Mono 的 9.1px 窄，
    350px 内能放 44 字符而不是 38，代码行不容易被截断。
    （字体预算：上一版 130 KB / 7 个文件 → 现在 0）

    颜色定义在 themes/*.css，由 /api/themes.css 提供给下面的样式表链接。
  -->
  <link rel="stylesheet" href="style.css">
  <!-- 必须放在 style.css 之后：两者特异性相同，靠源码顺序让主题生效 -->
  <link rel="stylesheet" href="/api/themes.css">
  <!-- 代码带（背景）的样式。只定义 .cf / .cf-* 与语法颜色，不碰页面布局。 -->
  <link rel="stylesheet" href="codefield.css">
  <!--
    theme-init.js 必须在首次绘制前运行，否则深色用户会先看到一帧白底。
    放在样式表之后是故意的：样式表会阻塞后续脚本执行，所以这里能读到
    已解析的 --ed-bg，用真实值去写 theme-color（手机地址栏 / 状态栏的颜色）。
    同步脚本依然在首次绘制前跑完，不会有闪烁。
  -->
  <script src="theme-init.js"></script>
</head>
```

Script order at the end of `body` (data → engine → app, L324–331):
```html
  </main>

  <!-- 代码带：内容（codefield-data.js）与引擎（codefield.js）分开，
       以后换文案/改代码片段只动数据文件，不用读引擎。 -->
  <script src="codefield-data.js"></script>
  <script src="codefield.js"></script>
  <script src="app.js"></script>
</body>
```

## 2. Top bar — `header.top` / `.top-in` / `.tab` / `.nav` / `.top-cta` / `.prog`
Source: `public/index.html` L61–77 · CSS `public/style.css` L156–264
Description: a very thin frosted bar that stays sticky: an "open editor tab" identity
(`网络攻防与信息安全.md`), a phase status readout (`#phase-text`), 4 anchor links, a right-side 报名 CTA,
and a 1px reading-progress line (`#prog-fill`) at the bottom edge.
Props/variants: `.nav` is hidden below 760px; `.top-cta` appears at the same breakpoint;
`#phase-text` text is phase-driven (`app.js` `applyPhase`); `#prog-fill` width is the only value JS writes
on scroll (transform-free, single element, only when the value changes by ≥0.5%).
```html
  <!-- ============ 顶部：一条很薄的玻璃条 ============ -->
  <header class="top">
    <div class="top-in">
      <a class="tab" href="#hero">
        <span class="tab-name">网络攻防与信息安全</span><span class="tab-ext">.md</span>
      </a>
      <span class="top-status" id="phase-text">预热中</span>
      <nav class="nav" aria-label="页内导航">
        <a href="#directions">方向</a>
        <a href="#flow">流程</a>
        <a href="#apply">报名</a>
        <a href="#join">加群</a>
      </nav>
      <a class="top-cta" href="#apply">报名</a>
    </div>
    <div class="prog" aria-hidden="true"><i id="prog-fill"></i></div>
  </header>
```

```css
/* ============================================================
   顶部：一条很薄的玻璃条

   它参与排版（sticky），所以内容从它下面开始 ——
   这是导航栏的正常行为，和「背景把卡片推下去」是两回事：
   代码带是 fixed 的，它的高度不参与任何排版。
   ============================================================ */
.top {
  position: sticky;
  top: 0;
  z-index: 4;
  -webkit-backdrop-filter: blur(18px) saturate(160%) brightness(.82);
  backdrop-filter: blur(18px) saturate(160%) brightness(.82);
  background: rgba(9, 11, 16, .40);
  border-bottom: 1px solid rgba(255, 255, 255, .10);
}

.top-in {
  max-width: 1120px;
  margin: 0 auto;
  min-height: var(--top-h);
  padding: 0 var(--pad);
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 一个「已打开的标签」—— 编辑器最容易识别的形态 */
.tab {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, .12);
  background: rgba(255, 255, 255, .05);
  text-decoration: none;
  font-size: var(--fs-label);
  line-height: 1.4;
  min-height: 44px;              /* 触控目标下限 */
  align-items: center;
  white-space: nowrap;
  max-width: 46vw;
  overflow: hidden;
}
.tab-name { color: #e8e8e8; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.tab-ext { color: #9aa3b0; font-family: var(--font-code); }

/* 阶段状态：像编辑器的状态栏文字 */
.top-status {
  align-self: center;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, .14);
  font-family: var(--font-code);
  font-size: var(--fs-label);
  color: #b0b8c4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav { display: none; margin-left: auto; gap: 2px; }
.nav a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 8px;
  color: #b0b8c4;
  text-decoration: none;
  font-size: var(--fs-sm);
}
.nav a:hover { color: #fff; background: rgba(255, 255, 255, .07); }
.nav a[aria-current="true"] { color: #fff; background: rgba(255, 255, 255, .10); }

@media (min-width: 760px) { .nav { display: flex; } }

.top-cta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;          /* 触控目标下限，别改小 */
  padding: 0 16px;
  border-radius: 999px;
  background: var(--accent);
  color: #06263f;
  font-size: var(--fs-sm);
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
  transition: transform var(--d-tap) var(--ease-tap);
}
.nav + .top-cta { margin-left: auto; }
@media (min-width: 760px) { .top-cta { margin-left: 8px; } }
.top-cta:hover { transform: scale(1.04); }
.top-cta:active { transform: scale(.97); }

/* 阅读进度：替掉被隐藏的滚动条，只在切段时更新 */
.prog { height: 2px; background: rgba(255, 255, 255, .10); }
.prog i {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: 0 50%;
  transform: scaleX(0);
  background: var(--accent);
}

```

## 3. Content layer + section skeleton — `main.page`, `section.sec`/`section.hero`, `.shell`
Source: `public/index.html` L79–97 (opening pattern, repeated per section) · CSS `public/style.css` L94–155
(base + atmosphere) and L312–345 (section shell)
Description: `.page` is the z2 content layer; each section is `<section class="sec" id="…">` wrapping a
`.shell` glass card. `.hero` is the one section that is not `.sec`. Vertical rhythm is margin-based
(`.sec { margin-bottom: 54px }`, last section 0), horizontal rhythm is `--pad`/`--pad` at ≥1024px.
Section order and ids: `#hero` → `#directions` → `#flow` → `#apply` → `#join`.
```html
  <!-- 内容层：z-index 2，压在代码带（z1）之上 -->
  <main class="page">

    <!-- ============ HERO ============ -->
    <section class="hero" id="hero">
      <div class="hero-in">
        <h1 class="h1">网络攻防与信息安全</h1>

        <p class="lede">攻击与防御，是同一门手艺 —— 欢迎来实验室一起折腾。背后那些不是装饰，是真的在跑的代码：逐字打出来，打错了会删掉重打，改主意了整行重写。</p>

        <a class="btn" href="#directions">看看四个方向</a>
      </div>
    </section>

    <!-- ============ 研究方向 ============ -->
    <section class="sec" id="directions">
      <div class="shell">
        <h2 class="h2"><span class="h2-en">DIRECTIONS</span>你想做什么？</h2>

```

```css
/* ============================================================
   基础
   ============================================================ */
* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  /* 底色不是纯黑：玻璃卡片是「比底色略亮的一层膜」，
     底色要是纯黑，卡片和背景就是同一个黑，只剩描边能看。 */
  background: #0a0c12;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  background: #0a0c12;
  color: #e8e8e8;
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* ============================================================
   氛围层：铺满整页的淡色斑 + 一层极淡点阵

   为什么需要它：代码只占带子的左半边（约 360px），而卡片有 1100px 宽 ——
   卡片大部分区域背后是空的，玻璃没东西可透。
   色斑让玻璃到处都有颜色可糊；点阵提供**边缘**，
   因为纯色渐变被模糊之后还是纯色，看不出「被糊过」。
   ============================================================ */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(rgba(255, 255, 255, .05) 1px, transparent 1px),
    radial-gradient(58% 38% at 12% 6%,  rgba(0, 110, 210, .30), transparent 70%),
    radial-gradient(46% 30% at 92% 18%, rgba(132, 68, 172, .26), transparent 70%),
    radial-gradient(54% 34% at 78% 62%, rgba(18, 140, 122, .21), transparent 72%),
    radial-gradient(64% 40% at 24% 96%, rgba(196, 104, 12, .18), transparent 72%);
  background-size: 22px 22px, auto, auto, auto, auto;
}

::selection { background: rgba(77, 163, 232, .35); color: #fff; }

.mono { font-family: var(--font-code); font-variant-numeric: tabular-nums; }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

img { max-width: 100%; display: block; }

/* 内容层：压在代码带（z1）之上 */
.page { position: relative; z-index: 2; }

```

```css
/* ============================================================
   区块骨架

   ⚠ 注意 padding-top：这里**没有**任何基于 --cf-h 的留白。
      代码带是 fixed 的，高度不参与排版 —— 内容从页面顶部开始。
   ============================================================ */
.sec { padding: 0 var(--pad); }
@media (min-width: 1024px) { .sec { padding: 0 40px; } }

.shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px var(--pad) 28px;
}
@media (min-width: 1024px) { .shell { padding: 34px 36px 40px; } }

/* 卡片之间的间距：这些空隙里露出的是没被遮的代码带。 */
.hero { margin-bottom: 54px; }
.sec { margin-bottom: 54px; }
@media (min-width: 1024px) {
  .hero { margin-bottom: 84px; }
  .sec { margin-bottom: 84px; }
}
.sec:last-of-type { margin-bottom: 0; }

.hero { padding: 16px var(--pad) 0; }
@media (min-width: 1024px) { .hero { padding: 22px 40px 0; } }
.hero-in {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px var(--pad) 28px;
}
@media (min-width: 1024px) { .hero-in { padding: 34px 36px 38px; } }

```

Section wrappers for the remaining three sections (structure only, L132–135, L169–175, L298–304) and the
final bottom spacer (L968–end):
```html
    <!-- ============ 流程 + 公告 ============ -->
    <section class="sec" id="flow">
      <div class="shell">
        <h2 class="h2"><span class="h2-en">FLOW</span>接下来会发生什么</h2>
    <!-- ============ 报名 ============ -->
    <section class="sec apply" id="apply">
      <div class="shell">
        <!-- 文档面：比纸面略深的一块底板，标题栏写清这是什么 -->
        <div class="pane">
          <div class="pane-bar">
            <span class="pane-name">报名表</span>
    <!-- ============ 加群 + 友链 ============ -->
    <section class="sec" id="join">
      <div class="shell">
        <h2 class="h2"><span class="h2-en">GROUP</span>先加群，别错过通知</h2>

        <div class="join-grid">
          <div class="qr">
```

```css
/* ============================================================
   页面底部留白：让最后一张卡片和视口底边之间有点空间
   ============================================================ */
.page { padding-bottom: 72px; }
```

## 4. Code belt layer — `.cf` + `.cf-hold`
Source: markup `public/index.html` L34–58 · CSS `public/codefield.css` L27–294 (full internals in
`components.md` §15; tokens in `theme.md`)
Description: the fixed background layer shared by every screen. It is `aria-hidden="true"` decoration.
The pause badge (`.cf-hold`) is a **sibling**, not a child, of `.cf` — see the comment in the markup.
Props/variants: `data-mode="editor"|"terminal"`; the engine (`codefield.js`) selects documents from
`codefield-data.js` and pauses the belt while the user is filling the form (badge appears with the reason
text via `.cf-hold-text`).
```html
<body>

  <!-- ============ 代码带：钉在页面上侧，底部渐隐到页面底色 ============
       position: fixed，所以它的高度**不参与任何排版** ——
       内容从页面顶部开始，不会被背景推下去。
       内容在它上面滑过去，玻璃卡片把背后的代码糊成颜色透出来。
       id 不能叫 codefield：HTML 的 id 会成为 window 同名全局量，
       一旦脚本初始化失败，window.codefield 会静默变成这个 div。 -->
  <div class="cf" id="cf-root" data-mode="editor" aria-hidden="true">
    <div class="cf-meta">
      <span class="cf-file">AuthController.java</span>
      <span class="cf-lang">java</span>
    </div>
    <div class="cf-body is-editor"></div>
  </div>

  <!-- 暂停徽标：用户开始填表时出现，说明「是我故意停的」而不是卡死了。
       ⚠ 必须挂在 .cf 外面：.cf 上有 transform: translateZ(0)，会成为
          position:fixed 的包含块，徽标会被钉在带子里出不来；
          而且 .cf 有 contain:paint，子元素也溢不出去。
       图标用两段 CSS 画的竖条，不用 ⏸ 这类字符
       （U+23xx 在等宽字体里覆盖不稳，可能变豆腐块）。 -->
  <span class="cf-hold" hidden>
    <i class="cf-hold-bars" aria-hidden="true"></i>
    <span class="cf-hold-text">已暂停</span>
```

## 5. Footer — `footer.foot`
Source: `public/index.html` L320 · CSS `public/style.css` L904–912
Description: one-line copyright inside the last section's glass card (no separate footer band).
```html

        <footer class="foot">© 2026 网络攻防与信息安全实验室</footer>
      </div>
    </section>
```

```css
.foot {
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, .10);
  font-size: var(--fs-label);
  color: #7d8694;
  text-align: center;
}

```

## 6. Runtime shell — `public/theme-init.js` (FULL)
Source: `public/theme-init.js`
Description: the only always-run script that shapes the shell. Sets `html[data-theme]` +
`html[data-theme-source]` before first paint (localStorage `theme`, site default = `editor-dark`),
rewrites `<meta name="theme-color">` from the resolved `--ed-bg`, and exposes `window.setTheme(name)`.
This is the file that makes "default dark, user override wins" possible; `prefers-color-scheme` is
intentionally ignored.
```js
/* ============================================================
   主题初始化 —— 必须在首次绘制前运行

   放在 <head> 里、且在样式表之后（见 index.html 的注释）：
   作为外部脚本，CSP script-src 'self' 允许；内联脚本被禁止，所以不能内联。
   样式表会阻塞后续脚本执行，所以这里能读到已解析的 --ed-bg。

   为什么需要它：CSS 无法根据系统偏好给元素「设置属性」，
   所以没有任何纯 CSS 写法能表达「默认跟随系统、手动选择可覆盖」。
   在这里提前把 data-theme 写到 <html> 上，就没有深色用户先看到一帧白底的问题。

   主题只有颜色一个轴（令牌契约见 themes/*.css 顶部）。
   ============================================================ */
(() => {
  const LIGHT = 'editor-light';
  const DARK = 'editor-dark';
  const KNOWN = [LIGHT, DARK];
  const KEY = 'theme';

  function preferred() {
    let chosen = null;
    try { chosen = localStorage.getItem(KEY); } catch { /* 隐私模式 */ }
    if (chosen && KNOWN.includes(chosen)) return { theme: chosen, source: 'user' };
    // ⚠ 默认深色，**不看系统偏好**。
    //
    // 为什么不再跟随 prefers-color-scheme：整页的版面建立在
    // 「深色代码带 + 深冷灰底 + 玻璃卡片」上（见 style.css 顶部）。
    // 系统偏好浅色的浏览器会拿到浅色语法色压在硬编码的深色底上，
    // 结果是一片没对比度的糊。所以浅色主题需要单独设计一轮，
    // 在那之前不能把它当默认值。
    // 用户手动选过的话仍然尊重（localStorage 优先，见上面一行）。
    return { theme: DARK, source: 'site' };
  }

  function apply(theme, source) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeSource = source;
    // 手机浏览器把 theme-color 用在地址栏 / 状态栏上；深色下不跟着改会露出一条白边。
    // 从 --ed-bg 取真实值，保证只有一处定义。
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--ed-bg').trim();
    if (bg) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', bg);
    }
  }

  const { theme, source } = preferred();
  apply(theme, source);

  // 供将来加手动开关用。切换只需调用它，不必重载页面。
  window.setTheme = (name) => {
    if (!KNOWN.includes(name)) return false;
    try { localStorage.setItem(KEY, name); } catch { /* 忽略 */ }
    apply(name, 'user');
    return true;
  };
})();
```

## 7. Entry / reveal system — `.js .reveal` + IntersectionObserver
Source: CSS `public/style.css` L913–967 · JS `public/app.js` L18–96 (complete IIFE)
Description: section/card entrance. Initial hidden states exist **only under `html.js`** (set by
`app.js` line 16) so a failed script never leaves content invisible; without `IntersectionObserver`
everything is shown in its final state immediately. Stagger is `--stagger: 55ms`; all of it is disabled
under `prefers-reduced-motion`.
```css
/* ============================================================
   入场：列表项错峰淡入 + 标题擦入

   .reveal 的初始态必须是「可见但透明」，不能用 display/visibility 隐藏 ——
   万一 JS 没跑起来，内容不能是隐形的。app.js 在没有 IntersectionObserver
   时会直接加 .visible。
   ============================================================ */
/* ⚠ 隐藏这件事挂在 html.js 上，不能无条件写。
   html.js 是 app.js 第一行加的，所以脚本正常跑起来才进入「初始隐藏」状态；
   万一 JS 加载失败或被禁用，内容必须是**可见**的 ——
   否则整个页面会是一片空白，而且没有任何报错线索。
   （旧版是 .reveal 无条件 opacity:0，属于同类隐患，顺手修掉。） */
.js .reveal {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity var(--d-reveal) var(--ease-out), transform var(--d-reveal) var(--ease-out);
  transition-delay: calc(var(--i, 0) * var(--stagger));
}
.js .reveal.visible { opacity: 1; transform: none; }

.js .hero, .js .sec { opacity: 0; transition: opacity 420ms var(--ease-out); }
.js .hero.visible, .js .sec.visible { opacity: 1; }

@keyframes type-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes caret-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
  .js .reveal { opacity: 1; transform: none; }
  .js .hero, .js .sec { opacity: 1; }
  .tl-item.tl-active::after { animation: none; }
}

/* 打印 / 极端降级：不显示代码带 */
@media print {
  body::before { display: none; }
  body { background: #fff; color: #000; }
}

/* 屏幕阅读器等：视觉隐藏但保留给辅助技术 */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

```

```js
(() => {
  const noIO = typeof IntersectionObserver !== 'function';
  const all = (sel) => [...document.querySelectorAll(sel)];

  if (noIO) {
    // 没有 IntersectionObserver 时直接呈现终态，绝不能让内容隐形
    all('.reveal, .hero, .sec').forEach((el) => el.classList.add('visible'));
  } else {
    /* ---- 入场：列表项错峰淡入 ---- */
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    // 同一父容器内的 .reveal 依次错峰
    all('.dir-list, .tl, .notice-list').forEach((box) => {
      [...box.querySelectorAll('.reveal')].forEach((el, i) => el.style.setProperty('--i', i));
    });

    all('.reveal').forEach((el) => io.observe(el));

    /* ---- 标题擦入：由「所在区块」驱动，不观察标题自己 ----
       标题初始带着 clip-path: inset(0 100% 0 0)，而 Chromium 的
       IntersectionObserver 会把被 clip-path 裁掉的面积算成 0 交集
       （实测：inset(0 50% 0 0) → intersectionRatio 恰好 0.5）。
       所以观察标题自身会得到 ratio 恒为 0、永不触发的死锁。
       改为观察未被裁剪的 .hero / .sec。 */
    const secReveal = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('visible'); secReveal.unobserve(e.target); }
      }
    }, { threshold: 0, rootMargin: '0px 0px -15% 0px' });

    all('.hero, .sec').forEach((el) => secReveal.observe(el));
    window.__revealIO = io;
  }

  /* ---- 顶部：进度线 / 当前区块 / 导航高亮 ---- */
  const fill = document.getElementById('prog-fill');
  const navLinks = [...document.querySelectorAll('.nav a')];

  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  // 当前区块 → 高亮对应导航项
  const secIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => {
        const on = a.getAttribute('href') === '#' + e.target.id;
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -45% 0px' });

  sections.forEach((s) => secIO.observe(s));

  /* ---- 进度线：一个 transform，阈值 0.5% ---- */
  if (fill) {
    let last = -1, queued = false;
    const paint = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (Math.abs(p - last) < 0.005) return;   // 无意义的变化不写样式
      last = p;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();
  }

  window.__revealIO = window.__revealIO || null;
})();
```

## 8. Static prototype shells (dev artifacts — not part of the shipped page)
Source: `public/preview/codefield.html`, `public/preview/codefield-sheet.html` (+ their `-proto`/`-sheet`
CSS/JS siblings)
Description: two standalone comparison pages used while designing the code belt: a live prototype
(four tones side by side) and a static four-column sheet (in-flow variant `.cf.cf-sheet`). They reuse
`codefield-data.js` + `codefield.js` and the real theme CSS. Useful as reproduction references; do not
treat them as product routes.
```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="editor-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>代码场域 · 四档静态对照表</title>
  <!-- 四档一次性摊开，方便一眼比对。
       用的是引擎里同一个 paintStatic()，所以这里看到的 = 动画跑完时的样子。 -->
  <link rel="stylesheet" href="/api/themes.css">
  <link rel="stylesheet" href="/codefield.css">
  <link rel="stylesheet" href="/preview/codefield-sheet.css">
</head>
<body>

  <header class="sheet-head">
    <h1>四档静态对照表</h1>
    <p>三档是<strong>编辑器</strong>（有行号、逐字打字），一档是<strong>终端</strong>（无行号、整块追加）。<br>
       语法色全部取 VSCode 原生值，压在底色上均 ≥4.5:1，没有为了对比度调过色。</p>
    <div class="theme-switch" role="group" aria-label="切换主题">
      <button type="button" data-theme-set="editor-dark" aria-pressed="true">VSCode Dark Modern</button>
      <button type="button" data-theme-set="editor-light" aria-pressed="false">VSCode Light+</button>
    </div>
  </header>

  <main id="sheet" class="sheet"></main>

  <script src="/codefield-data.js"></script>
  <script src="/codefield.js"></script>
  <script src="/preview/codefield-sheet.js"></script>
</body>
</html>
```

