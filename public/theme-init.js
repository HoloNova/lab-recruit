/* ============================================================
   主题初始化 —— 必须在首次绘制前运行

   放在 <head> 里、且在样式表之后（见 index.html 的注释）：
   作为外部脚本，CSP script-src 'self' 允许；内联脚本被禁止，所以不能内联。
   样式表会阻塞后续脚本执行，所以这里能读到已解析的 --ed-bg。

   为什么需要它：CSS 无法根据系统偏好给元素「设置属性」，
   所以没有任何纯 CSS 写法能表达「默认跟随系统、手动选择可覆盖」。
   在这里提前把 data-theme 写到 <html> 上，就没有深色用户先看到一帧白底的问题。

   主题只有颜色一个轴（令牌契约见 themes/*.css 顶部）。
   ============================================================ */
(() => {
  const LIGHT = 'editor-light';
  const DARK = 'editor-dark';
  const KNOWN = [LIGHT, DARK];
  const KEY = 'theme';

  function preferred() {
    let chosen = null;
    try { chosen = localStorage.getItem(KEY); } catch { /* 隐私模式 */ }
    if (chosen && KNOWN.includes(chosen)) return { theme: chosen, source: 'user' };
    // ⚠ 默认深色，**不看系统偏好**。
    //
    // 为什么不再跟随 prefers-color-scheme：整页的版面建立在
    // 「深色代码带 + 深冷灰底 + 玻璃卡片」上（见 style.css 顶部）。
    // 系统偏好浅色的浏览器会拿到浅色语法色压在硬编码的深色底上，
    // 结果是一片没对比度的糊。所以浅色主题需要单独设计一轮，
    // 在那之前不能把它当默认值。
    // 用户手动选过的话仍然尊重（localStorage 优先，见上面一行）。
    return { theme: DARK, source: 'site' };
  }

  function apply(theme, source) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeSource = source;
    // 手机浏览器把 theme-color 用在地址栏 / 状态栏上；深色下不跟着改会露出一条白边。
    // 从 --ed-bg 取真实值，保证只有一处定义。
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--ed-bg').trim();
    if (bg) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', bg);
    }
  }

  const { theme, source } = preferred();
  apply(theme, source);

  // 供将来加手动开关用。切换只需调用它，不必重载页面。
  window.setTheme = (name) => {
    if (!KNOWN.includes(name)) return false;
    try { localStorage.setItem(KEY, name); } catch { /* 忽略 */ }
    apply(name, 'user');
    return true;
  };
})();
