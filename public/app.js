/* ============================================================
   实验室招新 —— 前端逻辑
   1. 雾状粒子背景  2. 方向联动  3. 表单(照片预览)  4. 友链
   ============================================================ */

/* ========== 1. 背景：雾状粒子场 ==========
   目标：全屏可见的“雾感”。粒子大小不一、缓缓飘动、亮度呼吸，
   偶尔微弱连线形成云气般的层次。不做密集线框，避免“乱竖线”。
   粒子带一点整体方向漂移，像雾气在流动。 */
(() => {
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  let w, h, dpr, parts = [], raf = null, t0 = 0;
  const N = 150;                 // 粒子数（含大虚点营造雾团感）
  const dprMax = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    dpr = dprMax;
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  /* 粒子：径向渐变画大虚圆，中心亮边缘散 —— 雾团 */
  function makeParticle() {
    const big = Math.random() < 0.35;           // 35% 是大雾团
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: big ? (30 + Math.random() * 90) * dpr : (1 + Math.random() * 2.6) * dpr,
      big,
      vx: (Math.random() - 0.5) * 0.1 * dpr + (Math.random() < 0.5 ? -0.02 : 0.02) * dpr,
      vy: (Math.random() - 0.5) * 0.06 * dpr,
      tw: Math.random() * Math.PI * 2,           // 呼吸相位
      twSpd: 0.004 + Math.random() * 0.01,
      hueShift: Math.random() < 0.5 ? 1 : -1,    // 少数往相反方向漂，形成层次
    };
  }
  function seed() {
    parts = Array.from({ length: N }, makeParticle);
  }

  function drawFog(t) {
    ctx.clearRect(0, 0, w, h);

    // 先画大雾团（半透明扩散圆，产生弥散光感）
    for (const p of parts) {
      if (!p.big) continue;
      p.x += p.vx * p.hueShift;
      p.y += p.vy;
      if (p.x < -p.r * 2) p.x = w + p.r;
      if (p.x > w + p.r * 2) p.x = -p.r;
      if (p.y < -p.r) p.y = h + p.r;
      if (p.y > h + p.r) p.y = -p.r;
      p.tw += p.twSpd;
      const a = 0.05 + (Math.sin(p.tw) * 0.5 + 0.5) * 0.05;  // 呼吸 0.05~0.10
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(244,244,244,${a})`);
      g.addColorStop(1, 'rgba(244,244,244,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 小亮粒
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

  function step(t) {
    if (!t0) t0 = t;
    drawFog(t);
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
})();

/* ========== 3. 方向联动 -> 预填报名表 ========== */
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
        const name = document.getElementById('name');
        if (name) name.focus();
      }, 700);
    });
  });
})();

/* ========== 4. 报名表单：照片必填 + 预览 + 提交 ========== */
(() => {
  const form = document.getElementById('app-form');
  const status = document.getElementById('form-status');
  const drop = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo');
  const hint = document.getElementById('photo-drop-hint');
  const previewBox = document.getElementById('photo-preview');
  let currentPhoto = null;   // File

  /* 照片拖放 */
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setPhoto(f);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) setPhoto(fileInput.files[0]);
  });

  function setPhoto(file) {
    if (!/^image\//.test(file.type)) {
      return showStatus('照片必须是图片文件（jpg/png 等）', 'err');
    }
    if (file.size > 5 * 1024 * 1024) {
      return showStatus('照片超过 5MB，请压缩后重试', 'err');
    }
    currentPhoto = file;
    // 预览
    previewBox.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = '照片预览';
    previewBox.appendChild(img);
    const meta = document.createElement('div');
    meta.className = 'photo-meta';
    meta.textContent = file.name;
    previewBox.appendChild(meta);
    previewBox.hidden = false;
    hint.textContent = '✓ 已选择 —— 想换一张就再点一次';
    hint.style.color = '#fff';
    showStatus('');
  }

  function showStatus(msg, cls) {
    status.className = 'form-status ' + (cls || '');
    status.textContent = msg;
  }

  /* 提交 */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showStatus('');

    const name = form.name.value.trim();
    const major = form.major.value.trim();
    const direction = form.direction.value;
    const intro = form.intro.value.trim();

    if (!name) return showStatus('✗ 请填写姓名', 'err');
    if (!major) return showStatus('✗ 请填写专业', 'err');
    if (!direction) return showStatus('✗ 请选择方向', 'err');
    if (!currentPhoto) return showStatus('✗ 请上传照片（必填）', 'err');
    if (!intro) return showStatus('✗ 请填写个人简介', 'err');

    const btn = form.querySelector('.submit');
    btn.disabled = true;
    btn.textContent = '提交中…';

    const fd = new FormData();
    fd.append('name', name);
    fd.append('major', major);
    fd.append('direction', direction);
    fd.append('intro', intro);
    fd.append('learned', (form.learned.value || '').trim());
    fd.append('ai_views', (form.ai_views.value || '').trim());
    fd.append('photo', currentPhoto);

    try {
      const res = await fetch('/api/applications', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        showStatus('✓ 报名已提交，我们会尽快联系你', 'ok');
        form.reset();
        currentPhoto = null;
        previewBox.innerHTML = '';
        previewBox.hidden = true;
        hint.textContent = '⊞ 点击选择照片';
        hint.style.color = '';
      } else {
        showStatus('✗ ' + (data.error || '提交失败，请重试'), 'err');
      }
    } catch (err) {
      showStatus('✗ 网络错误，请稍后重试', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交报名 →';
    }
  });
})();

/* ========== 5. 友情链接 ========== */
(() => {
  const list = document.getElementById('link-list');
  if (!list) return;

  fetch('/api/links')
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok || !data.links.length) {
        list.innerHTML = '<p class="hint">暂无友情链接</p>';
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
      list.innerHTML = '<p class="hint">友情链接加载失败</p>';
    });
})();
