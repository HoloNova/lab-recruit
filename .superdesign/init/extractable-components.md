# extractable-components.md — components that can become DraftComponents

This is the **menu** the design workflow reads before generating: what can be extracted, from where, and
which state should become a prop. Full source for each is in `components.md` / `layouts.md`.

**Extraction mechanics for this stack** (vanilla CSS + DOM, no framework):
- A DraftComponent here = the **CSS block** (verbatim from `public/style.css` / `public/codefield.css`)
  + the **markup fragment**, with per-instance copy/state lifted into props and one-time content
  (icons, class names, token values, CSS) hardcoded.
- Keep token references (`var(--fg-2)`, `var(--accent)`, `var(--dir-*)`) intact — do not inline colors.
- Keep `aria-hidden` on decorative parts (belt, index numbers, meters) and keep one accessible text
  source for anything a meter/badge visualizes (e.g. "3 / 9" is the text; the meter is decoration).
- Text is Chinese; preserve copy unless the design brief says otherwise.

## Layout Components

## TopBar
- Source: `public/index.html` L61–77 · `public/style.css` L156–264
- Category: layout
- Description: thin frosted sticky bar: editor-tab identity, phase status, anchor nav, CTA, progress line
- Extractable props: `phaseLabel` (string, default "预热中"), `activeSection` (string, default "hero"),
  `progressPct` (number 0–100, default 0), `showNav` (boolean, default true), `ctaLabel` (string,
  default "报名"), `ctaHref` (string, default "#apply")
- Hardcoded: tab name text + `.md` extension, nav item labels/hrefs, all CSS, `--top-h`

## CodeBelt
- Source: `public/index.html` L34–58 · `public/codefield.css` · `public/codefield.js` · `public/codefield-data.js`
- Category: layout
- Description: fixed decorative code/terminal layer behind content (the site's signature)
- Extractable props: `mode` ("editor" | "terminal", default "editor"), `activeDocId`
  ("sw"|"hw"|"al"|"ai", default "sw"), `paused` (boolean, default false), `holdReason` (string, default
  "已暂停")
- Hardcoded: file names, code content, syntax token classes, typing rhythm, fade height, all CSS

## SectionShell
- Source: `public/index.html` (per-section wrapper) · `public/style.css` L265–345
- Category: layout
- Description: glass card + section padding + entry reveal that every section sits in
- Extractable props: `id` (string), `eyebrow` (string), `title` (string), `reveal` (boolean, default true)
- Hardcoded: `.sec`/`.shell` classes, margins, backdrop blur, sheen, radii

## HeroSection
- Source: `public/index.html` L82–92 · CSS L265–311 + L346–402
- Category: layout
- Description: first screen: H1, lede paragraph, single primary CTA
- Extractable props: `title`, `lede`, `ctaLabel`, `ctaHref`
- Hardcoded: type scale, glass card, sheen

## Footer
- Source: `public/index.html` L320 · `public/style.css` L904–912
- Category: layout
- Description: one-line copyright inside the last glass card
- Extractable props: `copyright` (string, default "© 2026 网络攻防与信息安全实验室")
- Hardcoded: layout, type

## ApplyPane
- Source: `public/index.html` L169–181 · `public/style.css` L562–603
- Category: layout
- Description: document-surface frame for the form: title bar + required count + completion meter
- Extractable props: `docName` (default "报名表"), `completed` (number, default 0), `total` (number,
  default 9)
- Hardcoded: `.pane` chrome (bar, meter gradient), mono count style

## JoinGrid / QrBlock
- Source: `public/index.html` L298–318 · `public/style.css` L786–820
- Category: layout
- Description: two-column join block (QR image or fallback text) + 7-day expiry warning
- Extractable props: `qrSrc` (string|null), `fallbackText` (string), `warningText` (string),
  `contactText` (string)
- Hardcoded: grid breakpoints, warning color, QR max width

## Basic Components

## PrimaryButton
- Source: `public/style.css` L381–402 · usage `public/index.html` L91
- Category: basic
- Description: single high-emphasis CTA (inverted slab)
- Extractable props: `label` (string), `href` (string)
- Hardcoded: hover arrow, press easing, radius, all CSS

## SubmitButton
- Source: `public/style.css` L726–754 · usage L266–269
- Category: basic
- Description: full-width form submit with adjacent live status line
- Extractable props: `label` (default "提交报名"), `disabled` (boolean, default false),
  `statusText` (string), `statusKind` ("info"|"ok"|"err", default "info")
- Hardcoded: grid placement, `role="status"`, colors for `is-ok`/`is-err`

## LinkButton
- Source: `public/style.css` L707–724, L896–912 · usage L191/L247/L286–291
- Category: basic
- Description: inline text action, with a lower-emphasis `.subtle` variant
- Extractable props: `label` (string), `variant` ("default"|"subtle", default "default"),
  `disabled` (boolean, default false)
- Hardcoded: underline-on-hover, `:focus-visible` ring, all CSS

## Field
- Source: `public/style.css` L631–687 · usage L195–280
- Category: basic
- Description: labelled form control (input / select / textarea) with required/optional marks
- Extractable props: `id` (string), `label` (string), `required` (boolean, default false),
  `optionalLabel` (string, default "选填"), `control` ("input"|"select"|"textarea", default "input"),
  `type` (string, default "text"), `value` (string), `placeholder` (string), `maxlength` (number),
  `rows` (number), `options` (array of {value,label}), `wide` (boolean, default false → `.full`)
- Hardcoded: label typography, focus ring, grid column math, `--fs-input`

## CaptchaRow
- Source: `public/style.css` L688–706 · usage L243–249
- Category: basic
- Description: captcha image + answer input + refresh action on one row
- Extractable props: `imgSrc` (string), `loading` (boolean, default false), `refreshLabel`
  (default "换一张"), `width`/`height` (numbers, defaults 150/50)
- Hardcoded: row wrap breakpoint, image border, alt-text affordance

## Banner
- Source: `public/style.css` L605–630 · usage L181–192
- Category: basic
- Description: left-edge strip for phase state / device record / edit mode
- Extractable props: `variant` ("phase"|"device"|"edit", default "phase"), `text` (string),
  `hidden` (boolean, default true), `actionLabel` (string, e.g. "退出修改"), `actionHref` (string)
- Hardcoded: edge color logic, `.edit-banner` accent, typography

## DeviceCard
- Source: `public/app.js` L212–288 · CSS `public/style.css` L543–561
- Category: basic
- Description: "this device already submitted" card with masked student id + reveal/edit actions
- Extractable props: `sidMasked` (string), `submittedAt` (string), `canEdit` (boolean, default true)
- Hardcoded: masking rule, list markup, `.subtle` actions

## DirectionRow
- Source: `public/style.css` L403–466 · usage L97–127
- Category: basic
- Description: one recruitment track as a code-like row (name / index / fake diff line / description)
- Extractable props: `direction` (string, e.g. "软件"), `dirKey` ("sw"|"hw"|"al"|"ai", default "sw"),
  `index` (string, default "01"), `codeLine` (string), `description` (string),
  `selected` (boolean, default false)
- Hardcoded: row grid, hover lift, `--dir-*` mapping, index numerals (aria-hidden)

## TimelineItem
- Source: `public/style.css` L467–517 · usage L136–160
- Category: basic
- Description: one phase of the 4-step process timeline, with rail + node
- Extractable props: `phase` ("warmup"|"signup"|"review"|"result"), `when` (string),
  `title` (string), `description` (string), `state` ("pending"|"active"|"done", default "pending")
- Hardcoded: rail geometry, node size/border, `.tl-done`/`.tl-active` colors

## NoticeItem
- Source: `public/style.css` L518–542 · renderer `public/app.js` L623–696
- Category: basic
- Description: announcement row with left edge, title, relative time, body
- Extractable props: `title` (string), `body` (string), `publishedAt` (string|relative label),
  `pinned` (boolean, default false)
- Hardcoded: `.notice` edge, meta styling, empty-state copy ("暂无公告")

## LinkCard
- Source: `public/style.css` L821–895 · renderer `public/app.js` L623–696
- Category: basic
- Description: friend-link card; collapsed name+chevron, expanded description + open/copy action
- Extractable props: `name` (string), `description` (string), `url` (string), `open` (boolean,
  default false)
- Hardcoded: chevron glyph, grid breakpoint, open/collapse behaviour

## TokenPanel
- Source: `public/style.css` L755–785 · usage L283–296
- Category: basic
- Description: one-time edit-code reveal with copy action and two warnings
- Extractable props: `token` (string), `visible` (boolean, default false), `copyLabel`
  (default "复制")
- Hardcoded: mono box style, warning copy, `.token-warn` color

## Heading
- Source: `public/style.css` L346–380 · usage L85/L96/L133/L301
- Category: basic
- Description: h1/h2 with optional uppercase code-font eyebrow ("DIRECTIONS", "FLOW", "GROUP")
- Extractable props: `level` (1|2|3, default 2), `text` (string), `eyebrow` (string|null)
- Hardcoded: `.h2-en` letter-spacing/case, sizes per breakpoint

## MeterLine
- Source: `public/style.css` L589–603 · usage L179 + `app.js` `updateMeter()`
- Category: basic
- Description: 1px completion readout under the pane bar; decoration for the "n / 9" text
- Extractable props: `completed` (number), `total` (number)
- Hardcoded: gradient fill, `aria-hidden` on the track

## HintText / MonoCount / Reveal / SrOnly
- Source: `public/style.css` L143, L379, L913–967, L957–966
- Category: basic
- Description: micro utilities — muted helper text, tabular code-font numbers, entry animation hook,
  screen-reader-only text
- Extractable props: `text` (string) for HintText/MonoCount; `delayIndex` (number) for Reveal
- Hardcoded: all styling

## Not extractable / avoid
- `.cf-hold` pause badge: must remain a **sibling** of the belt (containment), so extract only together
  with CodeBelt.
- `#prog-fill` / `#meter-fill` widths: JS-driven inline values, not props of the visible components.
- `scout/` recon scripts and `docs/superpowers/` specs: not UI, do not extract.
