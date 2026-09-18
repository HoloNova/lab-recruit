# theme.md — design tokens & theme contract

Stack: **vanilla HTML/CSS/JS** (Express static server, `server.js`). No Tailwind, no CSS-in-JS, no
component library. All tokens are **CSS custom properties**; the theme axis is **color only**.

## Part 1 — Compact token summary

### Theme axis (the only theme axis)
- Two themes: `editor-dark` (**default**) and `editor-light`.
- Applied as `document.documentElement.dataset.theme` → `html[data-theme="editor-dark"|"editor-light"]`,
  plus `html[data-theme-source="site"|"user"]`.
- Decided **before first paint** by `public/theme-init.js` (localStorage key `theme`; `site` default is
  `editor-dark` — `prefers-color-scheme` is deliberately NOT followed, because the whole layout is built on
  a dark code belt; do not "fix" this).
- Theme CSS is **not** imported by `style.css`: it is served by `GET /api/themes.css`, which concatenates
  every `themes/*.css` file in sorted order (server.js `buildThemesCss`).
- Every theme file must define **all** `--ed-*` (core + direction + syntax) tokens, because `style.css`
  consumes them with dark-value fallbacks via local aliases.

### Local aliases (`public/style.css` `:root`) — fallbacks = dark theme values
| alias | value | meaning |
|---|---|---|
| `--bg` | `var(--ed-bg, #1f1f1f)` | page background |
| `--bg-2` | `var(--ed-bg-2, #262626)` | raised surface |
| `--guide` | `var(--ed-guide, #3a3a3a)` | hairline / indent guide |
| `--fg` | `var(--ed-fg, #cccccc)` | primary text |
| `--fg-2` | `var(--ed-fg-2, #8a9199)` | secondary text |
| `--gutter` | `var(--ed-gutter, #8a9199)` | line-number / meta text |
| `--accent` | `var(--ed-accent, #4da3e8)` | accent / link / focus |
| `--add` | `var(--ed-add, #4ec9b0)` | "added" / success |
| `--del` | `var(--ed-del, #f48771)` | "removed" / error |

### Core theme tokens (values per theme)
| token | editor-light | editor-dark |
|---|---|---|
| `--ed-bg` | `#ffffff` | `#1f1f1f` |
| `--ed-bg-2` | `#f3f3f3` | `#262626` |
| `--ed-guide` | `#d3d3d3` | `#3a3a3a` |
| `--ed-fg` | `#3b3b3b` | `#cccccc` |
| `--ed-fg-2` | `#6e7681` | `#8a9199` |
| `--ed-gutter` | `#6e7681` | `#8a9199` |
| `--ed-accent` | `#005fb8` | `#4da3e8` |
| `--ed-add` | `#098658` | `#4ec9b0` |
| `--ed-del` | `#a31515` | `#f48771` |

Contrast is a **hard constraint**, and each theme file carries its measured ratios in a header comment
(light: `--ed-fg` 11.20:1 AAA, `--ed-fg-2`/`--ed-gutter` 4.59:1 AA, `--ed-accent` 6.31:1 AA; dark:
`--ed-fg` 10.26:1 AAA, `--ed-fg-2` 5.17:1 AA, `--ed-accent` 6.06:1 AA). Keep them when adding tokens.

### Direction colors (semantic per recruitment track — used by `.dir-row` + code belt)
| token | light | dark | track |
|---|---|---|---|
| `--dir-sw` | `#005fb8` | `#4da3e8` | 软件 Software |
| `--dir-hw` | `#b85c00` | `#e0a458` | 硬件 Hardware |
| `--dir-al` | `#7a3e9d` | `#c586e0` | 算法 Algorithm |
| `--dir-ai` | `#0f7b6c` | `#4ec9b0` | 人工智能 AI |

### Syntax-highlight tokens (VSCode palettes; consumed by the code belt, class names in `codefield.css`)
`--syn-kw --syn-ct --syn-ty --syn-fn --syn-va --syn-st --syn-nu --syn-cm --syn-an --syn-pp --syn-op`
`--syn-ln` (line numbers) · `--syn-caret` · `--syn-sel` (selection). Values are dumped verbatim in Part 2.

### Typography
- `--font-ui`: system UI stack (incl. `"PingFang SC"`, `"HarmonyOS Sans SC"`) · `--font-code`: platform
  monospace stack. **Zero webfonts by design** (previous 130 KB / 7 files → 0).
- Scale: `--fs-h1` 30px · `--fs-h2` 21px · `--fs-h3` 18px · `--fs-dir` 18px · `--fs-body` 16px ·
  `--fs-sm` 14.5px · `--fs-label` 12px · `--fs-code` 12.5px · `--fs-input` 17px (≥16px is a deliberate
  iOS guard: below that, focusing an input zooms the page).
- Fluid overrides: **≥600px** `--fs-h1: clamp(30px,4.6vw,40px)`, `--fs-h2: clamp(21px,3vw,25px)`,
  `--fs-dir: clamp(18px,2.3vw,21px)`, `--fs-body: 17px`, `--fs-sm: 15.5px`; **≥1024px**
  `--fs-h1: clamp(38px,3.4vw,50px)`, `--fs-h2: clamp(24px,2.1vw,29px)`, `--fs-h3: 20px`,
  `--fs-dir: clamp(20px,1.8vw,26px)`.
- Line height: `--lh-body: 1.72` · `--lh-tight: 1.24`.

### Spacing, radius, motion, chrome
- Space: `--pad: 18px` → `30px` at ≥600px. Radii: `--radius: 14px` (glass card), `--radius-in: 10px` (inner).
- Motion: `--ease-out: cubic-bezier(.16,1,.3,1)`, `--ease-io: cubic-bezier(.65,0,.35,1)`,
  `--ease-tap: cubic-bezier(.22,.61,.36,1)`; `--d-tap: 160ms`, `--d-reveal: 520ms`, `--stagger: 55ms`.
- Top bar height `--top-h: 50px` → `56px` at ≥600px.

### Breakpoints actually used
`max-width: 340px` · `min-width: 520px` · `min-width: 600px` · `min-width: 640px` · `min-width: 700px` ·
`min-width: 760px` (nav appears) · `min-width: 795/800px`-ish (join grid) · `min-width: 899/900px`
(code belt font/gutter) · `min-width: 1024px` (desktop shell padding) · `max-height: 560px` (short
landscape) · `@media print` (hides the belt) · `prefers-reduced-motion: reduce` (all motion off, content
shown in final state) · `@supports not (backdrop-filter…)` (frosted cards fall back to opaque).

### Code belt tokens (`public/codefield.css` `:root`)
`--cf-h: clamp(300px, 46vh, 460px)` (belt height) · `--cf-fade: 46%` (bottom fade) · `--cf-font` ·
`--cf-fs: clamp(11px, 3.05vw, 12.5px)` · `--cf-lh: 1.62` · `--cf-gut: 46px` (gutter; 54px ≥900px, 30px below) ·
`--cf-top: 30px` (breadcrumb headroom).

### Layer / z-index contract (do not flatten)
- `body::before` atmosphere wash: `position: fixed; z-index: 0`.
- Code belt `.cf`: `position: fixed; z-index: 1`, `contain: layout paint style`, full alpha (content is
  blurred *behind* glass, never a translucent overlay).
- Content `.page`: `position: relative; z-index: 2`.
- Top bar `.top`: `position: sticky; z-index: 4`. The belt's pause badge `.cf-hold` is also `z-index: 4`
  and **must stay outside `.cf`** (`.cf` has `transform` + `contain: paint`, so a fixed child would be
  trapped/clipped).

## Part 2 — Raw token source
### `themes/01-editor-light.css` (full)
```css
/* ============================================================
   主题 01 · 编辑器（浅色）
   取自 VSCode 默认浅色主题的真实值（extensions/theme-defaults）。

   主题只负责「颜色」这一个轴。排版、间距、动效属于 style.css，
   主题不得改动它们 —— 否则换主题会变成换设计。

   令牌契约（12 个）：
     表面三层  --ed-bg  --ed-bg-2  --ed-guide
     文字三层  --ed-fg  --ed-fg-2  --ed-gutter
     语义三个  --ed-accent  --ed-add  --ed-del
     方向四个  --dir-sw  --dir-hw  --dir-al  --dir-ai
   全部用 var(--x, 默认值) 消费，所以主题可以只实现其中一部分。

   对比度（对 --ed-bg 实算，WCAG 2.1 正文要求 ≥4.5:1）：
     --ed-fg      #3b3b3b  11.20:1  AAA
     --ed-fg-2    #6e7681   4.59:1  AA
     --ed-gutter  #6e7681   4.59:1  AA   （比 VSCode 原值更亮，原值 4.59 也是达标的）
     --ed-accent  #005fb8   6.31:1  AA
     --ed-add     #098658   4.60:1  AA
     --ed-del     #a31515   7.85:1  AA
   ============================================================ */

[data-theme="editor-light"] {
  /* 表面 */
  --ed-bg: #ffffff;
  --ed-bg-2: #f3f3f3;
  --ed-guide: #d3d3d3;

  /* 文字 */
  --ed-fg: #3b3b3b;
  --ed-fg-2: #6e7681;
  --ed-gutter: #6e7681;

  /* 语义 */
  --ed-accent: #005fb8;
  --ed-add: #098658;
  --ed-del: #a31515;

  /* 四个方向的记号色。必须与表面一起调 —— 同一种蓝在不同底色上不可能都达标，
     所以方向色属于主题，不放在别处。四个色互相之间的可分性也已核对。 */
  --dir-sw: #005fb8;   /* 软件 · 确定性的蓝 */
  --dir-hw: #b85c00;   /* 硬件 · 铜 */
  --dir-al: #7a3e9d;   /* 算法 · 紫 */
  --dir-ai: #0f7b6c;   /* 人工智能 · 青 */

  /* ---------- 语法色：直接取 VSCode Light+ 原生值 ----------
     压在白底上全部 ≥4.5:1（实算）：
       keyword #0000ff 8.59  control #af00db 5.46  type #267f99 4.59
       function #795e26 6.10  variable #001080 15.15  string #a31515 7.85
       number #098658 4.60  comment #008000 5.14
     注意 type 4.59 与 number 4.60 是「刚达标」，以后调底色要重新验。 */
  --syn-kw:    #0000ff;
  --syn-ct:    #af00db;
  --syn-ty:    #267f99;
  --syn-fn:    #795e26;
  --syn-va:    #001080;
  --syn-st:    #a31515;
  --syn-nu:    #098658;
  --syn-cm:    #008000;
  --syn-an:    #795e26;
  --syn-pp:    #0000ff;
  --syn-op:    #000000;

  /* 编辑器界面色 */
  --syn-ln:    #237893;   /* 行号 5.02:1 */
  --syn-caret: #000000;
  --syn-sel:   #add6ff;   /* 选区蓝 */
}

```

### `themes/02-editor-dark.css` (full — default theme)
```css
/* ============================================================
   主题 02 · 编辑器（深色）
   取自 VSCode 默认深色主题（extensions/theme-defaults）。

   ⚠ 这里有两处刻意偏离 VSCode 原生值，因为原生值不达 WCAG：
     editorLineNumber.foreground #6E7681 → 3.59:1  ✗  改用 #8a9199 = 5.17:1
     focusBorder               #0078D4 → 3.64:1  ✗  改用 #4da3e8 = 6.06:1
   浅色主题下这两个原生值是 4.59:1 / 6.31:1，达标，所以照用。

   对比度（对 --ed-bg 实算）：
     --ed-fg      #cccccc  10.26:1  AAA
     --ed-fg-2    #8a9199   5.17:1  AA
     --ed-gutter  #8a9199   5.17:1  AA
     --ed-accent  #4da3e8   6.06:1  AA
     --ed-add     #4ec9b0   8.09:1  AAA
     --ed-del     #f48771   6.71:1  AA
   ============================================================ */

[data-theme="editor-dark"] {
  /* 表面 */
  --ed-bg: #1f1f1f;
  --ed-bg-2: #262626;
  --ed-guide: #3a3a3a;

  /* 文字 */
  --ed-fg: #cccccc;
  --ed-fg-2: #8a9199;
  --ed-gutter: #8a9199;

  /* 语义 */
  --ed-accent: #4da3e8;
  --ed-add: #4ec9b0;
  --ed-del: #f48771;

  /* 四个方向 —— 深底上整体提亮，保持与浅色主题相同的语义色相 */
  --dir-sw: #4da3e8;
  --dir-hw: #e0a458;
  --dir-al: #c586e0;
  --dir-ai: #4ec9b0;

  /* ---------- 语法色：直接取 VSCode Dark+ 原生值 ----------
     这 11 个色压在 --ed-bg #1f1f1f 上全部 ≥4.5:1（实算见计划 §4.1），
     所以不需要为了对比度调色。这是「原生 VSCode」能成立的前提。 */
  --syn-kw:    #569cd6;   /* 声明关键字  5.59:1 */
  --syn-ct:    #c586c0;   /* 控制流      5.92:1 */
  --syn-ty:    #4ec9b0;   /* 类型        8.09:1 */
  --syn-fn:    #dcdcaa;   /* 函数/注解  11.66:1 */
  --syn-va:    #9cdcfe;   /* 变量       11.05:1 */
  --syn-st:    #ce9178;   /* 字符串      6.24:1 */
  --syn-nu:    #b5cea8;   /* 数字        9.70:1 */
  --syn-cm:    #6a9955;   /* 注释        4.95:1 */
  --syn-an:    #dcdcaa;
  --syn-pp:    #569cd6;   /* 预处理 */
  --syn-op:    #d4d4d4;

  /* 编辑器界面色 */
  --syn-ln:    #8a9199;   /* 行号    5.17:1（原生 #6e7681 只有 3.59，已修正） */
  --syn-caret: #aeafad;
  --syn-sel:   #264f78;   /* 选区蓝 */
}
```

### `public/style.css` L1–93 — local aliases + type scale + breakpoint token overrides
```css
/* ============================================================
   网络攻防与信息安全 · 实验室招新

   意象：代码是整个页面的背景，内容是一叠玻璃卡片，压在上面。

     · 代码带钉在页面上侧（fixed），底部渐隐到页面底色
     · 卡片是磨砂玻璃：透明、有边缘高光，背后的代码糊成颜色透出来
     · 代码本身完全静止在 z0；内容在它上面滑过去

   三条硬规则（改动前请先读）：
   1. 颜色只在 themes/*.css 里定义。本文件一律用 var(--ed-x, 兜底) 消费。
   2. 背景**不占版面**。代码带是 fixed 的，它的高度绝不参与内容排版 ——
      任何形式的 `padding-top: calc(var(--cf-h) ...)` 都是回到旧错误：
      卡片会被背景推下去。
   3. 玻璃的参数是采像素量出来的，改动后必须重新量对比度（见报告）：
      · 模糊半径是透明度的杠杆（越大 → 亮峰摊得越平 → tint 可以越低）
      · backdrop-filter 必须**压暗**背后（brightness < 1），提亮会把代码放大
      · 卡片可以很透，小控件（暂停徽标）不行

   为什么整页是深色：代码带是深色编辑器，玻璃要「有东西可透」，
   底色又必须是深冷灰而不是纯黑，否则卡片和背景是同一个黑。
   浅色主题的令牌仍在 themes/01 里，但那个方向需要单独设计一轮。
   ============================================================ */

/* ---------- 主题令牌的本地别名（兜底 = 深色编辑器，见 themes/02） ---------- */
:root {
  --bg:      var(--ed-bg, #1f1f1f);
  --bg-2:    var(--ed-bg-2, #262626);
  --guide:   var(--ed-guide, #3a3a3a);
  --fg:      var(--ed-fg, #cccccc);
  --fg-2:    var(--ed-fg-2, #8a9199);
  --gutter:  var(--ed-gutter, #8a9199);
  --accent:  var(--ed-accent, #4da3e8);
  --add:     var(--ed-add, #4ec9b0);
  --del:     var(--ed-del, #f48771);

  --font-ui: system-ui, -apple-system, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC",
             "MiSans", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  --font-code: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas,
               "Liberation Mono", "Roboto Mono", monospace;

  /* 版式：手机段固定刻度 */
  --fs-h1: 30px;
  --fs-h2: 21px;
  --fs-h3: 18px;
  --fs-dir: 18px;
  --fs-body: 16px;
  --fs-sm: 14.5px;
  --fs-label: 12px;
  --fs-code: 12.5px;
  --fs-input: 17px;          /* ≥16px：低于此值 iOS 聚焦输入框会缩放整页 */
  --lh-body: 1.72;
  --lh-tight: 1.24;

  --pad: 18px;
  --radius: 14px;            /* 玻璃卡片的圆角 */
  --radius-in: 10px;         /* 卡片内部的小圆角 */

  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-io: cubic-bezier(.65, 0, .35, 1);
  --ease-tap: cubic-bezier(.22, .61, .36, 1);
  --d-tap: 160ms;
  --d-reveal: 520ms;
  --stagger: 55ms;

  --top-h: 50px;
}

@media (max-width: 340px) {
  :root { --pad: 14px; --fs-h1: 27px; --fs-body: 15.5px; }
}

@media (min-width: 600px) {
  :root {
    --fs-h1: clamp(30px, 4.6vw, 40px);
    --fs-h2: clamp(21px, 3vw, 25px);
    --fs-dir: clamp(18px, 2.3vw, 21px);
    --fs-body: 17px;
    --fs-sm: 15.5px;
  }
}

@media (min-width: 1024px) {
  :root {
    --pad: 30px;
    --top-h: 56px;
    --fs-h1: clamp(38px, 3.4vw, 50px);
    --fs-h2: clamp(24px, 2.1vw, 29px);
    --fs-h3: 20px;
    --fs-dir: clamp(20px, 1.8vw, 26px);
  }
}

```

### `public/codefield.css` L1–40 — belt tokens
```css
/* ============================================================
   代码场域 —— 页面上侧的一条代码带
   z-index 0，内容面板盖在它下缘的渐隐区上。代码带保持 alpha 1.0 全饱和：
   压暗会让语法颜色消失，代码就退化成灰噪声（见计划 §1 的 alpha 实测）。

   语法色取自 VSCode Dark+ 原生值，压在 #1f1f1f 上全部 ≥4.5:1，
   所以不需要为了对比度调色 —— 这是「原生 VSCode」能成立的前提。
   ============================================================ */

/* ⚠ 高度必须定义在 :root 上，不能只写在 .cf 里。
   .cf 和页面内容是**兄弟**关系，自定义属性不跨兄弟继承 ——
   写在 .cf 上时，.hero 里的 var(--cf-h, 340px) 会一直取那个兜底值 340px，
   于是面板位置在窄屏上悄悄错了（实测 320px 下偏了 44px）。
   :root 上定义一次，两边都读得到。 */
:root {
  /* 代码带高度：页面上侧的一小部分，剩下的页面是纯黑。
     46vh 是有意的：玻璃卡片压在上面时，卡片下方还能露出一段没被遮的原始代码。 */
  --cf-h: clamp(300px, 46vh, 460px);
  /* 渐隐起点：从这个高度开始，代码和底一起淡向透明（＝露出下面的纯黑） */
  --cf-fade: 46%;
}
/* 矮屏（横屏手机）：带子再压一点，别把内容都挤下去 */
@media (max-height: 560px) {
  :root { --cf-h: clamp(220px, 54vh, 320px); --cf-fade: 48%; }
}

.cf {
  /* 字体：全部系统字体，零下载。等宽字是代码辨识度的必要条件，
     语法颜色才是充分条件。 */
  --cf-font: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
             "DejaVu Sans Mono", "Segoe UI Symbol", "Apple Symbols", monospace;
  --cf-fs: clamp(11px, 3.05vw, 12.5px);
  --cf-lh: 1.62;
  --cf-gut: 46px;            /* 行号栏宽度 */
  --cf-top: 30px;            /* 顶部面包屑留白 */

  /* fixed：内容从页面顶部开始、在带子上方滑过去。
     这样每一张玻璃卡片往下滚的时候背后都有活的代码，
     而不是只有第一屏能看到。 */
  position: fixed;
```

> Non-token CSS lives where its component lives: layout + in-page components in
> `public/style.css` (see `components.md` / `layouts.md`), belt internals in `public/codefield.css`.
