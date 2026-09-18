# UI / 动效改版 —— 实施记录

日期：2026-09-11
计划：`docs/superpowers/specs/2026-09-11-ui-motion-refresh.md`
改动：`public/index.html` · `public/style.css` · `public/app.js`

`npm test` **92/92 通过**。6 个视口（320/375/390/430/844×390/1440）实测无横向溢出、无脚本错误。

---

## 1. 本次最重要的产出：修掉一个会让「所有标题永久隐形」的 bug

计划里 M2a 的设计是：标题初始 `clip-path: inset(0 100% 0 0)`，用 IntersectionObserver
观察标题自身，进入视口时擦入。**这个设计自相矛盾** —— 被 `clip-path` 裁掉的元素在 Chromium 里
`intersectionRatio` 恒为 0。

受控实验（在真实页面上插入测试元素并观察）：

```
无裁剪                          → isIntersecting: true,  ratio: 1
clip-path: inset(0 100% 0 0)   → isIntersecting: true,  ratio: 0    ← 死锁
clip-path: inset(0 50% 0 0)    → isIntersecting: true,  ratio: 0.5  ← 精确成比例，确认成因
opacity: 0                     → isIntersecting: true,  ratio: 1    ← 不受影响
visibility: hidden             → isIntersecting: true,  ratio: 1    ← 不受影响
```

**修复**：改为观察未被裁剪的 `.hero` / `.sec`，由区块的 `.visible` 驱动标题擦入。
并加兜底：`IntersectionObserver` 不存在时直接呈现终态；所有初始隐藏态挂在 `.js` 下，
脚本失败时内容仍然可见。

## 2. 过程中引入又修掉的回归

漏掉宽屏两列规则 → 桌面表单变单列，`#apply` 从 1459px 涨到 1995px。
已补回 `@media (min-width: 600px)` 双列。

---

## 3. 验收（实测）

| 项 | 改造前 | 改造后 |
|---|---|---|
| 触控目标 <44px | **18 / 27** | **0 / 21** |
| 触控目标 <24px | 8 | **0** |
| 输入框字号 | 15px（触发 iOS 聚焦缩放） | **17px** |
| 表单标签 | 11px | **13px** |
| 占位符对比度 | **2.37:1** ❌ | 5.84:1 |
| 区块最大空置率 | **71%**（公告 844px 装 241px） | **15%** |
| 手机页长 | 8.2 屏 | 6.3 屏 |
| 横向溢出 | — | 6 视口全部 false |
| 字体下载 | 130 KB / 7 文件 | **~26 KB / 2 文件** |

**减少动效**（改造前 canvas `display:none`、页面退化成纯黑加灰字）：现在方格纸、
`#1b4fd8` 信号线终态、四条波形、进度线全部保留，`<h1>` 仍是宋体词标。

**安全约束未触碰**：无内联脚本/行内样式/`eval`（CSP 未改）、公告 `pre-wrap` 且
`innerHTML` 不含 `<`、蜜罐 `aria-hidden` + `tabIndex=-1`、无新增依赖、零图片。

---

## 4. 偏差（如实记录）

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| 手机页长 | ~4.5 屏 | **6.3 屏** | 计划低估报名表固有长度：9 个必填项在 50px 输入框高度下约 1400px。但**长出来的是真实内容不是空白**（空置率 71% → 最高 15%）。未为凑屏数压缩字号或输入框高度 |
| `style.css` | ~19 KB | 26.2 KB | 多出令牌注释、横屏分支、减少动效分支 |
| `app.js` | ~23 KB | 26.3 KB | 删掉约 90 行 canvas 粒子，新增读数/进度/入场分层 |

---

## 5. 待部署时再处理（本地测试阶段不动）

实测 `/style.css` 26.2 KB、`/app.js` 26.3 KB **都是未压缩明文传输**。

关键陷阱：`gzip_proxied` 默认 `off`，而本服务静态文件是**经 Node 代理**过来的，
所以只写 `gzip on` 等于没开 —— 必须同时给 `gzip_proxied any`。

补丁内容（部署时加到 `deploy/nginx-join.conf` 的 443 server 块内）：

```nginx
gzip            on;
gzip_proxied    any;          # ← 缺这行 gzip 等于没开
gzip_comp_level 6;
gzip_min_length 512;
gzip_types      text/css text/javascript application/javascript application/json
                image/svg+xml text/plain;
gzip_vary       on;
```

实测收益：`index.html` 16101→5216 B，`style.css` 26210→7598 B，`app.js` 26290→8416 B，
合计 66 KB → 20 KB。
