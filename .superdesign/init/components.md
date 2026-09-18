# components.md — shared UI primitives (FULL source)

**Stack: vanilla HTML + CSS + JS on Express. There is no component framework and no template engine.**
In this repo a "component" is a **CSS block in `public/style.css` (+ `public/codefield.css` for the belt)
paired with an HTML fragment in `public/index.html`**; three components are rendered at runtime by
`public/app.js` template strings. All source below is copied verbatim from those files.

Conventions that hold for every component here:
- Class names are **kebab-case**; variants/state are additional classes (`.is-err`, `.tl-active`, `.open`),
  never inline styles.
- Colors come only from tokens (`var(--fg-2)`, `var(--accent)`, …) — see `theme.md`. A few literal
  near-white/near-grey values (`#fff`, `#cfd4dc`, `#8f98a6`) exist inside component CSS and are part of
  the current look; if you re-theme, keep the contrast relationships.
- Motion is **CSS-only** (transitions/keyframes) and every animated element is disabled under
  `prefers-reduced-motion`. JS never animates layout.
- `html.js` gating: all entry-hide states are scoped under `.js` so a script failure can never leave
  content invisible.

---

## 1. Primary button — `.btn`
Source: `public/style.css` L381–402 · usage `public/index.html` L91 (hero CTA)
Description: the single high-emphasis action on the page (hero "看看四个方向"); inverted white slab, arrows
on hover, 160ms `--ease-tap` press.
Variants: none — it is the primary. For in-form submit use `.submit`; for text actions use `.link-btn`.
```css
/* ---------- 主按钮 ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #06263f;
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 10px 26px -10px rgba(77, 163, 232, .9);
  transition: transform var(--d-tap) var(--ease-tap);
}
.btn:hover { transform: scale(1.03); }
.btn:active { transform: scale(.98); }

```

HTML usage (`public/index.html` L91):
```html
    </section>
```

## 2. Submit button — `.submit` (+ `.actions` wrapper)
Source: `public/style.css` L726–754 · usage `public/index.html` L266–269
Description: full-width form submit; disabled state is driven from JS (`setFormDisabled`) via the
`[disabled]` styles in this block.
Props/variants: `disabled` attribute; sibling `.form-status` carries `role="status"` + `aria-live="polite"`.
```css
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}
.submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  padding: 0 30px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #06263f;
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 10px 26px -10px rgba(77, 163, 232, .9);
}
.submit:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
.form-status { font-size: var(--fs-sm); color: #b0b8c4; min-height: 1.4em; }
.form-status.is-err { color: var(--del); }
.form-status.is-ok { color: var(--add); }
.form-foot { font-size: var(--fs-sm); color: #8f98a6; }

```

HTML usage (`public/index.html` L266–269):
```html
              <div class="field full actions">
                <button type="submit" class="submit" id="submit-btn">提交报名</button>
                <p id="form-status" class="form-status" role="status" aria-live="polite"></p>
              </div>
```

## 3. Link-style button — `.link-btn` (+ `.subtle`)
Source: `public/style.css` L707–724 and L896–912 · usage `public/index.html` L191, L247, L285–290
Description: inline, chrome-free text action used for secondary affordances ("换一张", "退出修改",
"修改我的报名", "复制"); `.subtle` is the tertiary variant ("不是这次").
Note: this is the only button that appears *inside* prose/rows, so it must stay small and low-contrast.
```css
/* ---------- 链接式按钮 ---------- */
.link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .06);
  color: #e8e8e8;
  font-family: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  white-space: nowrap;
}
.link-btn:hover { background: rgba(255, 255, 255, .12); }

```

```css
/* link-btn 的次级变体（「不是这次」之类的次要动作） */
.link-btn.subtle {
  border-color: rgba(255, 255, 255, .14);
  background: transparent;
  color: #b0b8c4;
}
.link-btn.subtle:hover { background: rgba(255, 255, 255, .07); }

.foot {
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, .10);
  font-size: var(--fs-label);
  color: #7d8694;
  text-align: center;
}

```

HTML usages (`public/index.html` L191, L247, L286–291):
```html
              <button type="button" id="edit-cancel" class="link-btn">退出修改</button>
                  <button type="button" id="captcha-refresh" class="link-btn">换一张</button>
              <p class="token-note">这是你之后修改报名信息的唯一凭证，<strong>我们不会再显示它</strong>。建议截图或复制到备忘录。</p>
              <div class="token-box">
                <code id="token-value"></code>
                <button type="button" id="token-copy" class="link-btn">复制</button>
              </div>
              <p class="token-warn">请勿把编辑码发给他人。丢失编辑码需联系管理员人工核验身份。</p>
```

## 4. Form field — `.field` (+ `.full`), label, input / select / textarea
Source: `public/style.css` L631–687 · usage `public/index.html` L194–280 (the whole `#app-form`)
Description: the报名表 field primitive: label row with required/optional marks, control, focus ring;
`.full` spans both grid columns on ≥700px. Controls use `--fs-input: 17px` (iOS zoom guard).
Props/variants: `.full`, `[hidden]` wrappers, `.req` (red `*`), `.opt` (muted 选填), `:focus` ring,
`textarea` rows, `select` with a disabled placeholder option.
```css
.field > label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--fs-label);
  font-family: var(--font-code);
  color: #b0b8c4;
}
.req { color: var(--del); }
.opt { color: #7d8694; }

.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border-radius: var(--radius-in);
  /* 输入框自己也带一点玻璃。卡片很透，所以框要比边框更明确一点才看得出是可输入的。 */
  background: rgba(9, 11, 16, .34);
  border: 1px solid rgba(255, 255, 255, .22);
  color: #f0f2f5;
  font-family: inherit;
  font-size: var(--fs-input);
  line-height: 1.5;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition: border-color var(--d-tap) var(--ease-tap), background var(--d-tap) var(--ease-tap);
}
.field textarea { min-height: 96px; resize: vertical; padding: 12px; }
.field input::placeholder,
.field textarea::placeholder { color: #7d8694; }
.field input:hover,
.field select:hover,
.field textarea:hover { border-color: rgba(255, 255, 255, .32); }
.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: transparent;
  background: rgba(9, 11, 16, .48);
}
.field select { appearance: none; padding-right: 34px; }
.field { position: relative; }
.field:has(select)::after {              /* 自制下拉箭头 */
  content: '';
  position: absolute;
  right: 14px;
  top: 34px;
  width: 7px; height: 7px;
  border-right: 2px solid #9aa3b0;
  border-bottom: 2px solid #9aa3b0;
  transform: rotate(45deg);
  pointer-events: none;
}
.field option { background: #14161c; color: #f0f2f5; }

```

Representative HTML (`public/index.html` L195–262 — one input, one select, one textarea; the full form is
L194–280):
```html
              <div class="field">
                <label for="student_id">学号 <span class="req">*</span></label>
                <input type="text" id="student_id" name="student_id" required inputmode="numeric"
                       autocomplete="off" maxlength="20" placeholder="2026xxxxxx">
              </div>

              <div class="field">
                <label for="name">姓名 <span class="req">*</span></label>
                <input type="text" id="name" name="name" required autocomplete="name" maxlength="20" placeholder="你的名字">
              </div>

              <div class="field">
                <label for="class_name">班级 <span class="req">*</span></label>
                <input type="text" id="class_name" name="class_name" required maxlength="30" placeholder="如：网络工程 2 班">
              </div>

              <div class="field">
                <label for="direction">方向 <span class="req">*</span></label>
                <select id="direction" name="direction" required>
                  <option value="" disabled selected>选择方向</option>
                  <option value="软件">软件</option>
                  <option value="硬件">硬件</option>
                  <option value="算法">算法</option>
                  <option value="人工智能">人工智能</option>
                </select>
              </div>

              <div class="field">

              <div class="field full">
                <label for="intro">个人简介 <span class="req">*</span></label>
                <textarea id="intro" name="intro" rows="4" required maxlength="200" placeholder="简单介绍下自己，为什么想加入（不超过 200 字）"></textarea>
              </div>

              <div class="field full">
                <label for="learned">已学内容 <span class="opt">选填</span></label>
                <textarea id="learned" name="learned" rows="3" maxlength="200" placeholder="学过的语言 / 框架 / 做过的东西（不超过 200 字）"></textarea>
              </div>

              <div class="field full">
                <label for="ai_views">对 AI 发展的看法 <span class="opt">选填</span></label>
```

Micro-tokens used by fields and prose (`public/style.css` L638–639, L750–753, L378–379, L143):
```css
.mono { font-family: var(--font-code); font-variant-numeric: tabular-nums; }
.lede { color: #cfd4dc; margin-bottom: 20px; }
.hint { color: #8f98a6; font-size: var(--fs-sm); }
.req { color: var(--del); }
.opt { color: #7d8694; }
.form-status { font-size: var(--fs-sm); color: #b0b8c4; min-height: 1.4em; }
.form-status.is-err { color: var(--del); }
.form-status.is-ok { color: var(--add); }
.form-foot { font-size: var(--fs-sm); color: #8f98a6; }
```

## 5. Captcha row — `.captcha-row`, `.captcha-img`
Source: `public/style.css` L688–706 · usage `public/index.html` L243–249
Description: image + input + refresh laid out on one row (wraps only ≥520px); the image is an inline SVG
served by `GET /api/captcha`, clicking it refreshes (handler in `app.js`).
Props/variants: `width/height` attributes are load-bearing (no layout shift); `alt` doubles as the
"click to refresh" affordance text.
```css
/* ---------- 验证码 ---------- */
.captcha-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: center;
}
@media (min-width: 520px) {
  .captcha-row { grid-template-columns: auto minmax(0, 1fr) auto; }
}
.captcha-img {
  width: 150px;
  height: 50px;
  border-radius: var(--radius-in);
  border: 1px solid rgba(255, 255, 255, .16);
  background: rgba(255, 255, 255, .05);
  cursor: pointer;
}

```

HTML usage (`public/index.html` L243–249):
```html
                <div class="captcha-row">
                  <img id="captcha-img" class="captcha-img" alt="验证码（点击可更换）" width="150" height="50">
                  <input type="text" id="captcha_answer" name="captcha_answer" required maxlength="8"
                         autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入图中字符">
                  <button type="button" id="captcha-refresh" class="link-btn">换一张</button>
                </div>
              </div>
```

## 6. Banner strip — `.banner`, `.edit-banner`
Source: `public/style.css` L605–630 · usage `public/index.html` L182–192
Description: one-line "left edge" notice language shared with announcements: phase banner (registration
closed/open), device-already-submitted card, and the edit-mode strip with its exit action.
Props/variants: `[hidden]` toggled by JS; `.banner` is a neutral strip, `.edit-banner` carries the
accent-left-edge edit state; content injected by `app.js` (`applyPhase`, `renderDeviceCard`).
```css
.banner {
  padding: 12px 14px;
  border-radius: var(--radius-in);
  background: rgba(255, 255, 255, .06);
  border: 1px solid rgba(255, 255, 255, .12);
  color: #dfe4ea;
  font-size: var(--fs-sm);
  margin-bottom: 16px;
}
.edit-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.edit-banner .link-btn { flex: none; }

/* ---------- 字段 ---------- */
#app-form { display: grid; gap: 14px; }
@media (min-width: 700px) {
  #app-form { grid-template-columns: 1fr 1fr; gap: 16px 18px; }
  #app-form .full { grid-column: 1 / -1; }
}

.field { display: block; min-width: 0; }
```

HTML usage (`public/index.html` L181–192):
```html
          <div class="pane-body">
            <!-- 报名未开放时的提示条 -->
            <div id="phase-banner" class="banner" hidden></div>

            <!-- 本设备已提交过的记录 -->
            <div id="device-card" class="banner" hidden></div>

            <!-- 编辑模式提示条 -->
            <div id="edit-banner" class="edit-banner" hidden>
              <span id="edit-banner-text"></span>
              <button type="button" id="edit-cancel" class="link-btn">退出修改</button>
            </div>
```

Device card markup, rendered at runtime (`public/app.js` L212–288, inside the form IIFE):
```js
  function maskSid(s) {
    const v = String(s || '');
    if (v.length < 7) return v;
    return `${v.slice(0, 4)}****${v.slice(-2)}`;
  }

  function renderDeviceCard() {
    const subs = loadSubs();
    if (!subs.length) { deviceCard.hidden = true; return; }
    deviceCard.textContent = '';
    deviceCard.hidden = false;

    const title = document.createElement('p');
    title.className = 'device-title';
    title.textContent = '本设备曾提交过报名';
    deviceCard.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'device-list';
    for (const s of subs) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = s.sid_masked || '（未知学号）';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link-btn';
      btn.textContent = '修改这份报名';
      btn.addEventListener('click', () => startEdit(s.sid_full, s.token));
      li.append(label, btn);
      list.appendChild(li);
    }
    deviceCard.appendChild(list);

    // 关键：只隐藏卡片，绝不清除 token —— 否则前一个人的凭证永久丢失
    const other = document.createElement('button');
    other.type = 'button';
    other.className = 'link-btn subtle';
    other.textContent = '不是我，我要为另一人报名';
    other.addEventListener('click', () => {
      deviceCard.hidden = true;
      haveTokenWrap.hidden = false;
      showStatus('');
    });
    deviceCard.appendChild(other);
  }

  /* ---- 验证码 ---- */
  async function refreshCaptcha() {
    captchaImg.removeAttribute('src');
    captchaImg.alt = '验证码加载中';
    try {
      const res = await fetch('/api/captcha', { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        captchaImg.alt = '验证码加载失败';
        showStatus(data.message || '验证码加载失败，请点"换一张"', 'err');
        return;
      }
      state.captchaId = data.captcha_id;
      // 用 data URL 显示，不把 SVG 字符串注入 DOM
      captchaImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.svg);
      captchaImg.alt = '验证码（点击可更换）';
    } catch {
      captchaImg.alt = '验证码加载失败';
      showStatus('网络错误，请点"换一张"重试', 'err');
    }
  }
  captchaImg.addEventListener('click', refreshCaptcha);
  captchaRefresh.addEventListener('click', () => {
    captchaInput.value = '';
    updateMeter();
    refreshCaptcha();
  });

  /* ---- 阶段状态 ---- */
  const PHASE_TEXT = { warmup: '预热中', signup: '报名开放', review: '初筛面试', result: '结果公布' };

```

## 7. Glass card — `.shell`, `.hero-in`
Source: `public/style.css` L265–311 (background/backdrop/blur), border+radius in the same block
Description: the translucent frosted panel every section sits in — this is the component that makes the
code belt readable behind content. Diagonal sheen via `::before`; opaque fallback via `@supports`.
Props/variants: `--radius`, `--radius-in`; degrades to opaque when `backdrop-filter` is unsupported.
```css
/* ============================================================
   玻璃卡片

   三个要件，少一个就只是「半透明灰块」：
     · backdrop-filter 模糊背后的东西 —— 这是「玻璃」本体
     · 一道浅色描边 + 内上高光 —— 这是玻璃的**边缘**，最容易被忽略但最关键
     · 圆角 + 下方阴影 —— 让它在深底上浮起来

   tint 只有 .22（78% 透明）。敢这么淡的依据是实测：
   卡片填充与页底的亮度差只有 0.0015 —— 也就是说这张卡「是不是一块面」
   一直靠边缘定义，不是靠填充。所以调淡填充几乎不损失卡片感。
   而边框/高光因此必须顶上来担这个责任。
   ============================================================ */
.shell,
.hero-in {
  position: relative;
  background: rgba(9, 11, 16, .22);
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: var(--radius);
  -webkit-backdrop-filter: blur(34px) saturate(170%) brightness(.85);
  backdrop-filter: blur(34px) saturate(170%) brightness(.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .34),
    inset 0 -1px 0 rgba(0, 0, 0, .30),
    0 20px 52px -14px rgba(0, 0, 0, .80);
}

/* 斜向反光：很淡，但缺了整块就像一片塑料。
   用伪元素而不是 border-image：不参与布局，也不被 backdrop-filter 影响。 */
.shell::before,
.hero-in::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(148deg,
    rgba(255, 255, 255, .10) 0%,
    rgba(255, 255, 255, .03) 26%,
    transparent 52%);
}

/* 不支持 backdrop-filter 时别变成看不清的灰块：退回不透明 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .shell, .hero-in { background: #14161c; border-color: rgba(255, 255, 255, .14); }
}

```

## 8. Document pane — `.pane` (+ `.pane-bar`, `.pane-meter`)
Source: `public/style.css` L562–603 · usage `public/index.html` L169–181
Description: the "document surface" that frames the application form: a title bar naming the document
(报名表) + required-count readout + a meter line that fills with completion (JS writes `#meter-fill` width).
Props/variants: `.pane-meta` count text; `#doc-progress` "n / 9" mono readout; meter is
`aria-hidden` decoration backed by the live count text.
```css
/* ============================================================
   报名表

   .shell 是外层玻璃；.pane 是里面一层更淡的内衬面，
   让「这是张表」这件事有个边界，但不至于套两层厚玻璃。
   ============================================================ */
.apply .shell { padding-bottom: 24px; }

.pane {
  border-radius: var(--radius-in);
  background: rgba(255, 255, 255, .035);
  border: 1px solid rgba(255, 255, 255, .09);
  overflow: hidden;
}

.pane-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, .09);
  font-size: var(--fs-label);
}
.pane-name { font-weight: 640; color: #fff; }
.pane-meta { color: #9aa3b0; font-family: var(--font-code); }

/* 完成度读数：一条随必填项推进的线 */
.pane-meter { height: 2px; background: rgba(255, 255, 255, .10); }
.pane-meter i {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: 0 50%;
  transform: scaleX(0);
  background: var(--accent);
  transition: transform var(--d-morph, 320ms) var(--ease-out);
}

.pane-body { padding: 16px 14px 18px; }
@media (min-width: 1024px) { .pane-body { padding: 20px 20px 24px; } }

```

HTML usage (`public/index.html` L170–181):
```html
    <section class="sec apply" id="apply">
      <div class="shell">
        <!-- 文档面：比纸面略深的一块底板，标题栏写清这是什么 -->
        <div class="pane">
          <div class="pane-bar">
            <span class="pane-name">报名表</span>
            <span class="pane-meta"><span class="mono" id="doc-progress">0 / 9</span> 必填项</span>
          </div>
          <!-- 完成度读数：一条随必填项推进的线 -->
          <div class="pane-meter" aria-hidden="true"><i id="meter-fill"></i></div>

          <div class="pane-body">
```

## 9. Section headings — `.h1`, `.h2` + `.h2-en`, `.h3`, `.lede`
Source: `public/style.css` L346–380 · usage `public/index.html` L85, L96, L133, L301
Description: heading family. `.h2` pairs a muted uppercase English eyebrow (`.h2-en`, code font) with the
Chinese question; `.lede` is the hero paragraph.
Props/variants: `.h2-en` label text differs per section (DIRECTIONS / FLOW / GROUP).
```css
/* ---------- 标题族 ---------- */
.h1 {
  font-size: var(--fs-h1);
  line-height: var(--lh-tight);
  font-weight: 660;
  letter-spacing: -.022em;
  color: #fff;
  margin-bottom: 10px;
}
.h2 {
  font-size: var(--fs-h2);
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: -.01em;
  color: #fff;
  margin-bottom: 18px;
}
.h2-en {
  display: block;
  font-family: var(--font-code);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .10em;
  color: #9aa3b0;
  margin-bottom: 4px;
}
.h3 {
  font-size: var(--fs-h3);
  font-weight: 650;
  color: #fff;
  margin-bottom: 12px;
}
.lede { color: #cfd4dc; margin-bottom: 20px; }
.hint { color: #8f98a6; font-size: var(--fs-sm); }

```

HTML usage (`public/index.html` L85, L96, L133, L301):
```html
        <h1 class="h1">网络攻防与信息安全</h1>
        <h2 class="h2"><span class="h2-en">DIRECTIONS</span>你想做什么？</h2>
    <section class="sec" id="flow">
        <h2 class="h2"><span class="h2-en">GROUP</span>先加群，别错过通知</h2>
```

## 10. Direction row — `.dir-row` (in `.dir-list`)
Source: `public/style.css` L403–466 · usage `public/index.html` L97–127
Description: the four recruitment tracks as *code-like rows*: Chinese name + index + a fake diff line +
a description, each tinted by `data-dir` (`sw|hw|al|ai` → `--dir-*` tokens). Clicking pre-fills the form's
direction select (`app.js` section 2).
Props/variants: `data-direction` (value written into the form), `data-dir` (color), `.reveal` (entry),
`:hover`/`:focus-visible` lift, `.dir-list` grid; `.dir-idx`/`.dir-code` are decorative (aria-hidden on
the index only).
```css
/* ============================================================
   方向列表
   ============================================================ */
.dir-list { margin-bottom: 14px; }

.dir-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 14px;
  width: 100%;
  padding: 14px 8px;
  min-height: 60px;
  background: none;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, .10);
  border-radius: var(--radius-in);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--d-tap) var(--ease-tap);
}
.dir-row:last-child { border-bottom: 1px solid rgba(255, 255, 255, .10); }
.dir-row:hover { background: rgba(255, 255, 255, .05); }
.dir-row[aria-pressed="true"] { background: rgba(255, 255, 255, .08); }

.dir-cn {
  grid-row: span 2;
  font-size: var(--fs-dir);
  font-weight: 650;
  color: var(--dir);
}
.dir-row[data-dir="sw"] { --dir: var(--dir-sw, #4da3e8); }
.dir-row[data-dir="hw"] { --dir: var(--dir-hw, #e0a458); }
.dir-row[data-dir="al"] { --dir: var(--dir-al, #c586e0); }
.dir-row[data-dir="ai"] { --dir: var(--dir-ai, #4ec9b0); }

.dir-idx {
  display: none;
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  font-family: var(--font-code);
  font-size: 11px;
  color: #7d8694;
}
.dir-code {
  font-family: var(--font-code);
  font-size: var(--fs-code);
  color: #b0b8c4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dir-desc { grid-column: 2; color: #cfd4dc; font-size: var(--fs-sm); }

@media (min-width: 600px) {
  .dir-row { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 16px; }
  .dir-cn { grid-row: auto; grid-column: 1; }
  .dir-code { grid-column: 1; }
  .dir-desc { grid-column: 1; }
  .dir-idx { display: block; grid-column: 2; }
}

```

HTML usage (`public/index.html` L97–127) and the hint line (L128–130):
```html

        <div class="dir-list">
          <button class="dir-row reveal" data-direction="软件" data-dir="sw" type="button">
            <span class="dir-cn">软件</span>
            <span class="dir-idx" aria-hidden="true">01</span>
            <span class="dir-code">+ strncpy(buf, input, n-1)</span>
            <span class="dir-desc">写代码 · 修漏洞 · 逆向分析</span>
          </button>

          <button class="dir-row reveal" data-direction="硬件" data-dir="hw" type="button">
            <span class="dir-cn">硬件</span>
            <span class="dir-idx" aria-hidden="true">02</span>
            <span class="dir-code">+ verify(firmware)</span>
            <span class="dir-desc">拆设备 · 焊板子 · 跑固件</span>
          </button>

          <button class="dir-row reveal" data-direction="算法" data-dir="al" type="button">
            <span class="dir-cn">算法</span>
            <span class="dir-idx" aria-hidden="true">03</span>
            <span class="dir-code">+ 2^32 次 · 生日碰撞</span>
            <span class="dir-desc">数学是武器，也是防线</span>
          </button>

          <button class="dir-row reveal" data-direction="人工智能" data-dir="ai" type="button">
            <span class="dir-cn">人工智能</span>
            <span class="dir-idx" aria-hidden="true">04</span>
            <span class="dir-code">+ predict(x + 0.01)</span>
            <span class="dir-desc">用 AI 攻，也用 AI 守</span>
          </button>
        </div>

        <p class="hint" id="dir-hint">点一行，方向会自动填进报名表。</p>
      </div>
    </section>
```

## 11. Timeline item — `.tl`, `.tl-item` (+ `.tl-done`, `.tl-active`)
Source: `public/style.css` L467–517 · usage `public/index.html` L136–160
Description: vertical 4-phase process list with a rail and node dots; the active/done states are colored
from the current registration phase (`app.js` `applyPhase`), so the same markup is a status widget.
Props/variants: `data-phase="warmup|signup|review|result"`, state classes `tl-done` / `tl-active`,
`.tl-when` (date label), `.tl-title`, `.tl-desc` (supports `<strong>`).
```css
/* ============================================================
   流程（时间线）
   ============================================================ */
.tl { list-style: none; margin-bottom: 26px; }

.tl-item {
  position: relative;
  padding-left: 26px;
  padding-bottom: 20px;
}
.tl-item:last-child { padding-bottom: 0; }
.tl-item::before {                     /* 竖线 */
  content: '';
  position: absolute;
  left: 5px; top: 14px; bottom: -2px;
  width: 1px;
  background: rgba(255, 255, 255, .14);
}
.tl-item:last-child::before { display: none; }
.tl-item::after {                      /* 节点 */
  content: '';
  position: absolute;
  left: 0; top: 7px;
  width: 11px; height: 11px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, .30);
  background: #0a0c12;
}
.tl-item.tl-done::after { background: var(--accent); border-color: var(--accent); }
.tl-item.tl-active::after {
  background: var(--accent);
  border-color: var(--accent);
  animation: node-pulse 2.4s var(--ease-io) infinite;
}
@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(77, 163, 232, .5); }
  50%      { box-shadow: 0 0 0 7px rgba(77, 163, 232, 0); }
}

.tl-when {
  display: block;
  font-family: var(--font-code);
  font-size: 11px;
  letter-spacing: .06em;
  color: #9aa3b0;
  margin-bottom: 3px;
}
.tl-title { font-size: var(--fs-h3); font-weight: 650; color: #fff; margin-bottom: 5px; }
.tl-desc { color: #cfd4dc; font-size: var(--fs-sm); }
.tl-desc strong { color: #fff; font-weight: 620; }

```

HTML usage (`public/index.html` L136–160, one of four items):
```html

        <ol class="tl" id="tl-list">
          <li class="tl-item reveal" data-phase="warmup">
            <span class="tl-when">现在</span>
            <h3 class="tl-title">预热了解</h3>
            <p class="tl-desc">加入招新群，了解实验室日常与研究方向。群里只做通知，不作为报名依据。</p>
          </li>
          <li class="tl-item reveal" data-phase="signup">
            <span class="tl-when">国庆假期后</span>
            <h3 class="tl-title">正式报名</h3>
            <p class="tl-desc">网站开放完整报名表，群内同步发布链接与截止时间。<strong>所有人必须通过本页面提交</strong>，群接龙、私聊都不算报名。</p>
          </li>
          <li class="tl-item reveal" data-phase="review">
            <span class="tl-when">报名截止后</span>
            <h3 class="tl-title">初筛与面试</h3>
            <p class="tl-desc">我们审阅报名表并筛出面试名单。面试安排将在招新群内公布。</p>
          </li>
          <li class="tl-item reveal" data-phase="result">
            <span class="tl-when">面试结束后</span>
            <h3 class="tl-title">结果公布</h3>
            <p class="tl-desc">录取名单在招新群内公布。</p>
          </li>
        </ol>

        <div class="notices">
```

## 12. Announcement — `.notice` (+ `.pinned`), `.notice-list`
Source: `public/style.css` L518–542 · container `public/index.html` L161–167 · renderer `public/app.js` L623–696
Description: announcement rows with a left edge (pinned = accent edge), title, meta line and body; loaded
from `GET /api/announcements`, with the loading/empty/error copy also living in the renderer.
Props/variants: `.pinned`, `.notice-meta` (relative time), `.notice-body`; empty state renders a `.hint`.
```css
/* ============================================================
   公告
   ============================================================ */
.notices { border-top: 1px solid rgba(255, 255, 255, .10); padding-top: 18px; }
.notice-list { display: grid; gap: 10px; }
.notice {
  padding: 12px 14px;
  border-radius: var(--radius-in);
  background: rgba(255, 255, 255, .045);
  border: 1px solid rgba(255, 255, 255, .09);
  border-left: 3px solid rgba(255, 255, 255, .22);
}
.notice.pinned { border-left-color: var(--accent); }
.notice h3 { font-size: var(--fs-h3); font-weight: 640; color: #fff; margin-bottom: 4px; }
.notice-meta {
  font-family: var(--font-code);
  font-size: 11px;
  color: #8f98a6;
  margin-bottom: 6px;
}
.notice-body { color: #cfd4dc; font-size: var(--fs-sm); }

/* 报名表里的提示条：公告用的是同一套「一条边」语言 */
.banner strong { color: #fff; font-weight: 620; }

```

HTML container (`public/index.html` L161–167):
```html
          <h3 class="h3">公告</h3>
          <div id="notice-list" class="notice-list reveal">
            <p class="hint">公告加载中…</p>
          </div>
        </div>
      </div>
    </section>
```

Renderer — notices + friend links (`public/app.js` L623–696, complete IIFE):
```js
(() => {
  const list = document.getElementById('link-list');
  if (!list) return;

  fetch('/api/links')
    .then((r) => r.json())
    .then((data) => {
      list.textContent = '';
      if (!data.ok || !data.links.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '暂无友情链接。';
        list.appendChild(p);
        return;
      }
      data.links.forEach((link) => {
        const card = document.createElement('article');
        card.className = 'link-card reveal';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-expanded', 'false');

        const nameRow = document.createElement('div');
        nameRow.className = 'name';
        const nm = document.createElement('span');
        nm.textContent = link.name;
        const chev = document.createElement('span');
        chev.className = 'chev';
        chev.textContent = '→';
        nameRow.append(nm, chev);

        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = link.description || '暂无描述';

        const openBtn = document.createElement('a');
        openBtn.className = 'open-btn';
        openBtn.href = link.url;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.textContent = '在新标签页打开 ↗';

        card.append(nameRow, desc, openBtn);

        // 展开态完全由 CSS 控制（.open 决定 display），不用行内样式
        const toggle = () => {
          const isOpen = card.classList.toggle('open');
          card.setAttribute('aria-expanded', String(isOpen));
        };
        card.addEventListener('click', (e) => {
          if (e.target === openBtn || openBtn.contains(e.target)) return;
          toggle();
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
        list.appendChild(card);
      });

      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
        }
      }, { threshold: 0.2 });
      list.querySelectorAll('.link-card.reveal').forEach((c) => io.observe(c));
    })
    .catch(() => {
      list.textContent = '';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '友情链接加载失败。';
      list.appendChild(p);
    });
})();
```

## 13. Link card — `.link-card` (+ `.open`, `.open-btn`, `.chev`)
Source: `public/style.css` L821–895 · container `public/index.html` L313–318 · renderer `public/app.js` L623–696
Description: friend-link card; collapsed it is a name + chevron, expanded it reveals name/description/URL
and a copy-or-open action. Rendered from `GET /api/links`.
Props/variants: `.open`, `.name`, `.desc`, `.chev`, `.open-btn`; grid is 1 column, 2 columns ≥640px.
```css
.link-card {
  display: block;
  padding: 12px 14px;
  border-radius: var(--radius-in);
  background: rgba(255, 255, 255, .045);
  border: 1px solid rgba(255, 255, 255, .10);
  color: #e8e8e8;
  text-decoration: none;
}
.link-card:hover { background: rgba(255, 255, 255, .09); }

/* ---------- 友情链接卡片（app.js 动态生成） ----------
   折叠态：名字 + 打开按钮；展开态：描述滑出来。
   展开完全由 .open 控制（app.js 切类），不用行内样式。 */
.link-card {
  display: block;
  padding: 14px 16px;
  border-radius: var(--radius-in);
  background: rgba(255, 255, 255, .045);
  border: 1px solid rgba(255, 255, 255, .10);
  color: #e8e8e8;
  text-decoration: none;
  cursor: pointer;
}
.link-card:hover { border-color: rgba(255, 255, 255, .28); background: rgba(255, 255, 255, .08); }
.link-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.link-card .name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: var(--fs-sm);
  font-weight: 620;
  color: #fff;
}
.link-card .chev {
  font-family: var(--font-code);
  color: #9aa3b0;
  transition: transform var(--d-morph, 320ms) var(--ease-out);
}
.link-card.open .chev { transform: rotate(90deg); }
.link-card .desc {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  margin-top: 0;
  font-size: var(--fs-sm);
  line-height: 1.7;
  color: #9aa3b0;
}
.link-card.open .desc {
  max-height: 260px;
  opacity: 1;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, .12);
}
.link-card .open-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;              /* 触控目标下限 */
  margin-top: 12px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .06);
  color: #e8e8e8;
  font-family: var(--font-code);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}
.link-card .open-btn:hover { background: rgba(255, 255, 255, .14); }

```

HTML container (`public/index.html` L313–318):
```html
        </div>

        <div class="links-block">
          <h3 class="h3">友情链接</h3>
          <div id="link-list" class="link-list reveal"></div>
        </div>
```

## 14. Edit-code panel — `.token-panel` (+ `.token-box`)
Source: `public/style.css` L755–785 · usage `public/index.html` L283–296
Description: one-shot reveal of the edit code after a successful submit; shows the code in a mono box with
a copy action plus two warning lines. `[hidden]` until submit succeeds (`app.js` `showTokenPanel`).
Props/variants: `#token-value` (mono code), `#token-copy` (`.link-btn`), `.token-note`, `.token-warn`.
```css
/* ---------- 编辑码面板 ---------- */
.token-panel {
  margin-top: 18px;
  padding: 16px 14px;
  border-radius: var(--radius-in);
  background: rgba(78, 201, 176, .10);
  border: 1px solid rgba(78, 201, 176, .38);
}
.token-panel h3 { font-size: var(--fs-h3); color: #fff; margin-bottom: 8px; }
.token-note { color: #dfe4ea; font-size: var(--fs-sm); margin-bottom: 12px; }
.token-note strong { color: #fff; font-weight: 620; }
.token-box {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: var(--radius-in);
  background: rgba(0, 0, 0, .34);
  border: 1px solid rgba(255, 255, 255, .16);
}
.token-box code {
  flex: 1 1 12ch;
  min-width: 0;
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  color: #fff;
  word-break: break-all;
}
.token-warn { margin-top: 10px; font-size: var(--fs-sm); color: #f0b8ad; }

```

HTML usage (`public/index.html` L283–296):
```html
            <!-- 提交成功后一次性展示编辑码 -->
            <div id="token-panel" class="token-panel" hidden>
              <h3>请立即保存你的编辑码</h3>
              <p class="token-note">这是你之后修改报名信息的唯一凭证，<strong>我们不会再显示它</strong>。建议截图或复制到备忘录。</p>
              <div class="token-box">
                <code id="token-value"></code>
                <button type="button" id="token-copy" class="link-btn">复制</button>
              </div>
              <p class="token-warn">请勿把编辑码发给他人。丢失编辑码需联系管理员人工核验身份。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
```

## 15. Code belt — `.cf`, `.cf-meta`, `.cf-body`, `.cf-line`, `.cf-t`, `.cf-hold`
Source: `public/codefield.css` L27–294 (component internals; its `:root` tokens L15–40 are in `theme.md`)
Markup: `public/index.html` L34–58
Description: the signature element — a fixed, full-opacity code/terminal layer pinned to the top of the
page that plays a scripted typing animation (Java/C/Python/AI documents from `codefield-data.js`, driven
by the `codefield.js` engine). Content panels scroll *over* it and blur it through glass. It is
`aria-hidden` decoration: it must never carry information unavailable elsewhere.
Props/variants: `data-mode="editor|terminal"` on `#cf-root`, `.cf-body.is-editor` / `.is-install`,
`.cf-t.is-cur` (caret), `.cf-t.is-typo` (error squiggle), `.cf-t.is-sel` (selection), `.cf-line.is-rewrite`,
`.cf-hold` pause badge (outside `.cf` on purpose), `.cf.cf-sheet` for the in-flow static variant.
```css
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
  top: 0;
  left: 0;
  right: 0;
  height: var(--cf-h);
  z-index: 1;
  overflow: hidden;
  /* 底色透明，让下面的氛围层透上来 ——
     这样整条带子都有色调起伏，玻璃卡片到处都有东西可透，
     而不是只有代码那 360px 宽的范围里有。
     顺带：代码的对比度按纯黑算反而更高（原来按 #1f1f1f 算的）。 */
  background: transparent;
  color: var(--ed-fg, #cccccc);
  font-family: var(--cf-font);
  font-size: var(--cf-fs);
  line-height: var(--cf-lh);
  font-variant-ligatures: none;       /* 连字会让逐字宽度不可预测，也会把 -> 变成箭头 */
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* 底部渐隐到纯黑。
     遮罩盖的是整个代码带（连底色一起），所以下面不是「被切一刀」，
     而是代码和背景一起溶进页面的纯黑里。 */
  -webkit-mask-image: linear-gradient(180deg,
      #000 0, #000 var(--cf-fade), rgba(0,0,0,.42) 72%, rgba(0,0,0,.12) 90%, transparent 100%);
  mask-image: linear-gradient(180deg,
      #000 0, #000 var(--cf-fade), rgba(0,0,0,.42) 72%, rgba(0,0,0,.12) 90%, transparent 100%);

  /* 提升为独立合成层：代码带每 tick 只重绘自己，不牵动整页 */
  transform: translateZ(0);
  contain: layout paint style;
  user-select: none;
  pointer-events: none;               /* 装饰层，绝不抢点击 */
}

@media (min-width: 900px) { .cf { --cf-fs: 13.5px; --cf-gut: 54px; } }
/* 手机上把行号栏收窄，多出约 16px 给代码 */
@media (max-width: 899px) { .cf { --cf-gut: 30px; } }

/* ---------- 顶部面包屑：告诉你现在看的是哪个文件 ---------- */
.cf-meta {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: var(--cf-top);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  font-size: 0.84em;
  color: var(--syn-ln, #8a9199);
  opacity: .72;
}
.cf-file { color: var(--syn-fn, #dcdcaa); }
.cf-lang { color: var(--syn-ln, #8a9199); }
.cf-meta::after {
  content: '';
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: .16;
}

/* ---------- 主体 ---------- */
.cf-body { position: absolute; left: 0; right: 0; }

/* 所有档共用：可滚动区只占代码带的上部，底边留给渐隐区。
   正在打字/正在输出的那一行必须待在完全清晰的位置，
   不能已经落进渐隐里 —— 否则最新的内容反而最看不清。 */
.cf-body { bottom: 36%; }

/* 编辑器档：顶对齐，内容往下长，超出后由 JS 设 scrollTop 跟随光标。
   overflow:hidden 而不是 clip —— clip 会禁止程序滚动。
   注意：之前这里用 transform: translateY(--cf-shift) 做跟随，
   但 CSP 的 style-src 会拦内联样式属性；scrollTop 不碰样式，更省心。 */
.cf-body.is-editor {
  top: var(--cf-top);
  overflow: hidden;
}

/* 终端 / 依赖日志：顶对齐往下长，超出后往上滚（followBottom）。
   之前这里是 justify-content: flex-end 做底对齐，
   后果是第一行出现在带子底部然后往上长 —— 就是「从下往上」的观感。 */
.cf-body.is-terminal,
.cf-body.is-install {
  top: var(--cf-top);
  overflow: hidden;
  display: block;
}

/* ---------- 编辑器行 ---------- */
.cf-body.is-editor { counter-reset: ln; }

.cf-line {
  position: relative;
  padding-left: var(--cf-gut);
  padding-right: 16px;
  min-height: calc(1em * var(--cf-lh));
  white-space: pre;
}
.cf-line::before {
  counter-increment: ln;
  content: counter(ln);
  position: absolute;
  left: 0;
  width: calc(var(--cf-gut) - 14px);
  text-align: right;
  color: var(--syn-ln, #8a9199);
  opacity: 0;
}
/* 行号跟着打字一起出现；没打到的行不留行号，避免「空的文档却有 20 行号」 */
.cf-line.is-started::before { opacity: 1; }

/* 当前行高亮 —— 编辑器的原生行为 */
.cf-line.is-cur { background: rgba(255,255,255,.035); }

/* 光标：竖条，放在当前 token 的尾部（不能放行尾，因为后面的 token 只是透明了） */
.cf-t.is-cur::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1.06em;
  margin-right: -2px;
  vertical-align: -0.16em;
  background: var(--syn-caret, #aeafad);
  animation: cf-blink 1.06s steps(1, end) infinite;
}
@keyframes cf-blink { 0%, 55% { opacity: 1 } 56%, 100% { opacity: 0 } }

/* 未打到的 token：文本已经在 DOM 里占好位置（所以打字过程中零位移），只是不显示 */
.cf-t.is-hid { opacity: 0; }

/* 打错：红色波浪下划线，和 VSCode 的报错提示同款。
   意义不只是好看 —— 它让「打错了」这件事在屏幕上是看得见的，
   否则观众只会看到字符莫名其妙变少，读不出「作者改了个错」。 */
.cf-t.is-typo {
  color: var(--ed-del, #f48771);
  text-decoration: underline wavy var(--ed-del, #f48771);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

/* 选中全部（换档时的「全选删除」）—— VSCode 选区蓝
   注意选择器是 .cf-body.is-selecting：类加在 .cf-body 上，不是 .cf 上。 */
.cf-body.is-selecting .cf-t { background: var(--syn-sel, #264f78); color: transparent; }

/* 整行重写：这一行被全选，同样用选区蓝。
   和「全选删除」是同一个视觉语言 —— 都是「选起来准备动它」。 */
.cf-line.is-selected .cf-t { background: var(--syn-sel, #264f78); color: transparent; }

/* ---------- 暂停徽标 ----------
   用户一开始填表，代码带就停下并挂上这个标记。
   为什么要显示：动画突然不动会被当成卡死，说清楚「是我故意停的」才不会误解。

   暂停图标用两段 CSS 画的竖条，不用 ⏸ 这类字符 ——
   它们大多落在 U+23xx 符号区，等宽字体的覆盖很不稳（可能变成豆腐块）。 */
.cf-hold {
  /* fixed 到视口：卡片盖住代码带时也能看见（挂在 .cf 外面，见 HTML 注释） */
  position: fixed;
  z-index: 4;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border: 1px solid rgba(255, 255, 255, .20);
  border-radius: 999px;
  /* ⚠ 徽标自己也是一块玻璃，但它必须比卡片厚得多。
     徽标是浮在代码带最亮那一段上的（带子顶部），背后常有高亮 token；
     沿用卡片的淡 tint 时，实测文字对比度只有 3.23:1（320px）。
     小控件没有余地，所以这里 .90 不透明 + brightness(.7) 压暗背后。
     卡片可以很透，因为卡片里的文字下方有留白；徽标没有。 */
  background: rgba(8, 9, 13, .90);
  -webkit-backdrop-filter: blur(14px) saturate(150%) brightness(.7);
  backdrop-filter: blur(14px) saturate(150%) brightness(.7);
  color: #e8e8e8;
  font-family: var(--cf-font);
  font-size: 11px;
  line-height: 1.35;
  opacity: 0;
  transition: opacity 220ms ease;
}
.cf-hold[hidden] { display: none; }
/* 只在 paused-reduced 之外真正显示；:not([hidden]) 已经挡了，这里再给个渐入 */
.cf-hold:not([hidden]) { opacity: 1; }

.cf-hold-bars {
  position: relative;
  width: 8px;
  height: 10px;
  flex: none;
}
.cf-hold-bars::before,
.cf-hold-bars::after {
  content: '';
  position: absolute;
  top: 0;
  width: 3px;
  height: 10px;
  background: currentColor;
}
.cf-hold-bars::before { left: 0 }
.cf-hold-bars::after  { right: 0 }

/* ---------- 终端 / 日志行 ---------- */
.cf-tline { white-space: pre-wrap; overflow-wrap: anywhere; }
.cf-body.is-install .cf-tline { padding-left: var(--cf-gut); }

/* ---------- 语法着色（VSCode Dark+ 原生值） ---------- */
.k-kw { color: var(--syn-kw, #569cd6) }   /* 声明关键字 5.59:1 */
.k-ct { color: var(--syn-ct, #c586c0) }   /* 控制流     5.92:1 */
.k-ty { color: var(--syn-ty, #4ec9b0) }   /* 类型       8.09:1 */
.k-fn { color: var(--syn-fn, #dcdcaa) }   /* 函数       11.66:1 */
.k-va { color: var(--syn-va, #9cdcfe) }   /* 变量       11.05:1 */
.k-st { color: var(--syn-st, #ce9178) }   /* 字符串     6.24:1 */
.k-nu { color: var(--syn-nu, #b5cea8) }   /* 数字       9.70:1 */
.k-cm { color: var(--syn-cm, #6a9955) }   /* 注释       4.95:1 */
.k-an { color: var(--syn-an, #dcdcaa) }   /* 注解      11.66:1 */
.k-pp { color: var(--syn-pp, #569cd6) }   /* 预处理     5.59:1 */
.k-op { color: var(--syn-op, #d4d4d4) }
.k-ws { color: inherit }

/* ---------- 终端语义色 ---------- */
.t-box  { color: var(--syn-ln, #8a9199) }
.t-cmd  { color: var(--ed-fg, #cccccc) }
.t-user { color: var(--syn-va, #9cdcfe) }
.t-say  { color: var(--ed-fg, #cccccc) }
.t-say::first-letter { color: var(--ed-accent, #4da3e8) }   /* ⏺ */
.t-note { color: var(--syn-ln, #8a9199) }
.t-code { color: var(--syn-va, #9cdcfe) }
.t-add  { color: var(--ed-add, #4ec9b0); background: rgba(78,201,176,.10) }
.t-del  { color: var(--ed-del, #f48771); background: rgba(244,135,113,.10) }
.t-think { color: var(--syn-fn, #dcdcaa) }
.t-log  { color: var(--syn-ln, #8a9199) }
.t-build { color: var(--syn-ty, #4ec9b0) }
.t-plain { color: var(--ed-fg, #cccccc) }

/* ---------- 依赖下载的进度条 ----------
   固定总宽度：填充在长、剩余在短，两者之和恒定，
   所以右边的标签不会随着进度左右跳动。 */
.t-bar { white-space: pre; }
.bar-on  { color: var(--ed-accent, #4da3e8) }
.bar-off { color: var(--syn-ln, #8a9199); opacity: .3 }
.bar-lab { color: var(--syn-ln, #8a9199) }

/* 减少动效：一切静止 */
@media (prefers-reduced-motion: reduce) {
  .cf-t.is-cur::after { animation: none }
  .cf-body.is-editor { transition: none }
}

/* 打印 / 极端降级：不显示代码层 */
@media print { .cf { display: none } }

```

Markup (`public/index.html` L34–58 — belt + pause badge, including the comments that explain the
containment constraints):
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

## 16. Utility micro-classes
Source: `public/style.css` L143 (`.mono`), L379 (`.hint`), L957–966 (`.sr-only`), L925–956 (`.js .reveal`)
Description: `.mono` = code font + tabular numerals (counts), `.hint` = muted helper text (used for
loading/empty states), `.sr-only` = visually hidden but exposed to assistive tech, `.reveal` = entry
animation hook applied to list items/sections.
```css
.mono { font-family: var(--font-code); font-variant-numeric: tabular-nums; }
.hint { color: #8f98a6; font-size: var(--fs-sm); }
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

