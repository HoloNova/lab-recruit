# routes.md — routes & entry points

## Framework detection
- **Framework: none.** No React/Vue/Svelte/Angular, no meta-framework, no bundler, no Tailwind, no
  component library. `package.json` deps are only `express` + `svg-captcha`.
- **Server:** `server.js` (Express 4, app factory `createApp()`), static files from `config.PUBLIC_DIR`
  (= `public/`), dynamic CSS from `themes/`.
- **Client routing: none.** One document with five in-page anchors: `#hero`, `#directions`, `#flow`,
  `#apply`, `#join`.
- **Entry document:** `public/index.html`.

## Page routes (HTML)
| URL | Served by | File |
|---|---|---|
| `/` | `express.static` with `index: 'index.html'` (server.js L266–275) | `public/index.html` — the only product page |
| `/preview/codefield.html` | static | `public/preview/codefield.html` — dev prototype (belt, 4 tones side by side) |
| `/preview/codefield-sheet.html` | static | `public/preview/codefield-sheet.html` — dev static 4-column sheet |

Nothing else is a page: every other path under `public/` is an asset.

## Asset routes (static, same middleware)
| URL | File | Role |
|---|---|---|
| `/style.css` | `public/style.css` | all layout + in-page components (tokens at L25–93) |
| `/codefield.css` | `public/codefield.css` | code belt internals + belt tokens |
| `/theme-init.js` | `public/theme-init.js` | pre-paint theme decision (sync, in `<head>`) |
| `/codefield-data.js` | `public/codefield-data.js` | belt content (pure data, `window.CODEFIELD_DATA`) |
| `/codefield.js` | `public/codefield.js` | belt engine (`window.codefield`) |
| `/app.js` | `public/app.js` | page logic: entry/progress, direction prefill, form, captcha, announcements, links |
| `/preview/codefield-proto.{css,js}` | `public/preview/…` | prototype-only styles/behaviour |
| `/preview/codefield-sheet.{css,js}` | `public/preview/…` | static-sheet-only styles/behaviour |

## Dynamic CSS route
`GET /api/themes.css` — concatenates every `themes/*.css` in sorted filename order; ETag from
name+mtime+size; `Cache-Control: no-cache` (revalidate every load so a theme edit is visible immediately).
This is the **router config equivalent for theming**: adding `themes/03-*.css` publishes a new theme
without touching HTML or the server.

Sources — `server.js` L343–354 (handler) and L114–134 (`buildThemesCss`):
```js
  app.get('/api/themes.css', (req, res) => {
    const { css, etag, files } = buildThemesCss(config.THEMES_DIR);
    if (!files) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).type('text/css').send('/* themes/ 下没有主题文件 */');
    }
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache'); // 允许缓存但每次回源校验；改主题后立即生效
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.type('text/css').send(css);
  });

```

```js
function buildThemesCss(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.css')).sort();
  } catch {
    return { css: '', etag: null, files: 0 };
  }
  const parts = [];
  const stamps = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    stamps.push(`${name}:${st.mtimeMs.toString(36)}:${st.size.toString(36)}`);
    parts.push(`/* ——— ${name} ——— */\n${fs.readFileSync(file, 'utf8')}`);
  }
  if (!parts.length) return { css: '', etag: null, files: 0 };
  const etag = `"th${crypto.createHash('sha256').update(stamps.join('|')).digest('base64url').slice(0, 22)}"`;
  return { css: parts.join('\n'), etag, files: parts.length };
}
```

Static middleware the page routes ride on (`server.js` L266–275):
```js
  app.use(express.static(config.PUBLIC_DIR, {
    index: 'index.html',
    dotfiles: 'ignore',
    etag: true,
    setHeaders(res) {
      res.set('Cache-Control', 'no-cache');
    },
  }));

  // ---------------------------------------------------------------- 接口
```

## JSON API routes consumed by the UI
| Method | URL | Used by | Returns |
|---|---|---|---|
| GET | `/api/health` | ops only | `{ ok, phase }` |
| GET | `/api/form-config` | `app.js` §3 — phase/gating, form id, honeypot field name, limits, directions, contact types, QR URL, student-id pattern | see below |
| GET | `/api/captcha` | `app.js` — captcha image (`svg` string) + `captcha_id` | 429 when the issue quota is hit |
| GET | `/api/announcements` | `app.js` §4 → notices list | up to 20 visible announcements (pinned first per server order) |
| GET | `/api/links` | `app.js` §4 → friend-link cards | `{ links: [...] }` |
| GET | `/api/wechat-qr` | `app.js` `loadQr()` → `#qr-img` | image bytes, or 404 JSON → fallback text |
| POST | `/api/applications` | submit form | application + one-time edit code |
| POST | `/api/applications/edit/lookup` | edit flow | masked record for confirmation |
| POST | `/api/applications/edit` | edit flow with edit code | updated record |

Handlers that feed visible UI state (L277–371):
```js
  app.get('/api/health', (req, res) => {
    const info = phaseInfo(repo.getSettings(), now());
    res.json({ ok: true, phase: info.phase });
  });

  app.get('/api/form-config', (req, res) => {
    const sid = ensureSid(req, res);
    const t = now();
    repo.touchSession(sid, t);
    repo.pruneFormStarts(t - 24 * 60 * 60_000);

    const formId = crypto.randomBytes(12).toString('base64url');
    repo.insertFormStart(formId, sid, t);

    const { honeypotField, contactEmail } = settingsView(repo, config);
    const info = phaseInfo(repo.getSettings(), t);

    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      phase: info.phase,
      registration: {
        open: info.open,
        opens_at: info.opens_at,
        closes_at: info.closes_at,
      },
      form_id: formId,
      honeypot_field: honeypotField,
      contact_email: contactEmail,
      wechat_qr_url: '/api/wechat-qr',
      student_id_pattern: '^2026\\d{6}$',
      limits: { name: 20, class_name: 30, contact: 50, major: 30, intro: 200, learned: 200, ai_views: 200 },
      directions: ['软件', '硬件', '算法', '人工智能'],
      contact_types: ['wechat', 'phone'],
    });
  });

  app.get('/api/captcha', (req, res) => {
    const sid = ensureSid(req, res);
    const result = captcha.issue(sid);
    res.set('Cache-Control', 'no-store');
    if (!result.ok) {
      return res.status(429).json({ ok: false, code: 'CAPTCHA_QUOTA', message: '请求过于频繁，请稍后再试' });
    }
    res.json({ ok: true, captcha_id: result.id, svg: result.svg });
  });

  app.get('/api/announcements', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      announcements: repo.listVisibleAnnouncements(20).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned === 1,
        published_at: a.published_at,
      })),
    });
  });

  app.get('/api/links', (req, res) => {
    res.json({ ok: true, links: repo.getLinks() });
  });

  // ---- 主题仓库 ----
  app.get('/api/themes.css', (req, res) => {
    const { css, etag, files } = buildThemesCss(config.THEMES_DIR);
    if (!files) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).type('text/css').send('/* themes/ 下没有主题文件 */');
    }
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache'); // 允许缓存但每次回源校验；改主题后立即生效
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.type('text/css').send(css);
  });

  app.get('/api/wechat-qr', (req, res) => {
    const file = findQrFile(config.QR_DIR);
    if (!file) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).json({ ok: false, code: 'QR_UNAVAILABLE', message: '招新群二维码暂未配置' });
    }
    const st = fs.statSync(file);
    // mtime 精度不足，带上 size 降低碰撞
    const etag = `"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'no-cache'); // 允许缓存但每次回源校验；换图后立即生效
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.set('Content-Type', MIME_BY_EXT[path.extname(file)] || 'application/octet-stream');
    res.sendFile(file);
  });

  // ---- 提交报名 ----
```

Write endpoints are `POST /api/applications` (`server.js` L372–472), `POST /api/applications/edit/lookup`
(L473–522) and `POST /api/applications/edit` (L523–621); they are data/validation only (captcha, honeypot,
rate limits, risk scoring in `lib/`), so they carry no layout value for design work — read them there if a
design needs their exact copy/error codes. Unmatched `/api/*` returns JSON 404 (L622–626).

## Design-relevant notes
- All page copy that is not hardcoded in `index.html` comes from these endpoints: **notice items, link
  cards, QR image + fallback text, phase banner text, device-card text, limits** (e.g. `limits.intro` =
  200 chars → textarea `maxlength`).
- `directions: ['软件','硬件','算法','人工智能']` is the canonical list order and the values written into
  `#direction` — keep it in sync with the `.dir-row` markup and the belt's `CODEFIELD_DATA` keys
  (`sw/hw/al/ai`).
- Phase names are `warmup | signup | review | result` and map to `.tl-item[data-phase]` states.
