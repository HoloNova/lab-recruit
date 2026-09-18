/* 静态对照表（外部文件：CSP 是 script-src 'self'） */
(function () {
  'use strict';
  var cf = window.codefield;
  if (!cf) return;

  var NOTES = {
    sw: { note: 'Spring Boot 控制器。注解、关键字、类型、字符串四种色都出现。', motion: '逐字打字 · 随机抖动 · 标点后停顿 · 行首缩进瞬现 · 偶发错字回删' },
    hw: { note: '固件写入。宏、volatile 寄存器、十六进制字面量、行继续符。', motion: '与软件档同一套打字节奏' },
    al: { note: '生日界。Python 的注释与类型注解是另一套颜色分布。', motion: '与软件档同一套打字节奏' },
    ai: { note: 'Claude Code 终端会话，不是代码。这是唯一换掉整个渲染面的一档。', motion: '整块追加 · 停顿是主角 · ✻ 指示器旋转' },
  };

  var host = document.getElementById('sheet');
  var names = { sw: '软件', hw: '硬件', al: '算法', ai: '人工智能' };

  cf.order.forEach(function (id) {
    var doc = cf.data[id];
    var meta = NOTES[id] || {};

    var wrap = document.createElement('section');
    wrap.className = 'case';
    wrap.setAttribute('data-id', id);

    var label = document.createElement('div');
    label.className = 'case-label';
    var dir = document.createElement('span');
    dir.className = 'case-dir';
    dir.textContent = names[id] || id;
    var meta2 = document.createElement('span');
    meta2.className = 'case-meta';
    meta2.textContent = doc.file + '  ·  ' + (doc.lang === 'terminal' ? 'bash' : doc.lang) +
      (doc.code ? '  ·  ' + doc.code.split('\n').length + ' 行 / ' + doc.code.length + ' 字符' : '  ·  ' + doc.script.length + ' 步剧本');
    label.appendChild(dir); label.appendChild(meta2);

    var cols = document.createElement('div');
    cols.className = 'case-cols';

    // 用固定高度的 .cf 块装静态渲染。cf-sheet 类让它参与文档流而不是铺满全屏。
    var field = document.createElement('div');
    field.className = 'cf cf-sheet';
    field.setAttribute('aria-hidden', 'true');
    field.setAttribute('data-dir', names[id]);
    var m = document.createElement('div');
    m.className = 'cf-meta';
    var f = document.createElement('span'); f.className = 'cf-file'; f.textContent = doc.file;
    var l = document.createElement('span'); l.className = 'cf-lang'; l.textContent = (doc.lang === 'terminal' ? 'bash' : doc.lang);
    m.appendChild(f); m.appendChild(l);
    var body = document.createElement('div');
    body.className = 'cf-body';
    field.appendChild(m); field.appendChild(body);

    // ← 关键：和动画跑完时用的是同一个函数
    cf.paintStatic(body, doc);

    var side = document.createElement('div');
    side.className = 'case-side';
    var dl = document.createElement('dl');
    function row(k, v) {
      var dt = document.createElement('dt'); dt.textContent = k;
      var dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    row('这一档是什么', meta.note || '');
    row('运动', meta.motion || '');
    row('过渡（拉取依赖）', doc.install ? doc.install.length + ' 行 · ' + doc.install[0].slice(0, 34) + '…' : '无');
    side.appendChild(dl);

    cols.appendChild(field); cols.appendChild(side);
    wrap.appendChild(label); wrap.appendChild(cols);
    host.appendChild(wrap);
  });

  // 主题切换
  [].slice.call(document.querySelectorAll('[data-theme-set]')).forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-theme-set');
      document.documentElement.dataset.theme = t;
      [].slice.call(document.querySelectorAll('[data-theme-set]')).forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
  });
})();
