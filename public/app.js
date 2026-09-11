/* ============================================================
   实验室招新 —— 前端逻辑
   1. 雾状粒子背景  2. 滚动显现  3. 方向联动
   4. 阶段状态 / 公告 / 加群  5. 报名表（验证码 + 编辑码）
   6. 友情链接
   ============================================================ */

/* ========== 1. 背景：雾状粒子场 ==========
   目标：全屏可见的“雾感”。粒子大小不一、缓缓飘动、亮度呼吸，
   偶尔微弱连线形成云气般的层次。不做密集线框，避免“乱竖线”。
   粒子带一点整体方向漂移，像雾气在流动。 */
(() => {
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, dpr, parts = [], raf = null, t0 = 0;
  const N = 150;
  const dprMax = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    dpr = dprMax;
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  function makeParticle() {
    const big = Math.random() < 0.35;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: big ? (30 + Math.random() * 90) * dpr : (1 + Math.random() * 2.6) * dpr,
      big,
      vx: (Math.random() - 0.5) * 0.1 * dpr + (Math.random() < 0.5 ? -0.02 : 0.02) * dpr,
      vy: (Math.random() - 0.5) * 0.06 * dpr,
      tw: Math.random() * Math.PI * 2,
      twSpd: 0.004 + Math.random() * 0.01,
      hueShift: Math.random() < 0.5 ? 1 : -1,
    };
  }
  function seed() { parts = Array.from({ length: N }, makeParticle); }

  function drawFog() {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      if (!p.big) continue;
      p.x += p.vx * p.hueShift;
      p.y += p.vy;
      if (p.x < -p.r * 2) p.x = w + p.r;
      if (p.x > w + p.r * 2) p.x = -p.r;
      if (p.y < -p.r) p.y = h + p.r;
      if (p.y > h + p.r) p.y = -p.r;
      p.tw += p.twSpd;
      const a = 0.05 + (Math.sin(p.tw) * 0.5 + 0.5) * 0.05;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(244,244,244,${a})`);
      g.addColorStop(1, 'rgba(244,244,244,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of parts) {
      if (p.big) continue;
      p.x += p.vx * p.hueShift;
      p.y += p.vy;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;
      p.tw += p.twSpd * 2;
      const a = 0.25 + Math.sin(p.tw) * 0.2;
      ctx.fillStyle = `rgba(244,244,244,${Math.max(0.04, a)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    drawFog();
    raf = requestAnimationFrame(step);
  }

  window.addEventListener('resize', () => { resize(); seed(); });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resize(); seed();
    raf = requestAnimationFrame(step);
  }
})();

/* ========== 2. 滚动显现 ========== */
(() => {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  window.__revealIO = io;
})();

/* ========== 3. 方向联动 → 预填报名表 ========== */
(() => {
  const dirSelect = document.getElementById('direction');
  const applySec = document.getElementById('apply');
  document.querySelectorAll('.dir-row').forEach((row) => {
    row.addEventListener('click', () => {
      const dir = row.dataset.direction;
      if (!dir || !dirSelect) return;
      dirSelect.value = dir;
      applySec.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        const el = document.getElementById('student_id');
        if (el) el.focus();
      }, 700);
    });
  });
})();

/* ========== 4. 报名表：阶段 / 验证码 / 编辑码 ========== */
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

  /* ---- 本设备已提交记录（便利副本，不是安全控制） ---- */
  function loadSubs() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveSub(token, sidFull) {
    const list = loadSubs().filter((x) => x.sid_full !== sidFull);
    list.push({
      token, sid_full: sidFull,
      sid_masked: maskSid(sidFull),
      at: new Date().toISOString(),
    });
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
    title.textContent = '本设备曾提交过报名：';
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
    refreshCaptcha();
  });

  /* ---- 阶段状态 ---- */
  function applyPhase(cfg) {
    const open = cfg.registration && cfg.registration.open;
    const phase = cfg.phase;
    document.querySelectorAll('.tl-item').forEach((el) => {
      const p = el.dataset.phase;
      el.classList.remove('tl-active', 'tl-done');
      if (p === phase) el.classList.add('tl-active');
      if (phase === 'signup' && p === 'warmup') el.classList.add('tl-done');
      if (phase === 'review' && (p === 'warmup' || p === 'signup')) el.classList.add('tl-done');
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
    submitBtn.textContent = disabled ? '报名未开放' : (state.mode === 'edit' ? '保存修改 →' : '提交报名 →');
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
        await refreshCaptcha();
        return;
      }

      showStatus('✗ ' + (data.message || '提交失败，请重试'), 'err');
      captchaInput.value = '';
      await refreshCaptcha();
    } catch {
      showStatus('✗ 网络错误，请稍后重试', 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = state.mode === 'edit' ? '保存修改 →' : '提交报名 →';
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
      submitBtn.textContent = '保存修改 →';
      haveTokenWrap.hidden = true;
      showStatus('已载入你的报名信息，修改后填验证码提交。', 'ok');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      captchaInput.value = '';
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
    submitBtn.textContent = '提交报名 →';
  }
  editCancel.addEventListener('click', () => {
    exitEditMode();
    form.reset();
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
        p.textContent = '暂无公告';
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
      p.textContent = '公告加载失败';
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
      fallback.textContent = '招新群二维码暂未配置，请稍后再来，或通过下方邮箱联系我们。';
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

/* ========== 5. 友情链接 ========== */
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
        p.textContent = '暂无友情链接';
        list.appendChild(p);
        return;
      }
      data.links.forEach((link) => {
        const card = document.createElement('article');
        card.className = 'link-card reveal';
        card.tabIndex = 0;

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
        openBtn.style.pointerEvents = 'none';
        openBtn.style.opacity = '0.5';
        openBtn.tabIndex = -1;

        card.append(nameRow, desc, openBtn);

        const toggle = () => {
          const isOpen = card.classList.toggle('open');
          desc.style.pointerEvents = isOpen ? 'auto' : 'none';
          openBtn.style.pointerEvents = isOpen ? 'auto' : 'none';
          openBtn.style.opacity = isOpen ? '1' : '0.5';
          openBtn.tabIndex = isOpen ? 0 : -1;
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
      p.textContent = '友情链接加载失败';
      list.appendChild(p);
    });
})();
