/* ============================================================
   网络攻防与信息安全 · 实验室招新 —— 前端逻辑

   1. 入场与顶部（进度线 / 当前区块 / 阶段）
   2. 方向 → 预填报名表
   3. 报名表（验证码 + 编辑码 + 完成度读数）
   4. 公告 / 加群 / 友链

   动效原则：零常驻 rAF。滚动只写一个元素的 transform，
   且仅在变化 ≥0.5% 时写；不读布局、不交错读写。
   ============================================================ */

/* JS 可用时才启用「先隐藏再入场」——
   否则脚本失败会让标题永久隐形。CSS 里所有初始隐藏态都挂在 .js 下。 */
document.documentElement.classList.add('js');

/* ========== 1. 入场与顶部 ========== */
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

/* ========== 2. 代码带：方向 → 切档 ==========
   背景的代码带由 codefield.js 驱动（打字 / 打错删除 / 整行重写 / 拉依赖 / 终端）。

   这里只做一件事：把「点方向行」接到场上。
   以前这里有第二个 hero 差异面板（.diff），它已经被代码带本身取代了 ——
   代码现在是整页的背景，不是页面里的一个组件。
*/
(() => {
  const select = document.getElementById('direction');
  const applySec = document.getElementById('apply');
  const hint = document.getElementById('dir-hint');
  const rows = [...document.querySelectorAll('.dir-row')];

  function pick(row) {
    const dir = row.dataset.direction;
    const key = row.dataset.dir;          // sw / hw / al / ai —— 和 codefield 的文档 id 一致
    if (!dir || !select) return;
    select.value = dir;
    rows.forEach((r) => r.setAttribute('aria-pressed', String(r === row)));

    // 背景切到对应方向。手动选过之后就停掉自动轮播，别打断用户。
    const cf = window.codefield;
    if (cf && cf.go && key) { cf.pause(); cf.go(key); }

    if (hint) hint.textContent = '已选「' + dir + '」，继续填报名表。';
    applySec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const el = document.getElementById('student_id');
      if (el) el.focus({ preventScroll: true });
    }, 700);
  }

  rows.forEach((row) => row.addEventListener('click', () => pick(row)));
})();


/* ========== 3. 报名表：阶段 / 验证码 / 编辑码 / 完成度 ========== */
(() => {
  const form = document.getElementById('app-form');
  if (!form) return;

  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');
  const phaseBanner = document.getElementById('phase-banner');
  const deviceCard = document.getElementById('device-card');
  const editBanner = document.getElementById('edit-banner');
  const editBannerText = document.getElementById('edit-banner-text');
  const editCancel = document.getElementById('edit-cancel');
  const captchaImg = document.getElementById('captcha-img');
  const captchaInput = document.getElementById('captcha_answer');
  const captchaRefresh = document.getElementById('captcha-refresh');
  const tokenPanel = document.getElementById('token-panel');
  const tokenValue = document.getElementById('token-value');
  const tokenCopy = document.getElementById('token-copy');
  const haveTokenWrap = document.getElementById('have-token-wrap');
  const editTokenInput = document.getElementById('edit_token_input');
  const editStartBtn = document.getElementById('edit-start');
  const formFoot = document.getElementById('form-foot');
  const phaseText = document.getElementById('phase-text');
  const meterFill = document.getElementById('meter-fill');
  const docProgress = document.getElementById('doc-progress');

  const LS_KEY = 'recruit.submissions.v1';
  const state = { config: null, mode: 'create', captchaId: null, honeypotName: 'website', editing: null };

  function showStatus(msg, cls) {
    statusEl.className = 'form-status ' + (cls || '');
    statusEl.textContent = msg || '';
  }

  /* ---- 北京时间展示 ---- */
  function fmtCN(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d);
    } catch { return d.toLocaleString(); }
  }

  /* ---- 完成度读数：同一条信号线，这次它反映真实状态 ---- */
  const requiredFields = [...form.querySelectorAll('[required]')];
  const meterTotal = requiredFields.length || 1;

  function updateMeter() {
    let done = 0;
    for (const el of requiredFields) {
      if (el === captchaInput) { if ((el.value || '').trim()) done++; continue; }
      if ((el.value || '').trim()) done++;
    }
    if (docProgress) docProgress.textContent = done + ' / ' + meterTotal;
    if (meterFill) meterFill.style.transform = 'scaleX(' + (done / meterTotal).toFixed(4) + ')';
  }

  form.addEventListener('input', updateMeter);
  form.addEventListener('change', updateMeter);
  form.addEventListener('reset', () => setTimeout(updateMeter, 0));
  updateMeter();

  /* ---- 本设备已提交记录（便利副本，不是安全控制） ---- */
  function loadSubs() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveSub(token, sidFull) {
    const list = loadSubs().filter((x) => x.sid_full !== sidFull);
    list.push({ token, sid_full: sidFull, sid_masked: maskSid(sidFull), at: new Date().toISOString() });
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* 隐私模式忽略 */ }
  }
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

  function applyPhase(cfg) {
    const open = cfg.registration && cfg.registration.open;
    const phase = cfg.phase;

    if (phaseText) phaseText.textContent = PHASE_TEXT[phase] || '招新中';

    document.querySelectorAll('.tl-item').forEach((el) => {
      const p = el.dataset.phase;
      el.classList.remove('tl-active', 'tl-done');
      if (p === phase) el.classList.add('tl-active');
      if (phase === 'signup' && p === 'warmup') el.classList.add('tl-done');
      if (phase === 'review' && (p === 'warmup' || p === 'signup')) el.classList.add('tl-done');
      if (phase === 'result' && p !== 'result') el.classList.add('tl-done');
    });

    if (open) { phaseBanner.hidden = true; setFormDisabled(false); return; }

    const opens = cfg.registration && cfg.registration.opens_at;
    phaseBanner.hidden = false;
    phaseBanner.textContent = '';
    const strong = document.createElement('strong');
    if (phase === 'warmup') {
      strong.textContent = '报名尚未开放';
      phaseBanner.appendChild(strong);
      phaseBanner.append(
        opens ? `　预计 ${fmtCN(opens)} 开放。` : '　预计国庆假期后开放。',
        '可以先加入下方招新群，开放时会第一时间在群里通知。'
      );
    } else {
      strong.textContent = '报名已截止';
      phaseBanner.appendChild(strong);
      phaseBanner.append('面试安排请查看招新群通知。');
    }
    setFormDisabled(true);
  }

  function setFormDisabled(disabled) {
    for (const el of form.querySelectorAll('input, select, textarea, button')) {
      if (el.id === 'edit_token_input' || el.id === 'edit-start') continue; // 编辑入口保持可用
      el.disabled = disabled;
    }
    form.classList.toggle('is-closed', disabled);
    submitBtn.textContent = disabled ? '报名未开放' : (state.mode === 'edit' ? '保存修改' : '提交报名');
  }

  /* ---- 提交 ---- */
  function collectPayload() {
    const fd = form.elements;
    const payload = {
      student_id: (fd.student_id.value || '').trim(),
      name: (fd.name.value || '').trim(),
      class_name: (fd.class_name.value || '').trim(),
      major: (fd.major.value || '').trim(),
      contact_type: fd.contact_type.value,
      contact: (fd.contact.value || '').trim(),
      direction: fd.direction.value,
      intro: (fd.intro.value || '').trim(),
      learned: (fd.learned.value || '').trim(),
      ai_views: (fd.ai_views.value || '').trim(),
      captcha_id: state.captchaId,
      captcha_answer: (captchaInput.value || '').trim(),
      form_id: state.config ? state.config.form_id : '',
    };
    const trap = form.elements[state.honeypotName];
    payload[state.honeypotName] = trap ? trap.value : '';
    if (state.mode === 'edit' && state.editing) {
      payload.student_id = state.editing.student_id;
      payload.edit_token = state.editing.token;
    }
    return payload;
  }

  function clientValidate(payload) {
    if (!payload.student_id) return '请填写学号';
    if (!/^2026\d{6}$/.test(payload.student_id)) return '学号格式应为 2026 开头的 10 位数字';
    if (!payload.name) return '请填写姓名';
    if (!payload.class_name) return '请填写班级';
    if (!payload.major) return '请填写专业';
    if (!payload.contact_type) return '请选择联系方式类型';
    if (!payload.contact) return '请填写联系方式';
    if (!payload.direction) return '请选择方向';
    if (!payload.intro) return '请填写个人简介';
    if (!payload.captcha_answer) return '请填写人机验证码';
    return null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showStatus('');
    const payload = collectPayload();
    const problem = clientValidate(payload);
    if (problem) return showStatus('✗ ' + problem, 'err');

    const url = state.mode === 'edit' ? '/api/applications/edit' : '/api/applications';
    submitBtn.disabled = true;
    submitBtn.textContent = state.mode === 'edit' ? '保存中…' : '提交中…';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        saveSub(data.edit_token, payload.student_id);
        showTokenPanel(data.edit_token, data.message);
        renderDeviceCard();
        if (state.mode === 'edit') exitEditMode();
        form.reset();
        captchaInput.value = '';
        updateMeter();
        await refreshCaptcha();
        showStatus('✓ ' + (data.message || '提交成功'), 'ok');
        return;
      }

      // 学号已存在 → 引导走编辑流程，不透露任何已有信息
      if (res.status === 409) {
        showStatus('✗ ' + data.message, 'err');
        haveTokenWrap.hidden = false;
        editTokenInput.focus();
        captchaInput.value = '';
        updateMeter();
        await refreshCaptcha();
        return;
      }

      showStatus('✗ ' + (data.message || '提交失败，请重试'), 'err');
      captchaInput.value = '';
      updateMeter();
      await refreshCaptcha();
    } catch {
      showStatus('✗ 网络错误，请稍后重试', 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = state.mode === 'edit' ? '保存修改' : '提交报名';
    }
  });

  function showTokenPanel(token, message) {
    tokenValue.textContent = token;
    tokenPanel.hidden = false;
    tokenPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (message) showStatus('✓ ' + message, 'ok');
  }

  tokenCopy.addEventListener('click', async () => {
    const text = tokenValue.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      tokenCopy.textContent = '已复制 ✓';
    } catch {
      // 剪贴板不可用时的兜底
      const range = document.createRange();
      range.selectNodeContents(tokenValue);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      tokenCopy.textContent = '请按 Ctrl/Cmd+C';
    }
    setTimeout(() => { tokenCopy.textContent = '复制'; }, 2500);
  });

  /* ---- 编辑流程 ---- */
  async function startEdit(studentId, token) {
    showStatus('');
    try {
      const res = await fetch('/api/applications/edit/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, edit_token: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showStatus('✗ ' + (data.message || '编辑码不正确'), 'err');
        return;
      }
      const c = data.current;
      const fd = form.elements;
      fd.student_id.value = c.student_id;
      fd.name.value = c.name || '';
      fd.class_name.value = c.class_name || '';
      fd.major.value = c.major || '';
      fd.contact_type.value = c.contact_type || '';
      fd.contact.value = c.contact || '';
      fd.direction.value = c.direction || '';
      fd.intro.value = c.intro || '';
      fd.learned.value = c.learned || '';
      fd.ai_views.value = c.ai_views || '';

      state.mode = 'edit';
      state.editing = { student_id: c.student_id, token };
      fd.student_id.readOnly = true;
      editBanner.hidden = false;
      editBannerText.textContent = `正在修改 ${maskSid(c.student_id)} 的报名`;
      submitBtn.textContent = '保存修改';
      haveTokenWrap.hidden = true;
      showStatus('已载入你的报名信息，修改后填验证码提交。', 'ok');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      captchaInput.value = '';
      updateMeter();
      await refreshCaptcha();
    } catch {
      showStatus('✗ 网络错误，请稍后重试', 'err');
    }
  }

  function exitEditMode() {
    state.mode = 'create';
    state.editing = null;
    form.elements.student_id.readOnly = false;
    editBanner.hidden = true;
    submitBtn.textContent = '提交报名';
  }
  editCancel.addEventListener('click', () => {
    exitEditMode();
    form.reset();
    updateMeter();
    showStatus('');
  });

  editStartBtn.addEventListener('click', () => {
    const token = (editTokenInput.value || '').trim();
    const sid = (form.elements.student_id.value || '').trim();
    if (!sid) return showStatus('✗ 请先在"学号"栏填写你的学号', 'err');
    if (!token) return showStatus('✗ 请粘贴编辑码', 'err');
    startEdit(sid, token);
  });

  /* ---- 公告 ---- */
  async function loadAnnouncements() {
    const box = document.getElementById('notice-list');
    if (!box) return;
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      box.textContent = '';
      if (!data.ok || !data.announcements.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '暂无公告。报名开放、面试安排都会在这里和招新群同步。';
        box.appendChild(p);
        return;
      }
      for (const a of data.announcements) {
        const item = document.createElement('article');
        item.className = 'notice' + (a.pinned ? ' pinned' : '');
        const h = document.createElement('h3');
        h.textContent = a.title;
        const meta = document.createElement('p');
        meta.className = 'notice-meta';
        meta.textContent = (a.pinned ? '置顶 · ' : '');
        const t = document.createElement('span');
        t.className = 'mono';
        t.textContent = fmtCN(a.published_at);
        meta.appendChild(t);
        // 纯文本渲染：不解析 Markdown/HTML
        const body = document.createElement('p');
        body.className = 'notice-body';
        body.textContent = a.body;
        item.append(h, meta, body);
        box.appendChild(item);
      }
    } catch {
      box.textContent = '';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '公告加载失败，请刷新重试。';
      box.appendChild(p);
    }
  }

  /* ---- 加群二维码 ---- */
  function loadQr(cfg) {
    const img = document.getElementById('qr-img');
    const fallback = document.getElementById('qr-fallback');
    const contact = document.getElementById('join-contact');
    if (!img) return;
    img.hidden = false;
    img.addEventListener('load', () => { fallback.textContent = ''; });
    img.addEventListener('error', () => {
      img.hidden = true;
      fallback.textContent = '招新群二维码暂未配置。请稍后再来，或通过下方邮箱联系我们。';
    });
    // 每次加载都带时间戳，避免中间层缓存住旧图
    img.src = '/api/wechat-qr?t=' + Date.now();
    if (contact && cfg && cfg.contact_email) {
      contact.textContent = '群二维码失效或群已满？请联系 ' + cfg.contact_email + ' 拉你进群。';
    }
  }

  /* ---- 启动 ---- */
  (async function boot() {
    try {
      const res = await fetch('/api/form-config');
      const cfg = await res.json();
      if (!cfg.ok) throw new Error('config failed');
      state.config = cfg;
      state.honeypotName = cfg.honeypot_field || 'website';

      // 蜜罐字段：名字由服务端下发，前端源码里不出现"这是蜜罐"的痕迹
      const trap = document.createElement('input');
      trap.type = 'text';
      trap.name = state.honeypotName;
      trap.id = state.honeypotName;
      trap.tabIndex = -1;
      trap.autocomplete = 'off';
      trap.setAttribute('aria-hidden', 'true');
      trap.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;opacity:0;pointer-events:none;';
      form.appendChild(trap);

      if (formFoot && cfg.contact_email) {
        formFoot.textContent = `验证码看不清或无法完成？发送邮件至 ${cfg.contact_email} 人工报名。`;
      }

      applyPhase(cfg);
      renderDeviceCard();
      await refreshCaptcha();
    } catch {
      showStatus('页面初始化失败，请刷新重试', 'err');
    }
    loadAnnouncements();
  })();

  loadQr(null);
  // 二维码兜底联系方式需要 config，稍后再补一次
  setTimeout(async () => {
    if (state.config) loadQr(state.config);
  }, 300);
})();

/* ========== 4. 友情链接 ========== */
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
