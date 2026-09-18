/* 原型交互（外部文件：CSP 是 script-src 'self'） */
(function () {
  'use strict';
  var cf = window.codefield;
  if (!cf) return;

  var pauseBtn = document.getElementById('pause');
  var toggled = false;

  function markDir(id) {
    [].slice.call(document.querySelectorAll('.dir-row')).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === id));
    });
    [].slice.call(document.querySelectorAll('.ctl [data-go]')).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-go') === id));
    });
  }

  function pick(id) {
    if (!cf.go) return;
    cf.pause();                       // 手动选了就别让自动轮播打断
    cf.go(id);
    markDir(id);
    toggled = false;
    pauseBtn.setAttribute('aria-pressed', 'false');
    pauseBtn.textContent = '暂停轮播';
  }

  [].slice.call(document.querySelectorAll('.ctl [data-go]')).forEach(function (b) {
    b.addEventListener('click', function () { pick(b.getAttribute('data-go')); });
  });
  // 方向表里的每一行也能切
  [].slice.call(document.querySelectorAll('.dir-row')).forEach(function (b) {
    b.addEventListener('click', function () { pick(b.getAttribute('data-id')); });
  });

  pauseBtn.addEventListener('click', function () {
    toggled = !toggled;
    pauseBtn.setAttribute('aria-pressed', String(toggled));
    pauseBtn.textContent = toggled ? '继续轮播' : '暂停轮播';
    if (toggled) cf.pause(); else cf.resume();
  });

  markDir(cf.current);
})();
