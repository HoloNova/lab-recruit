/* ============================================================
   代码场域引擎

   一件事：把一个文档，用「像人一样」的节奏画到全屏图层上。

   两种渲染面（这是四个方向不塌成同一种运动的关键）：
     editor    三档：行号、逐字打字、缩进瞬现、打错删除重打
     terminal  一档：无行号、工具调用整块出现、正文流式、思考时长时间停顿

   三种互不相同的运动：
     打字   一个字一个字，有连击节奏和停顿
     流式   AI 正文按 chunk 追加（像 token 流）
     追加   工具调用 / 日志整块跳出

   为什么好看又便宜：
     建 DOM 时一次性把整篇文档铺好，未打到的 token 只是 opacity:0。
     版面从一开始就是最终形状 → 打字过程中零重排、零位移。
     每次 tick 只改一个 span 的 textContent。
   ============================================================ */
(() => {
  'use strict';

  const DATA  = window.CODEFIELD_DATA;
  const ORDER = window.CODEFIELD_ORDER;
  if (!DATA || !ORDER) return;

  /* 场域根节点。静态对照表那种页面没有它 —— 那时只导出渲染函数。
     注意：不能因为缺 root 就 return，否则 window.codefield 根本不会存在，
     而 HTML 的 id 会让它静默变成同名元素，调用方拿到一个没有方法的对象。 */
  const root  = document.getElementById('cf-root');
  const elBody = root && root.querySelector('.cf-body');
  const elFile = root && root.querySelector('.cf-file');
  const elLang = root && root.querySelector('.cf-lang');
  // 徽标挂在 .cf 外面（原因见 HTML 注释），所以从 document 找
  const elHold = document.querySelector('.cf-hold');
  // ⚠ 也要从 document 找。徽标整个搬到 .cf 外面了，
  //    这里如果还用 root.querySelector，elHoldText 会是 null，
  //    徽标只会显示写死的「已暂停」，看不出是因为什么停的（实测踩到）。
  const elHoldText = document.querySelector('.cf-hold-text');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ============================================================
     节奏参数 —— 全部集中在这里，想改手感只改这一块

     之前的问题：速度是「固定的一格一格」，看着像机器。
     现在用「连击」模型 —— 人手是敲一串、停一下、再敲一串：
       连击 5–14 个字（13–21ms/字）  →  停一下（140–470ms，偏短的居多）
     这个结构本身就让速度看起来不均匀，而不是靠加随机数。

     停顿用偏斜分布：大多数短，偶尔长。均匀随机会显得假。
     ============================================================ */
  const PACE = {
    burst:    [5, 15],      // 一串敲几个字
    fast:     [16, 26],     // 连击时的击键间隔。下限卡在 16ms 左右：
                            //   再快就是一帧一个字（60fps=16.7ms），看不出是「一个一个」在打
    rest:     [140, 470],   // 串与串之间停顿（偏斜：短的多）
    restP:    2.1,          // 偏斜指数，越大越偏短
    dazeP:    0.035,        // 偶尔会「走神」一下 —— 概率很低，但少了就不像人
    daze:     [900, 2600],
    speedUp:  0.55,

    punct:    [90, 260],    // 标点后
    line:     [220, 640],   // 换行后

    corr: {
      // 每个字出错的概率。1/60 ≈ 1.7%，接近真人打字的出错率；
      // 一个 1000 字的文件约错 17 次，每次含「停→删→重打」约 1.2s。
      p:      1 / 60,
      cool:   28,           // 错完至少隔这么多字才可能再错
      wordP:  0.45,         // 45% 是多字错（整词打错），其余是单字
      word:   [2, 5],       // 多字错的字符数
      alarm:  [360, 900],   // 意识到打错 → 停这么久（这一拍是「人味」的关键）
      del:    [40, 76],     // 退格速度
      after:  [70, 200],    // 退完再打对之前的小停
    },

    installLine: [46, 190], // 日志行之间的间隔
    installRest: [180, 640],// 一批日志推完后的停顿
    installBatch:[2, 6],    // 一批连推几行

    /* 整行重写 —— 和「打错一个字」是两回事：
         打错是手滑，错的是一两个字符；
         重写是改主意，错的是整行的写法，所以停得更久、删得干净。
       只对 doc.rev 里标了新版本的行生效，一行最多一次。 */
    rewrite: {
      p:     0.62,          // 标了 rev 的行有多少比例真的重写
      hold:  [700, 2100],   // 打完停这么久才决定改
      sel:   [220, 420],    // 全选高亮停一拍
      gap:   [420, 900],    // 删干净后想一下再开始打
    },

    holdDone: 3600,         // 全部打完之后的停留
  };

  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const skew = (r, p) => r[0] + Math.pow(Math.random(), p) * (r[1] - r[0]);
  const randInt = (r) => r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));

  // 错字概率覆盖：给了数字就直接用它当「每字出错概率」，没给就用 PACE 里的默认值。
  // 为什么不乘：之前写成「系数」是错的 —— 设成 1 得到的是 0.0105 而不是 1，
  // 钩子就变成了一个不能把关机/拉满的摆设，回归测试也就没法写。
  const corrP = () => {
    const o = window.CODEFIELD_TYPO_P;
    return typeof o === 'number' ? o : PACE.corr.p;
  };

  // 同类钩子：整行重写的概率。0 = 关掉，1 = 标了的行全重写。
  const rewriteP = () => {
    const o = window.CODEFIELD_REWRITE_P;
    return typeof o === 'number' ? o : PACE.rewrite.p;
  };

  /* ================= 2. 分词 =================
     目标不是语法分析，是「看起来像 VSCode」。
     VSCode Dark+ 里声明关键字是蓝的、控制流是紫的 —— 照它的分法才像。
     ============================================ */

  const KW = {
    java:   'class interface enum extends implements import package public private protected ' +
            'static final abstract void int long double float boolean char byte short ' +
            'this super new var record sealed permits yield true false null instanceof',
    c:      'const volatile static extern inline register signed unsigned sizeof struct union ' +
            'typedef enum void char int long short float double NULL true false __NOP',
    python: 'def class import from as pass lambda global nonlocal yield async await with ' +
            'True False None self',
  };
  const CT = {
    java:   'if else for while do switch case default break continue return throw throws try catch finally synchronized assert',
    c:      'if else for while do switch case default break continue return goto',
    python: 'if elif else for while in is not and or return break continue try except finally raise del assert match case',
  };
  const TY = {
    java:   'String Integer Long Double Float Boolean Object List Map Set Optional ResponseEntity Token ' +
            'LoginRequest Form RequestBody Valid RestController RequestMapping PostMapping GetMapping ' +
            'PathVariable Autowired Service Repository Entity Id GeneratedValue Override Exception ' +
            'HttpStatus User TokenService UserRepository AuthController',
    c:      'uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t size_t ssize_t intptr_t uintptr_t bool FILE va_list',
    python: 'int str bytes float bool list tuple set dict complex object type Counter',
  };
  const mk = (s) => new Set(s.split(/\s+/).filter(Boolean));
  const KWset = {}, CTset = {}, TYset = {};
  for (const l of ['java', 'c', 'python']) { KWset[l] = mk(KW[l]); CTset[l] = mk(CT[l]); TYset[l] = mk(TY[l]); }

  function tokenize(code, lang) {
    const kw = KWset[lang], ct = CTset[lang], ty = TYset[lang];
    const isPy = lang === 'python';
    const lines = [[]];
    const out = (c, s) => { if (s) lines[lines.length - 1].push({ c, s }); };

    let i = 0;
    const N = code.length;
    while (i < N) {
      const rest = code.slice(i);
      let m;

      if (isPy && rest[0] === '#') { m = /^#[^\n]*/.exec(rest); out('cm', m[0]); i += m[0].length; continue; }
      if (!isPy && rest.startsWith('//')) { m = /^\/\/[^\n]*/.exec(rest); out('cm', m[0]); i += m[0].length; continue; }
      if (!isPy && rest.startsWith('/*')) { m = /^\/\*[\s\S]*?\*\//.exec(rest); out('cm', m[0]); i += m[0].length; continue; }

      if (lang === 'c' && /^#[ \t]*(include|define|ifdef|ifndef|endif|pragma)\b/.test(rest)) {
        m = /^#[ \t]*\w+/.exec(rest); out('pp', m[0]); i += m[0].length; continue;
      }

      const q0 = rest[0];
      if (q0 === '"' || q0 === "'" || q0 === '`') {
        m = new RegExp('^' + (q0 === '`' ? '`(?:\\\\.|[^`\\\\])*`'
                                          : q0 + '(?:\\\\.|[^' + q0 + '\\\\])*' + q0)).exec(rest);
        if (m) { out('st', m[0]); i += m[0].length; continue; }
      }

      if (lang === 'java' && q0 === '@') { m = /^@[A-Za-z_]\w*/.exec(rest); out('an', m[0]); i += m[0].length; continue; }

      if (q0 >= '0' && q0 <= '9') {
        m = /^(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?)[uUlLfFdD]*/.exec(rest);
        out('nu', m[0]); i += m[0].length; continue;
      }

      if (/[A-Za-z_]/.test(q0)) {
        m = /^[A-Za-z_]\w*/.exec(rest);
        const w = m[0];
        let cls = 'va';
        if (ct.has(w)) cls = 'ct';
        else if (kw.has(w)) cls = 'kw';
        else if (ty.has(w)) cls = 'ty';
        else if (/^[A-Z]/.test(w)) cls = 'ty';
        else if (/^[ \t]*\(/.test(code.slice(i + w.length))) cls = 'fn';
        out(cls, w); i += w.length; continue;
      }

      if (q0 === '\n') { i++; lines.push([]); continue; }

      if (q0 === ' ' || q0 === '\t') { m = /^[ \t]+/.exec(rest); out('ws', m[0]); i += m[0].length; continue; }

      // ⚠ 必须排除引号/#/@// ，否则 `("` 这种连续符号会把后面的引号一起吃掉，
      //    导致整个文件的字符串高亮错位（实测踩过）。
      m = /^[^\sA-Za-z_0-9"'`#\/@]+/.exec(rest);
      if (!m) { out('op', rest[0]); i += 1; continue; }
      out('op', m[0]); i += m[0].length;
    }
    return lines;
  }

  /* ================= 3. 运行时状态 ================= */

  const S = {
    id: null, mode: null,
    autoplay: true,
    step: 0, timer: null, spinner: null,
    curTok: null, curLine: null,
    reasons: new Set(),      // 'input' | 'manual' | 'hidden' | 'reduced'
    pausedAt: 0, pausedTotal: 0,
  };

  const isPaused = () => S.reasons.size > 0;

  /**
   * 「动画时钟」—— 暂停期间不走。要显示秒数的地方都用它，
   * 否则暂停 30 秒回来，思考行会直接跳到 30s。
   */
  function clock() {
    const now = Date.now();
    const live = isPaused() && S.pausedAt ? now - S.pausedAt : 0;
    return now - S.pausedTotal - live;
  }

  /**
   * 排一个延时。暂停时不取消它 —— 原地等，恢复后从原处接着跑。
   *
   * 为什么不让暂停去取消定时器：定时器承载的是「这个效果演到哪了」。
   * 取消掉就只能重演，用户滚一下页背景就从头开始，看着就是坏的
   *（之前就是这么错的：滚回顶部会重新拉一遍依赖）。
   */
  function later(ms, fn) {
    const my = S.step;
    S.timer = setTimeout(() => {
      if (my !== S.step) return;
      if (isPaused()) return later(220, fn);
      fn();
    }, ms);
  }

  function bump() {
    clearTimeout(S.timer); S.timer = null;
    if (S.spinner) { clearInterval(S.spinner); S.spinner = null; }
    S.step++;
  }

  function resetShift() {
    if (elBody) elBody.scrollTop = 0;
  }

  /* ---------- 暂停理由 ---------- */

  const HOLD_TEXT = {
    input:   '正在填写表单',
    manual:  '手动暂停',
    hidden:  '页面切到后台',
    reduced: '系统开了「减少动效」',
  };
  const HOLD_ORDER = ['input', 'manual', 'hidden', 'reduced'];

  function updateHold() {
    if (!elHold) return;
    const hit = HOLD_ORDER.find((r) => S.reasons.has(r));
    if (hit) {
      if (elHoldText) elHoldText.textContent = '已暂停 · ' + HOLD_TEXT[hit];
      elHold.hidden = false;
      root.setAttribute('data-hold', hit);
    } else {
      elHold.hidden = true;
      root.removeAttribute('data-hold');
    }
  }

  function setReason(r, on) {
    const was = isPaused();
    if (on) S.reasons.add(r); else S.reasons.delete(r);
    const now = isPaused();
    if (now === was) { updateHold(); return; }
    if (now) S.pausedAt = Date.now();
    else if (S.pausedAt) S.pausedTotal += Date.now() - S.pausedAt;
    updateHold();
  }

  /* ================= 4. 编辑器档 ================= */

  let T = null;

  /** 把一行文本建成 DOM 并插进 lineEl。整行重写时也用它重建。 */
  function fillLine(lineEl, text, lang) {
    lineEl.textContent = '';
    const refs = [];
    for (const t of (tokenize(text, lang)[0] || [])) {
      const span = document.createElement('span');
      span.className = 'cf-t k-' + t.c + ' is-hid';
      span.textContent = t.s;          // 文本先铺好 → 版面即最终形状
      lineEl.appendChild(span);
      refs.push({ el: span, s: t.s, c: t.c });
    }
    return refs;
  }

  function buildEditor(doc) {
    elBody.className = 'cf-body is-editor';
    elBody.textContent = '';
    const flat = [];
    for (const toks of tokenize(doc.code, doc.lang)) {
      const lineEl = document.createElement('div');
      lineEl.className = 'cf-line';
      const text = toks.map((t) => t.s).join('');
      if (!text) { elBody.appendChild(lineEl); flat.push({ line: lineEl, toks: null, text: '', rev: null }); continue; }
      const refs = [];
      for (const t of toks) {
        const span = document.createElement('span');
        span.className = 'cf-t k-' + t.c + ' is-hid';
        span.textContent = t.s;
        lineEl.appendChild(span);
        refs.push({ el: span, s: t.s, c: t.c });
      }
      elBody.appendChild(lineEl);
      // rev 用「原文」做键，所以这里用拼回来的行文本去查
      flat.push({ line: lineEl, toks: refs, text, rev: (doc.rev && doc.rev[text]) || null, revUsed: false });
    }
    return flat;
  }

  function setCursor(tokEl, lineEl) {
    if (S.curTok !== tokEl) {
      if (S.curTok) S.curTok.classList.remove('is-cur');
      S.curTok = tokEl || null;
      if (tokEl) { tokEl.classList.remove('is-hid'); tokEl.classList.add('is-cur'); }
    }
    if (lineEl && S.curLine !== lineEl) {
      if (S.curLine) S.curLine.classList.remove('is-cur');
      S.curLine = lineEl;
      lineEl.classList.add('is-cur', 'is-started');
      followCursor(lineEl);
    }
  }

  /**
   * 跟随光标。代码带只有一小块，所以内容必须自己往上走。
   *
   * 两个约束：
   *   · 活动行保持在可滚动区的上部 — 底边要留给渐隐区（代码在那儿慢慢融进黑）
   *   · 只在真的越界时才动 scrollTop —— 每行都写会让滚动看着在抽
   */
  function followCursor(lineEl) {
    if (!lineEl || !elBody) return;
    const H = elBody.clientHeight;
    if (!H) return;
    const top = lineEl.offsetTop - elBody.scrollTop;
    const bottom = top + lineEl.offsetHeight;
    const hi = H * 0.92;
    if (bottom > hi) { elBody.scrollTop += Math.ceil(bottom - hi); return; }
    const lo = H * 0.18;
    if (top < lo && elBody.scrollTop > 0) elBody.scrollTop = Math.max(0, elBody.scrollTop - Math.ceil(lo - top));
  }

  /**
   * 终端 / 日志的跟随：新行往下推，超出后往上滚。
   *
   * 之前这里靠 CSS 的 justify-content:flex-end 做底对齐，
   * 后果是第一行出现在带子底部、然后往上长 —— 「从下往上」的观感。
   * 现在是顶对齐 + 往下长，超了才滚，和真终端一致。
   */
  function followBottom() {
    if (!elBody) return;
    const H = elBody.clientHeight;
    const last = elBody.lastElementChild;
    if (!H || !last) return;
    const want = last.offsetTop + last.offsetHeight - H * 0.92;
    if (want > elBody.scrollTop) elBody.scrollTop = Math.ceil(want);
  }

  /** 连击节奏：敲一串 → 停一下 → 再敲一串 */
  function keyDelay() {
    if (T.burst > 0) {
      T.burst--;
      // 连击尾部略微加速，像一串敲顺了
      const fast = Math.random() < PACE.speedUp;
      return fast ? rand([PACE.fast[0], PACE.fast[0] + 5]) : rand(PACE.fast);
    }
    T.burst = randInt(PACE.burst);
    // 偶尔走神 —— 停得比平时久，这是「像人」里最难靠随机数模拟的一拍
    if (Math.random() < PACE.dazeP) return rand(PACE.daze);
    return skew(PACE.rest, PACE.restP);
  }

  function editorTick() {
    if (!T) return;
    const L = T.flat[T.li];
    if (!L) return finishEditor();
    if (!L.toks) return editorNextLine();
    if (T.ti >= L.toks.length) return editorNextLine();

    const tk = L.toks[T.ti];
    setCursor(tk.el, L.line);

    // 行首缩进：编辑器自动缩进，人不会一个格一个格敲空格。这个细节最像真人。
    if (T.ch === 0 && tk.c === 'ws') { tk.el.textContent = tk.s; return afterToken(L); }

    // 打错 → 停 → 删 → 重打
    if (T.ch > 0 && T.ch < tk.s.length && rollCorrection()) return doCorrection(L, tk);

    T.ch++;
    onChar(L, tk);
  }

  function onChar(L, tk) {
    tk.el.textContent = tk.s.slice(0, T.ch);
    if (T.ch >= tk.s.length) return afterToken(L);
    later(keyDelay(), editorTick);
  }

  /** 一个 token 打完 —— 标点后要停顿，那是人换气的地方 */
  function afterToken(L) {
    const done = L.toks[T.ti].s;
    T.ti++; T.ch = 0;
    let d = keyDelay();
    if (/[;:]$/.test(done)) d += rand(PACE.punct);
    else if (/[{},]$/.test(done)) d += rand(PACE.punct) * 0.7;
    if (T.ti >= L.toks.length) return later(d + rand(PACE.line), editorTick);
    later(d, editorTick);
  }

  function editorNextLine() {
    const L = T.flat[T.li];

    /* 整行重写：这一行刚打完，而它标了「改主意」的新版本。
       注意只能在「这行真的有字且已打完」时触发 —— 空行和入口调用不行。 */
    if (L && L.toks && L.toks.length && L.rev && !L.revUsed && Math.random() < rewriteP()) {
      L.revUsed = true;
      return doRewrite(L);
    }

    T.li++; T.ti = 0; T.ch = 0; T.burst = 0;
    if (T.li >= T.flat.length) return finishEditor();
    const N = T.flat[T.li];
    if (N && N.line) setCursor(null, N.line);
    if (N && !N.toks) return later(rand(PACE.line) * 0.5, editorTick);
    later(rand(PACE.line), editorTick);
  }

  /**
   * 整行重写：打完一行 → 停一下 → 全选这一行 → 删掉 → 打成新版本。
   *
   * 为什么重写后的内容必须是**另一个版本**而不是同一行再打一遍：
   * 同一行重打看超来像卡住/循环，而换成 `% 4u` → `& 3u` 这种真的改进，
   * 观众能看出「他改主意了」。所以重写的内容来自 doc.rev。
   */
  function doRewrite(L) {
    // 先把光标收掉：这一行的字马上要被全选，光标留在上面很怪
    if (S.curTok) { S.curTok.classList.remove('is-cur'); S.curTok = null; }
    later(rand(PACE.rewrite.hold), () => {
      L.line.classList.add('is-selected');            // VSCode 选区蓝
      later(rand(PACE.rewrite.sel), () => {
        L.line.classList.remove('is-selected');
        L.line.textContent = '';
        later(rand(PACE.rewrite.gap), () => {
          L.toks = fillLine(L.line, L.rev, T.lang);
          L.text = L.rev;
          L.rev = null;
          T.ti = 0; T.ch = 0; T.burst = randInt(PACE.burst); T.cool = 0;
          L.line.classList.add('is-started');
          later(140, editorTick);
        });
      });
    });
  }

  function finishEditor() {
    if (S.curTok) { S.curTok.classList.remove('is-cur'); S.curTok = null; }
    if (S.curLine) { S.curLine.classList.remove('is-cur'); S.curLine = null; }
    later(PACE.holdDone, () => { if (S.autoplay) nextDoc(); });
  }

  /* ---------- 打错 → 删除 → 重打 ---------- */

  function rollCorrection() {
    if (T.cool > 0) { T.cool--; return false; }
    if (Math.random() >= corrP()) return false;
    T.cool = PACE.corr.cool;
    return true;
  }

  /**
   * 两种错法：
   *   单字错  敲错一个字符   → 停 → 退一格 → 重打
   *   整词错  敲错 2–5 个字符 → 停更久 → 逐字退掉 → 重打
   * 错的字符会挂上 .is-typo（红色波浪下划线，和 VSCode 的错误提示同款），
   * 所以「打错了」这件事在屏幕上是看得见的，不是悄悄改掉。
   */
  function doCorrection(L, tk) {
    const before = tk.s.slice(0, T.ch);
    const wordy = Math.random() < PACE.corr.wordP;
    const n = wordy ? randInt(PACE.corr.word) : 1;
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let wrong = '';
    for (let k = 0; k < n; k++) wrong += alpha[(Math.random() * alpha.length) | 0];

    tk.el.classList.add('is-typo');

    // 1) 把错的字符敲进去
    let i = 0;
    (function typeWrong() {
      i++;
      tk.el.textContent = before + wrong.slice(0, i);
      if (i < n) return later(rand(PACE.fast) + 6, typeWrong);
      // 2) 意识到打错了 —— 这一拍是关键，太快就不像人
      later(rand(PACE.corr.alarm), erase);
    })();

    // 3) 逐字退掉
    function erase() {
      let j = n;
      (function cut() {
        j--;
        tk.el.textContent = before + wrong.slice(0, j);
        if (j > 0) return later(rand(PACE.corr.del), cut);
        tk.el.classList.remove('is-typo');
        // 4) 退干净了，停一下再重打
        later(rand(PACE.corr.after), () => {
          T.burst = randInt(PACE.burst);
          editorTick();
        });
      })();
    }
  }

  function startEditor(doc) {
    const flat = buildEditor(doc);
    resetShift();
    T = { flat, lang: doc.lang, li: 0, ti: 0, ch: 0, burst: randInt(PACE.burst), cool: 0 };
    while (T.li < flat.length && !flat[T.li].toks) { flat[T.li].line.classList.add('is-started'); T.li++; }
    if (T.li >= flat.length) return finishEditor();
    later(240, editorTick);
  }

  /* ================= 5. 终端档 ================= */

  function termClass(t) {
    if (/^\$\s/.test(t)) return 't-cmd';
    if (/^>\s?/.test(t)) return 't-user';
    if (/^⏺/.test(t)) return 't-say';
    if (/^\s*⎿/.test(t)) return 't-note';
    if (/^\s*\d+\s*\+/.test(t)) return 't-add';
    if (/^\s*\d+\s*[-−]\s/.test(t)) return 't-del';
    if (/^\s*\d+\s{2,}\S/.test(t)) return 't-code';
    if (/^[╭│╰]/.test(t)) return 't-box';
    if (/^[✻✳✢✽]/.test(t)) return 't-think';
    if (/^(Need|Ok to|added|found|npm|1 package|  run )/.test(t)) return 't-log';
    if (/^(Hit|Get:|Fetched|Selecting|Unpacking|Setting|Processing)/.test(t)) return 't-log';
    if (/^\[INFO\]/.test(t)) return 't-log';
    if (/^(Collecting|  Downloading|Installing|Successfully|  Building|  Created|  Attempting|    Found|    Uninstalling|      Successfully|Building wheels)/.test(t)) return 't-log';
    if (/^\s{2}(CC|LD|OBJCOPY|SIZE|text|\d)/.test(t)) return 't-build';
    if (/^\$\s?make/.test(t)) return 't-cmd';
    return 't-plain';
  }

  function pushLineTo(body, text, cls) {
    const d = document.createElement('div');
    d.className = 'cf-tline ' + (cls || termClass(text));
    d.textContent = text;
    if (body.childElementCount > 240) body.removeChild(body.firstElementChild);
    body.appendChild(d);
    // 只有现场才需要跟随滚动（静态渲染用的是普通文档流）
    if (body === elBody) followBottom();
    return d;
  }
  const pushLine = (text, cls) => pushLineTo(elBody, text, cls);

  const SPIN = ['✻', '✳', '✢', '✽'];

  /**
   * 思考：长时间转圈 + 秒数递增。
   * 这是终端档和编辑器档最大的区别 —— 编辑器档里「打字」是主角，
   * 终端档里「等」才是主角。工具跑一会儿、模型想一会儿，都是真实的停顿。
   */
  function startThink(spec, done) {
    const el = pushLine('', 't-think');
    const label = spec.label || 'Thinking';
    const t0 = clock();          // 动画时钟：暂停期间不走
    let k = 0;
    if (S.spinner) clearInterval(S.spinner);
    const paint = () => {
      const sec = Math.max(0, Math.round((clock() - t0) / 1000));
      el.textContent = SPIN[k] + ' ' + label + '… (' + sec + 's · ↑ ' +
                       (0.4 + sec * 0.31).toFixed(1) + 'k tokens · esc to interrupt)';
    };
    paint();
    S.spinner = setInterval(() => { k = (k + 1) % SPIN.length; paint(); }, 130);
    later(spec.ms || 6000, () => {
      if (S.spinner) { clearInterval(S.spinner); S.spinner = null; }
      paint();
      done();
    });
  }

  /** 流式：正文按 chunk 追加，像 token 一个个吐出来 */
  function startStream(spec, done) {
    const el = pushLine('', 't-say');
    const text = spec.text;
    const per = spec.per || 32;
    let i = 0;
    (function ch() {
      i += 1 + (Math.random() < 0.34 ? 1 : 0);     // 1–2 个字符一块
      el.textContent = text.slice(0, i);
      if (i >= text.length) return later(180, done);
      later(per + Math.random() * 46, ch);
    })();
  }

  function startTerminal(doc) {
    elBody.className = 'cf-body is-terminal';
    elBody.textContent = '';
    const scr = doc.script || [];
    let i = 0;

    function step() {
      if (i >= scr.length) {
        if (S.spinner) { clearInterval(S.spinner); S.spinner = null; }
        return later(PACE.holdDone + 1400, () => { if (S.autoplay) nextDoc(); });
      }
      const s = scr[i++];
      switch (s.k) {
        case 'wait': return later(s.ms || 400, step);

        case 'think':
          return startThink(s, step);

        case 'stream':
          return startStream(s, step);

        case 'type': {                     // 提示符后是人打的 → 逐字
          // 用 termClass 分类，不能写死 t-user：`$ claude` 是命令，`> …` 才是提问
          const el = pushLine('', termClass(s.text));
          let n = 0;
          const per = s.speed || 60;
          (function ch() {
            el.textContent = s.text.slice(0, ++n);
            if (n >= s.text.length) return later(150, step);
            later(per + Math.random() * 52, ch);
          })();
          return;
        }

        case 'box': for (const l of s.lines) pushLine(l, 't-box'); return later(90, step);
        case 'say':  pushLine(s.text, 't-say');  return later(250, step);
        case 'note': pushLine(s.text, 't-note'); return later(230, step);
        case 'code': pushLine(s.text, 't-code'); return later(270, step);
        case 'del':  pushLine(s.text, 't-del');  return later(310, step);
        case 'add':  pushLine(s.text, 't-add');  return later(310, step);

        case 'spin': {
          const el = pushLine(s.text + ' ', 't-think');
          const tail = s.text.replace(/^[✻✳✢✽]\s*/, '');
          let k = 0;
          if (S.spinner) clearInterval(S.spinner);
          S.spinner = setInterval(() => { k = (k + 1) % SPIN.length; el.textContent = SPIN[k] + ' ' + tail + '… (esc to interrupt)'; }, 130);
          return later(150, step);
        }
        default: return later(200, step);
      }
    }
    later(280, step);
  }

  /* ================= 6. 过渡：拉取依赖（各用各的生态） ================= */

  /** 进度条。固定总宽，所以右边的标签不会随着填充左右跳动。 */
  function fillBar(spec, done) {
    const total = spec.chars || 34;
    const el = document.createElement('div');
    el.className = 'cf-tline t-bar';
    const on = document.createElement('span'); on.className = 'bar-on';
    const off = document.createElement('span'); off.className = 'bar-off';
    const lab = document.createElement('span'); lab.className = 'bar-lab';
    lab.textContent = ' ' + (spec.label || '');
    el.appendChild(on); el.appendChild(off); el.appendChild(lab);
    if (elBody.childElementCount > 240) elBody.removeChild(elBody.firstElementChild);
    elBody.appendChild(el);
    off.textContent = '━'.repeat(total);
    followBottom();

    let i = 0;
    const per = (spec.ms || 2400) / total;
    (function grow() {
      i++;
      on.textContent = '━'.repeat(i);
      off.textContent = '━'.repeat(total - i);
      followBottom();          // fillBar 只用于现场，静态版是 staticInstall
      if (i < total) return later(per + Math.random() * 26, grow);
      later(150, done);
    })();
  }

  function makeInstallLine(item) {
    const text = typeof item === 'string' ? item : (item.t || '');
    return pushLine(text, termClass(text));
  }

  /**
   * 日志是一阵一阵滚的：连推几行 → 停一下 → 再推。
   * 均匀地一行一行等间隔输出，是「固定速度」观感的主要来源。
   */
  function startInstall(lines, done) {
    elBody.className = 'cf-body is-install';
    elBody.textContent = '';
    let i = 0, run = 0, runLen = randInt(PACE.installBatch);
    (function push() {
      if (i >= lines.length) return later(300, done);
      const item = lines[i++];
      if (item && typeof item === 'object' && item.bar) return fillBar(item, () => later(80, push));

      makeInstallLine(item);
      if (++run >= runLen) {
        run = 0; runLen = randInt(PACE.installBatch);
        return later(skew(PACE.installRest, 1.6), push);
      }
      later(rand(PACE.installLine), push);
    })();
  }

  /* ================= 7. 换档编排 ================= */

  /* 真实开发是：关掉这个项目 → 装依赖 → 打开新文件。
     所以顺序是 [选中全部并删除] → [拉取依赖] → [新文件打字 / 终端开始]。 */
  function switchTo(id) {
    const doc = DATA[id];
    if (!doc) return;
    bump();
    S.id = id;
    S.mode = doc.mode;
    root.dataset.dir = doc.dir;
    root.dataset.mode = doc.mode;
    if (elFile) elFile.textContent = doc.file;
    if (elLang) elLang.textContent = doc.lang === 'terminal' ? 'bash' : doc.lang;

    const enter = () => {
      if (reduce.matches) return staticRender(doc);
      if (doc.mode === 'terminal') startTerminal(doc);
      else startEditor(doc);
    };

    const hadCode = elBody.classList.contains('is-editor') && elBody.childElementCount > 0;

    // 终端没法「全选删除」，直接清屏
    if (!hadCode || doc.mode === 'terminal') {
      elBody.textContent = '';
      elBody.className = 'cf-body';
      if (doc.install && !reduce.matches) return startInstall(doc.install, enter);
      return enter();
    }

    // 全选（VSCode 选区蓝）→ 停一拍 → 删除
    elBody.querySelectorAll('.cf-t').forEach((s) => s.classList.remove('is-hid'));
    elBody.classList.add('is-selecting');
    later(200, () => {
      elBody.classList.remove('is-selecting');
      elBody.textContent = '';
      elBody.className = 'cf-body';
      if (reduce.matches) return enter();
      startInstall(doc.install || [], enter);
    });
  }

  /* ================= 8. 静态渲染（对照表 / 减少动效） ================= */

  function paintStatic(body, doc) {
    if (doc.mode === 'terminal') {
      body.className = 'cf-body is-terminal';
      body.textContent = '';
      for (const s of doc.script || []) {
        if (s.k === 'box') { for (const l of s.lines) pushLineTo(body, l, 't-box'); }
        else if (s.k === 'wait') continue;
        else if (s.k === 'think') pushLineTo(body, '✻ ' + (s.label || 'Thinking') + '… (12s · esc to interrupt)', 't-think');
        else if (s.k === 'spin') pushLineTo(body, (s.text || '✻') + ' … (esc to interrupt)', 't-think');
        else if (s.k === 'type') pushLineTo(body, s.text, termClass(s.text));
        else if (s.text) pushLineTo(body, s.text, termClass(s.text));
      }
      return;
    }
    body.className = 'cf-body is-editor';
    body.textContent = '';
    for (const toks of tokenize(doc.code, doc.lang)) {
      const lineEl = document.createElement('div');
      lineEl.className = 'cf-line is-started';
      for (const t of toks) {
        const span = document.createElement('span');
        span.className = 'cf-t k-' + t.c;
        span.textContent = t.s;
        lineEl.appendChild(span);
      }
      body.appendChild(lineEl);
    }
  }

  function staticInstall(body, lines) {
    body.className = 'cf-body is-install';
    body.textContent = '';
    for (const item of lines) {
      if (item && typeof item === 'object' && item.bar) {
        const el = document.createElement('div');
        el.className = 'cf-tline t-bar';
        const on = document.createElement('span'); on.className = 'bar-on';
        on.textContent = '━'.repeat(item.chars || 34);
        const lab = document.createElement('span'); lab.className = 'bar-lab';
        lab.textContent = ' ' + (item.label || '');
        el.appendChild(on); el.appendChild(lab);
        body.appendChild(el);
      } else {
        pushLineTo(body, typeof item === 'string' ? item : (item.t || ''), null);
      }
    }
  }

  function staticRender(doc) {
    if (S.curTok) { S.curTok.classList.remove('is-cur'); S.curTok = null; }
    S.curLine = null;
    resetShift();
    paintStatic(elBody, doc);
  }

  function nextDoc() {
    const k = ORDER.indexOf(S.id);
    switchTo(ORDER[(k + 1) % ORDER.length]);
  }

  /* ================= 9. 什么时候停 =================

     只有两个理由，都跟「用户在做别的事」有关 —— **和滚动位置无关**：
       1. 用户正在填表（焦点在表单控件里）
       2. 代码带不在视野内
     加上页面切后台、系统减少动效。

     都不取消定时器（见 later 的注释），所以回来看的时候是从原处接着演，
     不会重头拉一遍依赖。之前「滚到顶部会重头开始」就是这个原因。
     ================================================ */

  /* 注意：这里**没有**「代码带离开视野就暂停」这条规则了。
     带子是 position: fixed 钉在页面上侧的，永远不会离开视野 ——
     留一条永远不触发的规则只是死代码，而且会让人以为它还在起作用。
     现在停下来的理由只有「用户在做别的事」，与滚动位置无关。 */

  document.addEventListener('visibilitychange', () => {
    setReason('hidden', document.hidden);
  });

  /* 输入暂停：焦点进表单就停。
     恢复延迟 800ms 是为了处理「Tab 到下一个字段」—— 中间会瞬间没焦点，
     不延迟的话每跳一个字段就恢复一次，背景会一顿一顿地抖。 */
  const FIELD = 'input, select, textarea, [contenteditable="true"]';
  let blurTimer = null;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.closest || !t.closest(FIELD)) return;
    clearTimeout(blurTimer);
    setReason('input', true);
  });
  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.closest || !t.closest(FIELD)) return;
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => setReason('input', false), 800);
  });

  if (reduce.addEventListener) {
    reduce.addEventListener('change', () => {
      if (!S.id) return;
      if (reduce.matches) { setReason('reduced', true); bump(); staticRender(DATA[S.id]); }
      else { setReason('reduced', false); switchTo(S.id); }
    });
  }

  /* ================= 10. 对外接口 ================= */

  // 渲染类接口：任何页面都能用（静态对照表靠这几个）
  const API = { order: ORDER.slice(), data: DATA, tokenize, termClass, paintStatic, staticInstall,
                pace: PACE };

  // 没有现场（静态页）：到此为止。动画接口不存在，但渲染接口可用。
  if (!root) { window.codefield = API; return; }

  Object.assign(API, {
    go: switchTo,
    next: nextDoc,
    // 手动暂停 = 关掉自动轮播 + 冻住当前这一帧。恢复时从原处接着来。
    pause() { S.autoplay = false; setReason('manual', true); },
    resume() { S.autoplay = true; setReason('manual', false); },
    // freeze 是给测试/对照表用的：取消所有挂起的定时器，直接铺终态。
    freeze() { bump(); if (S.id) staticRender(DATA[S.id]); },
    staticInstallFor(id) { staticInstall(elBody, (DATA[id] || {}).install || []); },
    setReason,
  });
  /* ⚠ 这三个必须用 defineProperty，不能写进上面的 Object.assign：
     Object.assign 取的是 getter 的**当前值**，不是 getter 本身。
     写成 assign 的后果是 API.paused 永远是初始化那一刻的 false，
     而徽标又是读 S.reasons 画的 —— 于是界面说「已暂停」、API 说「没暂停」。
     这是实测抓到的 bug，不是假想的。 */
  Object.defineProperty(API, 'current', { get() { return S.id; } });
  Object.defineProperty(API, 'paused', { get() { return isPaused(); } });
  Object.defineProperty(API, 'reasons', { get() { return [...S.reasons]; } });
  Object.defineProperty(API, 'clock', { get() { return clock(); } });
  window.codefield = API;

  if (reduce.matches) {
    S.reasons.add('reduced');
    S.id = ORDER[0];
    root.dataset.dir = DATA[ORDER[0]].dir;
    root.dataset.mode = DATA[ORDER[0]].mode;
    staticRender(DATA[ORDER[0]]);
    updateHold();
  } else {
    switchTo(ORDER[0]);
  }
})();
