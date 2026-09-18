# pages.md — page dependency trees

Every tree below is the **candidate set of `--context-file` files** for that page (apply the payload
budget when selecting). There is only one product page; the two `preview/` pages are dev artifacts.

## `/` (recruitment page — `public/index.html`)
Entry: `public/index.html` (331 lines, single document — no template partials)

Dependencies:
- `public/style.css` — all layout + components; **token block L25–93**, sections: base L94–117,
  atmosphere L118–155, top bar L156–264, glass card L265–311, section skeleton L312–345, headings
  L346–380, primary button L381–402, direction list L403–466, timeline L467–517, notices L518–561,
  apply pane L562–604, banners L605–630, fields L631–687, captcha L688–706, link buttons L707–725,
  submit L726–754, token panel L755–785, join/links/footer L786–912, reveal L913–967, bottom space L968+
- `/api/themes.css` (server-side concat of:)
  - `themes/01-editor-light.css`
  - `themes/02-editor-dark.css` (default)
- `public/codefield.css` — belt tokens L15–40, belt internals L27–294, static-sheet variant L295+
- `public/theme-init.js` — sets `html[data-theme]` + `meta[theme-color]` before first paint
- `public/codefield-data.js` — `window.CODEFIELD_DATA` (4 docs: sw/hw/al/ai) + `CODEFIELD_ORDER`
- `public/codefield.js` — `window.codefield` engine (typing/streaming/append renderers, pause API)
- `public/app.js` — four IIFEs, in document order:
  1. L18–96 entry + top bar (reveal observer, `#prog-fill`, `#phase-text` active section)
  2. L105–131 direction rows → prefill `#direction`
  3. L135–620 form (captcha, validation, submit, edit mode, token panel, meter, device card, phase gating)
  4. L623–696 announcements + friend links renderers
- Runtime JSON: `/api/form-config`, `/api/captcha`, `/api/announcements`, `/api/links`,
  `/api/wechat-qr`, `POST /api/applications[/edit/lookup|/edit]` (see `routes.md`)

Section → context map (for scoped design work):
| Section (id) | Markup | CSS | JS |
|---|---|---|---|
| `#hero` | L82–92 | L265–311 (glass) + L346–380 (headings) + L381–402 (`.btn`) | — |
| `#directions` | L93–131 | L403–466 | `app.js` L105–131 |
| `#flow` | L132–168 | L467–561 (timeline + notices) | `app.js` L623–696 (notices) |
| `#apply` | L169–297 | L562–785 (pane→token panel) + L631–687 (fields) | `app.js` L135–620 |
| `#join` | L298–322 | L786–912 (join/links/footer) | `app.js` L623–696 (links) |
| belt | L34–58 | `codefield.css` + `/api/themes.css` | `codefield-data.js` + `codefield.js` |

## `/preview/codefield.html` (dev prototype — 4 tones side by side)
Entry: `public/preview/codefield.html`
Dependencies:
- `public/preview/codefield-proto.css`
- `/api/themes.css` → `themes/01-editor-light.css`, `themes/02-editor-dark.css`
- `public/codefield.css`
- `public/codefield-data.js`
- `public/codefield.js`
- `public/preview/codefield-proto.js`
Note: no `style.css`, no `app.js`, no `theme-init.js` — it renders belt tones on a bare page.

## `/preview/codefield-sheet.html` (dev static 4-column sheet)
Entry: `public/preview/codefield-sheet.html`
Dependencies:
- `public/preview/codefield-sheet.css`
- `/api/themes.css` → `themes/01-editor-light.css`, `themes/02-editor-dark.css`
- `public/codefield.css` (uses the in-flow variant `.cf.cf-sheet`, codefield.css L295+)
- `public/codefield-data.js`
- `public/codefield.js` (renders static frames, no animation)
- `public/preview/codefield-sheet.js`

## Excluded from context (not UI)
`scout/` (Playwright recon scripts + screenshots, incl. its own `node_modules`), `scripts/`, `test/`,
`lib/`, `db.js`, `deploy/`, `docs/superpowers/specs|reports` (text specs — read only when a design task
explicitly needs the written design rationale), `data/` (SQLite + dev peppers).
