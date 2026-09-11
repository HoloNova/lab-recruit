# 招新站反滥用与安全加固设计（v3 待审）

日期：2026-09-11
类型：Architectural（现有系统的安全加固）
状态：**待审核**
前置文档：`docs/superpowers/specs/2026-09-02-lab-recruit-design.md`

> 本文档只负责**安全与流程门控**。视觉动效优化另开独立 spec，不并入本文。

## 本版相对 v2 的变更

| # | 变更 | 来源 |
|---|---|---|
| 1 | **删除整个照片上传链**（multer / sharp / 魔数 / 重编码 / 私有目录全部不做） | 你的决定 |
| 2 | 新增 §2「三阶段流程与状态机」+ `settings` 表 + 公告表 | 你的流程变化 |
| 3 | 新增 `GET /api/wechat-qr`（ETag 条件请求，换图立即生效） | 群二维码 7 天过期 |
| 4 | 编辑流程改为**两次请求模型** + 客户端凭证存储（localStorage 便利副本） | 讨论结论 |
| 5 | 面试名单**只在群内公布**，网站不提供任何名单接口 | 你的决定 |
| 6 | `sharp` / `jimp` 选型问题**作废**（照片砍掉后不存在） | 连带结果 |

## 0. 决策摘要

| 项 | 决定 |
|---|---|
| 人机验证 | 自托管 SVG 图形验证码；答案由 `crypto.randomInt` 生成，`svg-captcha` 只负责渲染 |
| 防灌水 | 验证码 + 会话配额 + 总量熔断；**不做基于出口 IP 的硬限流**（校园 NAT 必然误伤） |
| 防重复报名 | `student_id NOT NULL UNIQUE`（数据库约束兜底，不用"先查后插"） |
| 重复提交 | 不回显任何已有数据；`409` + 编辑码指引 |
| 编辑凭证 | `student_id + edit_token` 双要素，token 只在其自身行生效；服务端只存 HMAC |
| 客户端存储 | localStorage 存 token 作为**便利副本**，自动预填；**不是安全控制** |
| 照片 | **完全不做**（无上传、无存储、无路由） |
| 报名阶段门控 | 数据库 `settings` 驱动，服务端强制，运行时 CLI 可改 |
| 群二维码 | 磁盘文件 + ETag 条件请求，替换即生效；附永不过期的个人微信兜底 |
| 面试名单 | 只在群内公布，网站零接口 |
| 公告 | 后台 CLI 发布，前端纯文本渲染 |
| 审核后台 | CLI 工具，零 HTTP 暴露 |
| 校验 | 服务端为唯一权威（OWASP：allowlist、参数化、上下文编码） |

### 依赖变化

```
改动前：express, multer
改动后：express, svg-captcha        ← multer 删除（无文件上传），sharp 从未引入
```

`svg-captcha` 唯一依赖 `opentype.js@0.7.3`（纯 JS）。**全项目零原生编译依赖**，README 里"无需编译原生依赖"的承诺继续成立。

### 防线定位（避免过度承诺）

图形验证码不是墙。打码平台可低成本绕过任何图形验证码，AI OCR 对简单验证码也有相当准确率。它的作用是**抬高批量灌水的单位成本**。真正兜底的是 `学号唯一约束` + `风险标记` + `人工审核`。

目标不是"零漏网"，是"正常同学零摩擦、脚本要花钱、异常一眼能看见"。

## 1. 阶段与时间线

### 1.1 三个阶段

| 阶段 | 报名接口 | 前端表单 | 页面重点 |
|---|---|---|---|
| `warmup` 预热 | **关闭** | 可见但禁用，显示开放时间 + 加群按钮 | 实验室介绍、方向、项目、时间线、加群二维码 |
| `signup` 报名 | 开放 | 可用 | 完整报名表 |
| `review` 初筛/面试 | **关闭** | 显示"报名已截止" | 公告（面试安排） |

**报名接口默认关闭**。当前处于 `warmup`，攻击面在这个阶段是关闭的——反滥用功能不必赶在国庆前完工，按 §13 的 Phase 顺序做即可。

### 1.2 状态机不用 env，必须用数据库

开放/关闭时间需要在国庆假期里远程调整、在截止日自动生效，**不能靠重启服务或改代码**。

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

初始行：

| key | 说明 | 初始值 |
|---|---|---|
| `registration_opens_at` | 报名开放时刻（UTC ISO8601） | `2026-10-08T02:00:00Z`（= 北京时间 10:00，待定） |
| `registration_closes_at` | 报名截止时刻 | 待定 |
| `phase_override` | 手动强制阶段，空 = 按时间自动判定 | `''` |
| `contact_email` | 人工兜底邮箱 | 待填 |
| `total_cap` | 全站报名总量熔断 | `2000` |

判定逻辑：

```
phase = phase_override 非空 ? phase_override
      : now >= closes_at    ? 'review'
      : now >= opens_at     ? 'signup'
      :                       'warmup'
```

### 1.3 时区（真实的坑，必须处理）

现有代码用 `datetime('now','localtime')`。若服务器/容器时区不是 `Asia/Shanghai`，报名开放时刻会**差 8 小时**。

规则：

- `settings` 里所有时刻存 **UTC ISO8601**（`2026-10-08T02:00:00Z`）。
- 比较时统一转成 epoch 毫秒，**不做字符串比较**。
- 前端展示时用 `Intl.DateTimeFormat` 显式指定 `timeZone: 'Asia/Shanghai'` 渲染成"10 月 8 日 10:00"。
- 新增 `created_at` 等时间戳一律 `datetime('now')`（UTC），展示层再转本地。

### 1.4 时间线展示

时间线是**展示用**，允许只写大概时间，与 `settings` 里的精确值解耦：

| 阶段 | 展示文案 | 数据来源 |
|---|---|---|
| 预热 | 招新预热中 —— 欢迎加入招新群了解实验室 | `announcements` 或硬编码 |
| 报名 | 国庆假期后开放，具体时间以群公告为准 | `settings.registration_opens_at`（若已定则显示精确值，否则显示"国庆后"） |
| 面试 | 国庆后面试，具体安排见群公告 | 硬编码文案，"约"字措辞 |
| 结果 | 名单在招新群内公布 | 硬编码文案 |

> 时间线文案写在 `config/timeline.js`（硬编码），不建表。需要改就改文件重启——它不涉及精确时刻，不值得为它做 CLI。

### 1.5 面试名单：只在群内公布

**网站不提供任何形式的名单接口或名单页面。**

理由：公开"姓名 + 学号"列表等于把"这批人申请了网安实验室"与真实身份公开绑定，任何人（同学、辅导员、做社工的人）都能整批爬走。打码方案（`2026****01 张*`）也被否决——一个班几十人，配尾数很容易认出是谁。

做法：CLI 导出面试名单 → 群内公布 → 网站只放一条公告"面试名单已公布，请查看群公告"。零接口、零泄露。

### 1.6 招新群二维码

**硬事实**：微信群二维码 **7 天失效**，且群满 200 人后无法扫码进群。预热期约 4 周，至少需更换 4 次。

**不自建"活码"系统**：活码的价值是"入口链接不变、后台可换码"，但网站上这个入口位置本来就是固定 URL，换图即可。自建活码是无用复杂度。

**实现**：二维码存 `data/wechat-qr.png`，通过条件请求提供，替换文件后立即生效、无需重启。

```js
// GET /api/wechat-qr
const st = fs.statSync(p);
const etag = `"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;  // mtime 精度不够，带 size
res.set('Content-Type', 'image/png');
res.set('Cache-Control', 'no-cache');   // 注意：不是 no-store
res.set('ETag', etag);
if (req.headers['if-none-match'] === etag) return res.status(304).end();
res.sendFile(p);
```

`no-cache` = "允许缓存，但每次必须回源验证"（`no-store` 才是"不缓存"）。换图后立刻拿到新的，平时只传 304 空响应。

**必须的兜底**：页面上同时放"群二维码 + 群满/失效可加我微信拉你进群"，个人微信二维码**不会过期**。漏换一次也不会断掉入口。

**运营提示**：页面写明"建议转发本页链接，不要转发二维码截图"——同学间转发的截图 7 天后必然失效。

### 1.7 公告

```sql
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,           -- ≤ 80 码点
  body  TEXT NOT NULL,           -- ≤ 2000 码点
  pinned INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- 公开接口 `GET /api/announcements`：只返回 `visible=1`，`pinned DESC, published_at DESC`，最多 20 条。
- CLI：`npm run review -- --announce "标题" --body "..."` / `--unpublish <id>` / `--pin <id>`
- **前端纯文本渲染**（`textContent` + `white-space: pre-wrap`），不解析 Markdown/HTML。
  公告由管理员撰写、本属可信内容，但纯文本渲染意味着"后台被入侵"不会自动升级成"网站 XSS"。公告就是几行字，纯文本够用。

## 2. 威胁模型

| # | 威胁 | 现实程度 | 主要防线 | 残余风险 |
|---|---|---|---|---|
| T1 | 脚本批量灌水 | 高（当前无任何拦截） | 阶段门控、图形验证码、会话配额、总量熔断 | 打码平台 + 清 cookie |
| T2 | 同一人重复报名 | 高 | `student_id UNIQUE` | 换学号即新记录，靠人工识别 |
| T3 | 编造学号 | 中 | 格式校验 + 风险标记 | 格式正确的假学号仍可入库 |
| T4 | **存储型 XSS** | **高，当前存在** | 服务端校验 + 输出转义 + 严格 CSP | 无 |
| T5 | 学号枚举：探测谁报过名 | 中（设计缺陷） | 见 §6 | 见 §6.5 |
| T6 | CSRF（伪造跨站提交） | 中 | `Origin` 校验 + **只解析 JSON** | 无 |
| T7 | SQL 注入 | 低（已用预编译） | 保持参数化，禁止拼接 | 无 |
| T8 | 验证码暴力破解 / 复用 | — | 一次性消费 + 尝试上限 + TTL + 会话绑定 | 无 |
| T9 | 数据库文件被下载 | 低（不在 `public/`） | 目录隔离 + 权限 600 + 备份不落 Web 目录 | 服务器被入侵 |
| T10 | DoS（超长字段、超大请求体） | 中 | 字段上限 + body 限制 + `Content-Length` 预检 + 配额 | 真·流量攻击需反代层 |
| T11 | 未开放期被提前灌库 | 中 | 阶段门控在服务端强制 | 无 |
| T12 | 时间线/公告被改 | 低 | 仅 CLI 可写，无 HTTP 写接口 | 服务器被入侵 |

> **已消除的威胁（v2 曾存在）**：照片上传带来的任意文件上传、同源 XSS、EXIF GPS 泄露、磁盘打满、PII 图片遍历——砍掉照片后全部消失。

## 3. 分层拦截

| 层 | 机制 | 挡住什么 | 正常用户代价 | 位置 |
|---|---|---|---|---|
| L0 | 前端 `maxlength`、格式提示、换一张 | 手滑、无效提交 | 无 | `public/` |
| L1 | **阶段门控** | 未开放期的一切提交 | 无 | 服务端 |
| L2 | 图形验证码（CSPRNG + 一次性 + 180s TTL） | 低级脚本、curl 直灌 | 输入 4 个字符 | `POST /api/applications` |
| L3 | 学号 `UNIQUE` + 格式校验 | 重复报名、乱填学号 | 无 | DB + 服务端 |
| L4 | 会话配额 + 总量熔断 | 单会话刷量、突发洪峰 | 几乎不触发 | 服务端 |
| L5 | `risk_score` / `risk_flags` | 不拦人，只标注 | 无 | 服务端 + CLI |
| L6 | 人工审核（按风险分排序） | 漏网之鱼 | 无 | CLI |

**L1 之后不再有硬拒绝层**（L4 的 429 只在极端刷量时触发）。学号格式不符是唯一的内容硬拒绝（`400`），必须给出人工兜底邮箱。

## 4. 请求处理顺序（顺序即安全语义）

```
前置中间件
  1. Origin / Sec-Fetch-Site 校验                → 403 BAD_ORIGIN
  2. Content-Length 预检（> 1MB 直接拒）          → 413
  3. 阶段检查（未开放 / 已截止）                   → 403 REGISTRATION_CLOSED
  4. sid 会话配额（5 次/10 分钟）                  → 429 SESSION_QUOTA
  5. 全站总量熔断（默认 2000）                     → 503 TOTAL_CAP

body 解析
  6. 仅接受 application/json，body ≤ 64KB         → 415 / 413

服务端校验（先便宜的先拒）
  7. 字段白名单 + 类型 + 长度 + enum + 控制字符剥离
  8. 蜜罐字段非空 → 记 HONEYPOT，**照常返回成功**
  9. 学号格式 ^2026\d{6}$                         → 400 VALIDATION
 10. 验证码校验 + 原子消费                         → 400 CAPTCHA_*
 11. 归一化 + 计算 hash（contact_norm / content_hash / ip_hash）
 12. 风险评分（只读查询）
 13. INSERT；捕获 errcode 2067                    → 409 STUDENT_EXISTS
 14. 生成 edit_token，仅此一次返回
```

**第 3 步阶段检查放在验证码之前**：未开放时不该消耗用户解验证码的精力，也不该消耗服务端签发验证码的资源；但仍放在 Origin 校验之后，避免被当成探测工具。

**第 6 步只解析 JSON 是 CSRF 的关键**：跨站 HTML 表单只能发 `urlencoded` / `multipart` / `text/plain`，全都不被解析 → 请求体为空 → 校验失败。照片砍掉后表单变成纯文本 POST，跨站提交变容易了，这一步是必需的补偿。

**第 10 步早于第 13 步**：验证码必须在查重之前校验。若先查重再验验证码，攻击者一个 HTTP 请求就能探测一个学号，零成本批量摸出谁报过名。

## 5. 图形验证码设计

### 5.1 选型与实测结论

库：`svg-captcha@1.4.0`（MIT，唯一依赖 `opentype.js@0.7.3`，纯 JS，Node 24 实测可用）。

**关键点 1：答案由我们生成，库只负责画。** 实测默认导出签名就是 `createCaptcha(text, options)`：

```js
const svgCaptcha = require('svg-captcha');        // 默认导出 = createCaptcha(text, options)
const { randomInt } = require('node:crypto');

const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';  // 去 0/o/1/l/i 等易混字符
const answer = Array.from({ length: 4 }, () => CHARS[randomInt(CHARS.length)]).join('');
const svg = svgCaptcha(answer, {
  width: 150, height: 50, fontSize: 45, noise: 3,
  background: '#f4f4f4',
});
```

**关键点 2：设置 `background` 会强制开启彩色模式。** 库源码 `lib/index.js`：

```js
const bg = options.background;
if (bg) { options.color = true; }                 // ← 任何背景色都会覆盖 color:false
```

所以 `color: false` + 自定义背景做不到；而 `color: false` 不设背景会得到 `#111`~`#444` 深灰字形，在纯黑页面上几乎不可见。**结论：浅色底板 + 彩色字形**。彩色噪声对简单 OCR 干扰更强，外观上就是一个正常表单控件。

**关键点 3：库内部的 `Math.random()` 只影响装饰**（噪声线条位置、颜色、元素顺序）。不参与答案生成。**不 fork、不 vendored、不打补丁。**

**关键点 4：库已 6 年未更新，可接受。** 不解析用户输入（只解析随包自带 TTF），无网络行为，攻击面仅限渲染。

### 5.2 生命周期

```
签发 GET /api/captcha
  ├─ 取/建会话 cookie：__Host-recruit_sid（见 §18.5）
  ├─ 配额：该 sid 10 分钟签发 ≤ 20；超出 → 429
  ├─ id = randomBytes(16).toString('base64url')
  ├─ 入库 answer_hmac = HMAC-SHA256(pepper_captcha, lowercase(trim(answer)))
  ├─ TTL = 180 秒
  └─ 返回 { captcha_id, svg }，响应头 Cache-Control: no-store

校验
  ├─ 取行 WHERE id=? AND sid=?（绑定会话，防盗用他人验证码）
  ├─ 过期 / 已消费 / attempts ≥ 5 → 失败
  ├─ HMAC 比较用 crypto.timingSafeEqual（先对齐长度）
  ├─ 失败：attempts+1，写 abuse_events('captcha_fail')；≥5 作废
  └─ 成功：UPDATE captchas SET consumed_at=? WHERE id=? AND consumed_at IS NULL
          断言 changes() === 1（原子消费，防并发重放）
```

### 5.3 规则

- 大小写不敏感；输入 trim + 全角转半角。
- **一次性**：成功后立即消费；失败不重放。
- 前端用 `<img src="data:image/svg+xml;base64,...">`，**禁止 `innerHTML` 注入 SVG 字符串**。
- 验证码文本**绝不写入日志**；数据库只存 HMAC。
- 惰性清理：签发时 `DELETE FROM captchas WHERE expires_at < now - 600`，不引入定时任务。
- 任何提交失败（含 409）后，前端自动刷新验证码并清空输入框。

### 5.4 可访问性兜底（必需）

表单下方常驻一行："验证码看不清 / 无法完成？发送邮件至 `<contact_email>` 人工报名。"

**验证码不能是唯一入口**——否则屏幕阅读器用户、网络受限用户会被直接排除。这不是可选项。

## 6. 数据模型（schema v2）

迁移：`PRAGMA user_version` + 事务；升级前 `VACUUM INTO` 备份。现有库仅 1 条测试数据（`id=1, name='123'`，无学号）→ **备份后删除**。

```sql
-- 报名主表（SQLite 不能 ALTER ADD UNIQUE，需重建）
CREATE TABLE applications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  class_name      TEXT    NOT NULL,
  contact_type    TEXT    NOT NULL,                 -- 'wechat' | 'phone'
  contact         TEXT    NOT NULL,
  contact_norm    TEXT    NOT NULL,
  major           TEXT    NOT NULL,
  direction       TEXT    NOT NULL,
  intro           TEXT    NOT NULL,
  learned         TEXT,
  ai_views        TEXT,
  edit_token_hash TEXT    NOT NULL,                 -- HMAC-SHA256(token, pepper_edit)
  content_hash    TEXT    NOT NULL,
  risk_score      INTEGER NOT NULL DEFAULT 0,
  risk_flags      TEXT    NOT NULL DEFAULT '[]',
  review_status   TEXT    NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected|waitlist
  review_note     TEXT,
  reviewed_at     TEXT,
  ip_hash         TEXT,                             -- HMAC(ip)，IPv6 归一到 /64
  ua_hash         TEXT,
  dwell_ms        INTEGER,                          -- 服务端计算
  edit_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT,
  CHECK (length(student_id) <= 20), CHECK (length(name) <= 20),
  CHECK (length(class_name) <= 30), CHECK (length(contact) <= 50),
  CHECK (length(major) <= 30),      CHECK (length(intro) <= 200),
  CHECK (length(learned) <= 200),   CHECK (length(ai_views) <= 200)
);

CREATE UNIQUE INDEX idx_app_student_id   ON applications(student_id);
CREATE INDEX        idx_app_ip_created   ON applications(ip_hash, created_at);
CREATE INDEX        idx_app_contact_norm ON applications(contact_norm);
CREATE INDEX        idx_app_content_hash ON applications(content_hash);

-- 验证码（短期）
CREATE TABLE captchas (
  id TEXT PRIMARY KEY, answer_hmac TEXT NOT NULL, sid TEXT NOT NULL,
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER
);
CREATE INDEX idx_captchas_expires ON captchas(expires_at);

-- 表单会话（配额 + 服务端计时）
CREATE TABLE form_sessions (
  sid TEXT PRIMARY KEY, issued_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  captcha_issued INTEGER NOT NULL DEFAULT 0, submit_count INTEGER NOT NULL DEFAULT 0,
  edit_count INTEGER NOT NULL DEFAULT 0, failed_edit INTEGER NOT NULL DEFAULT 0,
  failed_captcha INTEGER NOT NULL DEFAULT 0
);

-- 风控/审计事件
CREATE TABLE abuse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,   -- captcha_fail|honeypot|quota|flood|student_dup|edit_token_fail|bad_origin|phase_block
  sid TEXT, ip_hash TEXT, detail TEXT
);
CREATE INDEX idx_abuse_kind_ts ON abuse_events(kind, ts);
CREATE INDEX idx_abuse_ip_ts   ON abuse_events(ip_hash, ts);

-- 修改审计
CREATE TABLE application_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  fields TEXT NOT NULL,   -- JSON: 被修改的字段名数组
  ip_hash TEXT
);

-- 阶段与配置（见 §1.2）
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL,
                       updated_at TEXT NOT NULL DEFAULT (datetime('now')));

-- 公告（见 §1.7）
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> **时间戳统一 UTC**（`datetime('now')`），展示层转 `Asia/Shanghai`。v1/v2 用的 `datetime('now','localtime')` 是隐患，见 §1.3。
> 长度上限集中定义在 `config/fields.js`（单一真相源），DB `CHECK` 是最后兜底。

## 7. 重复学号、编辑凭证与客户端存储

### 7.1 三条铁律

1. **`edit_token` 只在首次提交成功时返回一次**，之后服务端永不回显。库里只存 `HMAC-SHA256(token, pepper_edit)`。
2. **`409` 响应体不得出现任何已有记录的信息**：没有姓名、联系方式、记录 id，**也没有 `张*` 这类打码提示**。打码把"某学号报过名"升级成"报名者姓张"，配合同届学号连号可直接定位到人。
3. **编辑接口凭 `student_id + edit_token` 双要素**，token 只在其自身行生效。A 的 token 永远改不了 B 的记录。
   双要素的价值：万一有 XSS 批量偷 token，攻击者不知道每个 token 属于谁，用不了。学号从 localStorage 自动带出，UX 成本约等于零。

### 7.2 客户端凭证存储（便利层，非安全层）

**先说清定位**：localStorage **不是安全控制**。无痕窗口、DevTools 删 key、换浏览器、换设备都能绕过。它只解决一个问题：**用户提交完就关标签页、编辑码没存下来**。

localStorage 结构（key `recruit.submissions.v1`）：

```json
[{ "token": "<43字符>", "sid_full": "2026000001", "sid_masked": "2026****01",
   "at": "2026-09-11T12:00:00+08:00" }]
```

- **允许存多条**（数组）：宿舍共用电脑时各存各的。
- **不做学号 hash**：6 位尾数只有 100 万种可能，暴力枚举是毫秒级，hash 买不到隐私。要防"随手看 DevTools 的人"用掩码显示就够，防不了"有 DevTools 的人"。**要么存（学号本来就不是秘密），要么不存。**

页面加载时的软拦截（纯前端）：

```
localStorage 为空         → 正常空白表单
localStorage 有 ≥1 条记录  → 表单上方显示卡片：
   ┌──────────────────────────────────────┐
   │ 本设备已提交过报名：2026****01        │
   │ [修改这份报名] [不是我，我要为另一人报名] │
   └──────────────────────────────────────┘
```

**"不是我"按钮不清除 token**，只隐藏卡片、放行空白表单。清掉的话前一个人的编辑凭证就永久没了。共享电脑必须留这个出口。

### 7.3 编辑流程（两次请求）

```
1. POST /api/applications/edit/lookup   { student_id, edit_token }
   → 校验 token → 200 返回当前值 → 前端预填表单
   → 不需要验证码（256 位 token 猜不出；失败按 sid 限速 5 次/10 分钟）
   → 响应不含 id、不含 ip_hash、不含 risk_*、不含 review_*

2. 用户改完 → 填验证码 → POST /api/applications/edit { ...全字段, captcha_id, captcha_answer }
   → 全量重校验（与新建同一套）+ 更新 + 写 application_edits 审计
```

**为什么 lookup 不需要验证码**：token 已经是 256 位随机凭证，猜测不可行；加验证码只会让真实用户多解一次。防护靠 sid 限速 + `edit_token_fail` 事件记录。

**为什么 update 需要验证码**：它是写操作，且是唯一能改数据的入口，值得多一道。

### 7.4 接口响应

```jsonc
// 提交成功
200 { "ok": true, "status": "created", "edit_token": "<43字符>",
      "message": "报名已提交。请保存下方编辑码，修改信息时需要它，我们不会再次显示。" }

// 蜜罐命中（不告诉机器人哪里错了）
200 { "ok": true, "status": "created", "edit_token": "<随机值>" }
    // 静默入库并标记 risk_score ≥ 100，CLI 置顶标红

// 重复学号
409 { "ok": false, "code": "STUDENT_EXISTS",
      "message": "该学号已提交过报名。如为本人修改信息，请使用首次提交时显示的编辑码；如编辑码已丢失，请联系 <contact_email> 人工核验。" }

// 未开放
403 { "ok": false, "code": "REGISTRATION_CLOSED",
      "message": "报名尚未开放 / 报名已截止",
      "opens_at": "2026-10-08T02:00:00Z", "closes_at": null }

// lookup
200 { "ok": true, "current": { name, class_name, contact_type, contact, major, direction, intro, learned, ai_views } }
401 { "ok": false, "code": "TOKEN_INVALID", "message": "编辑码不正确。" }
```

`409` 与 `401` 的文案**不含任何用户数据**，只有固定说明文字。

### 7.5 防枚举分析

| 攻击者动作 | 得到的唯一信息 | 代价 |
|---|---|---|
| POST 一个学号 | 存在 / 不存在 | 必须解 1 张绑定自己 sid 的验证码 |
| 拿到 409 后想拿数据 | 什么都没有 | 无任何字段回显 |
| 猜编辑码 | 无 | 256 位随机 + sid 限速 5 次/10 分钟 + `edit_token_fail` 记录 |
| 用自己合法 token 改别人 | 无 | token 只在自身行生效 |

### 7.6 残余风险（待你确认）

`409` 状态码本身仍泄露"该学号提交过报名"。这是**存在性预言机**，无法在保留可用性的同时消除。已选**方案 A**：

- 明确返回 `409` + 编辑码指引；本人一眼知道该走编辑流程。
- 代价：存在性可被探测（每次探测消耗一张验证码，并被 `abuse_events` 记录）。

**补偿**：同一 sid/ip 10 分钟内产生 ≥5 次 `student_dup` → CLI 异常事件区显示 `ENUM_PROBE`（不写入某条报名的 `risk_score`，因为它不属于任何一条报名）。

（方案 B「一律返回 200 已收到、静默丢弃」已被否决：真实本人会以为自己重新提交成功，不知道数据没更新。）

### 7.7 编辑码丢失

CLI `npm run review -- --reset-token <id>`：重新生成并**只打印一次**新 token，管理员核验身份后线下告知。

这条路径必需——否则丢码用户永远改不了信息，只能由管理员直接改库，反而更糟。

## 8. 输入校验规范

唯一真相源 `config/fields.js`，经 `/api/form-config` 下发；前端 `maxlength` 只是体验，服务端永远重新校验。

| 字段 | 必填 | 上限（码点） | 规则 |
|---|---|---|---|
| `student_id` | 是 | 20 | `^2026\d{6}$`；全角转半角、去空格；拒控制字符 |
| `name` | 是 | 20 | 去首尾空格；拒换行/控制字符；不含 URL |
| `class_name` | 是 | 30 | 同上 |
| `contact_type` | 是 | — | enum：`wechat` \| `phone` |
| `contact` | 是 | 50 | `phone`：去空格/`-`/`+86` 后匹配 `^1[3-9]\d{9}$`；`wechat`：`^[A-Za-z][A-Za-z0-9_-]{5,19}$` **或**手机号格式（很多人的微信号就是手机号） |
| `major` | 是 | 30 | |
| `direction` | 是 | — | enum：`软件` \| `硬件` \| `算法` \| `人工智能` |
| `intro` | 是 | 200 | 允许换行；剥离其他控制字符 |
| `learned` / `ai_views` | 否 | 200 | 同上 |
| `captcha_id` / `captcha_answer` | 是 | — | 见 §5 |
| `website`（蜜罐，名字运行时生成） | — | — | 非空 → 机器人 |

通用规则：

- **白名单优先**：接受字段之外出现非空值一律计 `HONEYPOT`（统一处理"未知字段"和"蜜罐"两种情况）。
- 长度按**码点**计（`[...s].length`），并同时校验 UTF-8 字节上限。
- 先 `String(s).normalize('NFKC')`，再 trim，再去控制字符（`\u0000-\u0008\u000B-\u001F\u007F`，长文本保留 `\n`）。
- **原始文本入库，不做 HTML 清洗**；安全性由输出端负责（§9）。
- `contact_norm`：`phone` → 纯数字；`wechat` → 小写。
- 校验失败只提示"哪个字段、什么要求"，不返回服务端内部状态。

## 9. Web 安全基线（OWASP 对照）

| 要求 | 做法 |
|---|---|
| 输入校验 | 服务端 allowlist + 长度上限（§8），绝不信任前端 `maxlength`/正则 |
| SQL 注入 | 全部预编译参数化；**禁止**拼接 `ORDER BY`/`LIMIT`，排序字段走 allowlist 映射 |
| 输出编码 | 渲染用户/公告内容一律 `textContent`；**不用 `innerHTML`**；JSON 响应 `Content-Type: application/json; charset=utf-8` |
| 存储型 XSS | 上述 + CSP `default-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`（当前前端无内联脚本，可上严格 CSP） |
| CSRF | 写接口校验 `Origin`（env `ALLOWED_ORIGIN`，**精确字符串匹配，禁止后缀/Host 匹配**）+ **只解析 JSON**（§4 第 6 步）+ `Sec-Fetch-Site` 兜底 |
| CORS | 不设 `Access-Control-Allow-Origin: *`；同源即可 |
| 安全响应头 | `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`Permissions-Policy` 精简、`Strict-Transport-Security` |
| 传输安全 | 全站 HTTPS（反代终止）+ HTTP 跳转 + HSTS |
| 数据库隔离 | `data.db*` 不在 `public/`，权限 600；备份不进静态目录；`data/wechat-qr.png` 也不在 `public/` |
| 错误处理 | 全局 handler 返回通用 500，细节进服务端日志（带 request-id）；**移除现有 `err.message` 直返** |
| 指纹 | `app.disable('x-powered-by')` |
| 反代信任 | `app.set('trust proxy', 1)` 且只信任一层，否则 `X-Forwarded-For` 可伪造，风控被污染 |
| 隐私/留存 | 报名数据仅管理员可见；招新结束后 3 个月删除；日志不落完整联系方式 |

## 10. 页面数据接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/form-config` | 下发阶段、限额、字段规则、微信号/邮箱；同时登记 `form_sessions.issued_at`（服务端计时基准） |
| GET | `/api/captcha` | 签发验证码，`no-store` |
| POST | `/api/applications` | 提交报名 |
| POST | `/api/applications/edit/lookup` | 凭学号+token 取回当前值 |
| POST | `/api/applications/edit` | 凭学号+token+验证码更新 |
| GET | `/api/announcements` | 公告（`visible=1`） |
| GET | `/api/wechat-qr` | 群二维码（ETag 条件请求） |
| GET | `/api/links` | 友情链接（不变） |

**没有** `GET /api/applications`，**没有**任何名单接口。

`/api/form-config` 响应示例：

```json
{ "phase": "warmup",
  "registration": { "open": false, "opens_at": "2026-10-08T02:00:00Z", "closes_at": null },
  "wechat_qr_url": "/api/wechat-qr",
  "contact_email": "...",
  "student_id_pattern": "^2026\\d{6}$",
  "limits": { "name": 20, "class_name": 30, "contact": 50, "intro": 200 },
  "honeypot_field": "website" }
```

> 蜜罐字段名由服务端下发，前端动态渲染。**前端源码里不出现任何"这是蜜罐"的注释或样式名**（AI 可能分析源码），只用 `display:none` + 无意义字段名，看起来像普通隐藏字段。

## 11. 风险评分

累加后映射等级：`0-19 正常` / `20-59 需留意` / `60-99 可疑` / `≥100 机器人`。

| code | 触发条件 | 分值 | 备注 |
|---|---|---|---|
| `HONEYPOT` | 白名单之外的字段非空 | +100 | 直接判机器人 |
| `ID_SUSPECT` | 通过格式但形如 `2026000000` / 全同数字 / 明显顺序号 | +50 | |
| `DUP_CONTENT` | `content_hash` 与已有记录相同 | +40 | 群发模板命中；室友参考同一模板也可能误报 |
| `IP_BURST` | 同一 `ip_hash` 10 分钟内 ≥3 次提交 | +30 | **校园 NAT 必然误报**，文案写"需人工确认"而非"作弊" |
| `DUP_CONTACT` | `contact_norm` 已存在 | +30 | 一人多报 / 室友共用微信号 |
| `CAPTCHA_FAIL` | 同一 sid 10 分钟内验证码失败 ≥5 次 | +30 | |
| `FLOOD` | 全局 10 分钟提交 > 50（可配） | +25 | |
| `TOO_FAST` | 服务端计算的 `dwell_ms < 30000` | +20 | 用 `/api/form-config` 签发时间算，**不信前端传值** |
| `NAME_SUSPECT` | 姓名含数字/URL、长度 < 2、重复单字符 | +20 | |

CLI 展示（按 `risk_score DESC, created_at ASC`）：

```
 张三  2026000001  正常
 李四  2026000002  ⚠ 需留意：同IP短时间多次提交、填写过快
 王五  2026000003  ⚠ 可疑：联系方式重复、内容与 2 份报名相同
 赵六  2099000001  ⛔ 机器人：蜜罐字段被填写
```

未命中任何规则时不显示任何标记，不制造噪音。

## 12. CLI 审核工具

`scripts/review.js`，零新增依赖（`node:util.parseArgs` + `readline` + ANSI）。**不监听任何端口。**

```bash
npm run review                             # 按风险分排序列表（分页，标记高亮）
npm run review -- --id 12                  # 详情 + 风险明细 + 相关 abuse_events
npm run review -- --accept 12 --note "面试通过"
npm run review -- --reject 12 --note "方向不符"
npm run review -- --waitlist 12
npm run review -- --events                 # 异常事件聚合（含 ENUM_PROBE）
npm run review -- --export ./out           # 仅 CSV（无照片了）

npm run review -- --open-registration "2026-10-08 10:00"   # 按 Asia/Shanghai 解析后存 UTC
npm run review -- --close-registration "2026-10-20 23:59"
npm run review -- --phase warmup|signup|review              # 强制阶段
npm run review -- --announce "初筛结果已公布" --body "..."
npm run review -- --pin <id> | --unpublish <id>

npm run review -- --reset-token 12         # 重新生成编辑码，只打印一次
npm run review -- --qr-status              # 显示二维码文件时间 + 剩余建议更换时间
npm run review -- --purge --before 2026-06-01 --yes   # 删行 + VACUUM
```

细节：

- 输出用户内容时对**终端控制字符**做过滤（防 ANSI 转义序列注入污染审核员终端）——这是 `textContent` 思路在 CLI 里的对应物。
- CSV 导出：正确转义 `,` `"` 换行；对以 `= + - @` 开头的字段加 `'` 前缀，防 Excel 公式注入。
- `--open-registration` 按 `Asia/Shanghai` 解析输入，存 UTC；显示时再转回，避免时区错乱（§1.3）。
- `--qr-status`：文件 mtime 超过 6 天时提醒更换（二维码 7 天失效）。

## 13. 测试与验收

`node:test`（Node 内置，零依赖）。为可测试性先做小重构：`config.js`（env 集中）+ `createApp()` 工厂 + `db.js` 接受路径参数，测试用临时 DB。

| 用例 | 断言 |
|---|---|
| **未开放期提交** | `403 REGISTRATION_CLOSED`，库中 0 行 |
| **未开放期提交不签发验证码消耗** | 阶段检查在验证码之前（断言 captchas 表无新增） |
| **phase_override = 'signup' 时提交** | 正常入库 |
| 无验证码提交 | `400 CAPTCHA_REQUIRED`，0 行 |
| 同一学号并发 ×2 | 1 个 200、1 个 409，库中 1 行 |
| 学号 `202612345`（9 位） | `400 VALIDATION` |
| 验证码错误 5 次后第 6 次 | 该 `captcha_id` 必失败 |
| 验证码成功后重放同一 id | 失败 |
| 验证码过期 / 属于别的 sid | 失败 |
| `<script>alert(1)</script>` 写入 `intro` | DB 存原文；CLI 渲染不含可执行标签 |
| 未知字段非空 | 入库且 `risk_flags` 含 `HONEYPOT`、`risk_score ≥ 100` |
| 伪造 `Origin: https://evil.com` | `403 BAD_ORIGIN`，0 行 |
| `Content-Type: application/x-www-form-urlencoded` | `415`，0 行（CSRF 防线） |
| 字段超长（`name` 21 字） | `400`，不落库 |
| **重复学号 409** | **响应体不含已有记录的姓名/联系方式/id**（逐字段断言） |
| 编辑码错误 ×6 | 401；第 6 次触发 sid 限速；`abuse_events` 有 `edit_token_fail` |
| 编辑码正确 | 200，`edit_count+1`，`application_edits` 有审计行；`created_at` 不变、`updated_at` 更新 |
| A 的编辑码改 B 的报名 | 401，B 记录不变 |
| lookup 响应 | 不含 `id` / `ip_hash` / `risk_*` / `review_*` |
| 同一 sid 连续 6 次 409 | `abuse_events` 出现 ≥5 条 `student_dup` |
| 公告 XSS 内容 | 前端渲染为纯文本（断言无 `<script>` 可执行） |
| 群二维码 ETag | 首次 200 + ETag；带 `If-None-Match` 再请求 → 304；替换文件 → ETag 变化 → 200 |
| 总量达上限后再提交 | `503 TOTAL_CAP` |
| 400 响应体 | 不含 `err.message` / 堆栈 / SQL 片段 |
| 时区：`--open-registration "2026-10-08 10:00"` | 库中存 `2026-10-08T02:00:00Z` |
| 迁移重复执行 | 幂等，`user_version` 不变 |

手工验收：`scripts/smoke.sh` 用 curl 跑通关键路径。

## 14. 分阶段实施

> 后续单独出实现计划（writing-plans），每阶段结束提交一次。

**Phase 0 — 可测试性重构（半天）**
`config.js`（env：DB_PATH、`pepper_captcha`、`pepper_edit`、`pepper_ip`、ALLOWED_ORIGIN、TRUST_PROXY）、`createApp()` 工厂、`db.js` 注入路径、迁移框架（`user_version` + `VACUUM INTO`）、`busy_timeout=5000`、`app.disable('x-powered-by')`、时间戳统一 UTC。

**Phase 1 — 止血：修复现存真实漏洞（1 天）**

- 删除 `app.use('/uploads', express.static(...))`（PII 泄露 + 同源 XSS 根因）
- 删除 multer 依赖与全部上传代码
- 字段白名单 + 长度上限 + enum + 控制字符剥离
- `Origin` 校验 + 只解析 JSON + `Content-Length` 预检
- 安全响应头 + 严格 CSP
- 全局错误处理脱敏
- 数据文件权限 + 备份脚本 + `.gitignore`

**Phase 2 — 阶段门控与配置（半天）**

- `settings` 表 + 阶段判定 + 服务端强制
- `/api/form-config` 下发阶段与限额
- `/api/wechat-qr` ETag 条件请求 + `--qr-status`
- `announcements` 表 + 接口 + CLI

**Phase 3 — 核心反滥用（2 天）**

- schema v2 迁移（含删除现有测试数据）
- 图形验证码：签发 / 校验 / 原子消费 / 会话配额 / 可访问性兜底
- 学号 `UNIQUE` + 格式校验 + `409` 编辑码指引
- `edit_token` + 两次请求编辑流程 + 客户端凭证存储
- 风险评分引擎 + `risk_flags` + `abuse_events`
- 会话配额 + 总量熔断 + `ENUM_PROBE` 聚合

**Phase 4 — 前端表单改造（1 天）** ← **需要与特效工作协调，见下**

- 新增学号 / 班级 / 联系方式字段（下拉 QQ→微信/手机）
- 验证码组件 + 换一张
- 编辑码保存提示 + 复制按钮
- `409` 后内联编辑码输入
- 本设备已报名卡片 + "不是我"出口
- 阶段状态渲染（未开放时表单禁用 + 显示开放时间）
- 公告区块 + 时间线区块 + 加群区块

**Phase 5 — 审核与部署（1 天）**

- `scripts/review.js` 全部子命令
- 反代 + HTTPS + HSTS + `trust proxy`
- 数据保留 / `--purge`
- `node:test` 全量用例 + `scripts/smoke.sh`

### 与特效工作的顺序协调

Phase 4 会**新增三个表单字段**并调整区块数量（新增公告、时间线、加群）。若先按当前 5 字段布局把动效调好，Phase 4 会导致布局重排、动效返工。

建议顺序：

1. **先定表单最终字段清单与区块序列**（本次：学号/姓名/班级/联系方式/专业/方向/简介/已学/AI看法 + 公告/时间线/加群区块）
2. **再基于该结构做动效优化**（另开 spec）
3. **Phase 4 只做交互与状态接线**，不改变布局骨架

Phase 0~2 对外观几乎零影响，可与动效工作并行。

## 15. 明确不做（YAGNI）

- 照片上传：已砍（无文件存储、无 PII 图片、无上传攻击面）
- 短信验证码：成本高、无必要
- 基于 IP 的硬限流/封禁：校园 NAT 必然误伤
- Turnstile / reCAPTCHA / hCaptcha：第三方依赖有被阻断风险
- 自建"群活码"系统：入口 URL 本就固定，无用复杂度
- Web 后台：CLI 已覆盖，少一个攻击面
- 公开面试名单 / 名单查询接口：隐私风险，只在群内公布
- 项目展示建表 + CMS：无素材，硬编码占位即可
- 邮件通知、多轮审核工作流、评分排行
- 验证码音频版（用邮箱文案兜底）
- WAF / 蜜罐 / IDS 等重型基础设施

## 16. 待你确认

1. **报名开放确切时刻**：§1.2 暂填 `2026-10-08T02:00:00Z`（北京时间 10/8 10:00）。**不阻塞开发**——是数据库值，随时 CLI 可改。截止时间同样可以后填。
2. **`sharp` 选型问题**：照片砍掉后**已作废**，无需回答。

## 17. 遗留：现有代码的真实缺陷清单（Phase 1 目标）

供评审对照，均为当前 `server.js` / `db.js` 的实际问题：

| # | 位置 | 问题 |
|---|---|---|
| 1 | `server.js:34` | `app.use('/uploads', express.static(UPLOAD_DIR))` —— 公开托管用户上传目录 |
| 2 | `server.js:20-27` | `fileFilter` 依赖客户端 `file.mimetype`；扩展名取自 `originalname`；`Math.random()` 命名 |
| 3 | 全球 | 无字段长度上限（`intro` 等可塞任意长内容） |
| 4 | 全球 | 无 `Origin` 校验，无 CSRF 防护 |
| 5 | `server.js:70-76` | 错误处理直返 `err.message`（可能泄露内部信息） |
| 6 | `server.js` | 无安全响应头（无 CSP / nosniff / HSTS） |
| 7 | 全球 | 无请求体大小限制（仅限制了文件 5MB） |
| 8 | `db.js:15` | `datetime('now','localtime')` —— 时区隐患 |
| 9 | `db.js` | 无 `busy_timeout`，并发写可能直接报 SQLITE_BUSY |
| 10 | `server.js` | 无 `x-powered-by` 关闭 |

## 18. 部署架构

### 18.1 现状（已核实）

| 项 | 实测结果 |
|---|---|
| `campuslink.vip` | Vue 3 SPA（Pinia + Element Plus），nginx/1.30.4，A → `8.210.97.46`（阿里云香港） |
| `join.campuslink.vip` | A → `8.210.97.46`（已生效） |
| 证书 | 仅 `DNS:campuslink.vip`，**无通配符** → 访问 join 报 `no alternative certificate subject name matches` |
| 80/443 | 已被现有 nginx 容器占用；**nginx 也在 Docker 中** |
| 结论 | 无 ICP 备案问题（香港节点）；不需要再引入 Caddy，由现有 nginx 担任边缘 |

### 18.2 拓扑

```
Internet
   │
   ▼
┌──────────────────────────────────────────────────┐
│ 阿里云香港 8.210.97.46                            │
│                                                   │
│  ┌──────────────────────┐                        │
│  │ nginx 容器（现有）     │  :80 / :443  ← 唯一公网入口
│  │  campuslink.vip       │                        │
│  │  join.campuslink.vip ─┼──┐                     │
│  └──────────────────────┘  │                     │
│                            │ Docker 网络（共享）   │
│  ┌─────────────────────────▼──┐                  │
│  │ recruit-app 容器（新增）     │  expose 3001     │
│  │  node server.js             │  ⚠ 不发布端口     │
│  └─────────────┬──────────────┘                  │
│                │ bind mount                      │
│  ┌─────────────▼──────────────┐                  │
│  │ ./data  data.db / qr / backup │                │
│  └────────────────────────────┘                  │
└──────────────────────────────────────────────────┘
```

**关键设计**：`recruit-app` **不映射任何宿主机端口**（compose 里没有 `ports:`）。公网唯一的入口是现有 nginx。node 进程只监听容器网络内的 3001，由 nginx 按容器名代理。

不使用 Caddy：80/443 已被占用，再起一个反代会抢端口。nginx 已具备 TLS + 压缩 + 代理能力，边缘职责交给它即可，**业务逻辑与安全响应头仍全部在 Node 里**（这样它们能被单元测试断言，而不是散落在两处配置）。

### 18.3 Dockerfile

```dockerfile
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# 先装依赖：package*.json 不变时命中缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 代码进镜像；public/ 与 data/ 通过 bind mount 覆盖
COPY server.js db.js config.js ./
COPY scripts ./scripts

RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "server.js"]
```

`node:24-alpine` 满足 `node:sqlite` 的 ≥22.5 要求，且**无需编译原生依赖**（依赖只有 express + svg-captcha，全纯 JS）。

### 18.4 compose.yml

```yaml
services:
  app:
    build: .
    container_name: recruit-app          # nginx 按这个名字代理
    restart: unless-stopped
    env_file: .env
    user: "${PUID:-1000}:${PGID:-1000}"  # 见 18.8 权限坑
    volumes:
      - ./public:/app/public:ro          # 前端热更新，改完即生效
      - ./data:/app/data                 # SQLite + 二维码 + 备份
    expose:
      - "3001"                           # 仅容器网络内可见
    # ⚠ 绝不要写 ports: —— 那会把 3001 暴露到公网
    networks:
      - web
    healthcheck:
      test: ["CMD", "node", "-e",
             "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

networks:
  web:
    external: true
    name: ${NGINX_NETWORK}               # 现有 nginx 所在的网络名
```

依赖只有一个服务：**不动现有 nginx 容器**，只让它能解析到 `recruit-app`。

### 18.5 Cookie 命名：`__Host-` 前缀（共享父域下的必需措施）

`campuslink.vip` 上已有一个带登录态的 SPA，很可能在 `.campuslink.vip` 上写过 cookie。若它用了 `sid` 或 `token` 这类通用名，而本站在同一父域下也用同名 cookie：

```
浏览器实际发送：Cookie: sid=<对方的>; sid=<我们的>
```

同名 cookie（一个 domain cookie、一个 host-only）**会同时发送**，最终谁生效取决于解析器覆盖顺序与创建时间 —— 这等于让安全边界依赖未定义行为。

**解法**：

```
Set-Cookie: __Host-recruit_sid=<value>; Secure; HttpOnly; SameSite=Strict; Path=/
```

`__Host-` 前缀由**浏览器强制**校验，三条缺一不可：

1. 必须带 `Secure`
2. **必须不带 `Domain` 属性**
3. `Path` 必须为 `/`

不满足则浏览器**直接拒收**该 cookie。效果：会话被锁死在 `recruit.campuslink.vip` 这一个主机上，兄弟子域无法覆盖（同时消除 cookie tossing）。

同理，**`ALLOWED_ORIGIN` 必须是精确字符串匹配**，禁止写成后缀或 `includes` 匹配 —— 否则 `https://campuslink.vip.evil.com` 能通过校验。

### 18.6 nginx server block

```nginx
# join.campuslink.vip
server {
    listen 80;
    listen [::]:80;
    server_name join.campuslink.vip;

    # certbot HTTP-01 验证
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                                  # nginx ≥1.25.1 新语法
    server_name join.campuslink.vip;

    ssl_certificate     /etc/letsencrypt/live/campuslink.vip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/campuslink.vip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 1m;                   # 与应用 body 上限一致（双重限制）

    location / {
        proxy_pass            http://recruit-app:3001;
        proxy_http_version    1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout    30s;
    }
}
```

**安全响应头（CSP / nosniff / HSTS 等）不在这里配** —— 它们由 Node 发出，nginx 默认透传。放在 Node 里才能被测试断言，也避免两处配置漂移。

`proxy_pass http://recruit-app:3001;` 末尾**不带路径**，表示透传原始 URI。

### 18.7 证书

现有证书由 Let's Encrypt 签发（`CN=campuslink.vip`，Aug 29 → Nov 27），**不含 `join`**。两个方案：

**方案 1（推荐，改动最小）**：把 join 加进同一张证书

```bash
# 视 certbot 部署方式二选一
certbot certonly --webroot -w <webroot> \
  -d campuslink.vip -d join.campuslink.vip --expand
# 或若 certbot 在容器里：
docker exec <certbot容器> certbot certonly --webroot -w /var/www/certbot \
  -d campuslink.vip -d join.campuslink.vip --expand
```

证书 lineage 目录名仍为 `campuslink.vip`（以第一个 `-d` 为准），故 §18.6 的路径不用改。续期自动生效（join 与主域同一张证书）。

**方案 2（通配符，为将来多个子域准备）**：`*.campuslink.vip` via DNS-01

```bash
certbot certonly --dns-aliyun --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini \
  -d campuslink.vip -d '*.campuslink.vip'
```

需要 `certbot-dns-aliyun` 插件 + 阿里云 RAM 子账号（**仅授 DNS 权限**，不要用主账号 AK）。好处是以后加任何子域都不用再动证书。代价是多一份凭据要保管。

> DNS 是阿里云万网（`dns21/dns22.hichina.com`），故此方案可行。

**部署顺序**（避免鸡生蛋）：

1. 先加 §18.6 的 **80 端口 block**（含 ACME location），此时不要加 443 block
2. 跑 `certbot --expand`（HTTP-01 走 80，能通）
3. 再加 443 block
4. `nginx -t && nginx -s reload`

### 18.8 权限坑（Docker + bind mount + SQLite）

`./data` 由宿主机创建，属主是宿主机用户；容器以 `node`（uid 1000）运行。属主不一致 → **SQLite 写失败**。

```bash
mkdir -p data data/backup
sudo chown -R 1000:1000 data     # 与 .env 里 PUID/PGID 一致
```

若宿主机部署用户的 uid 不是 1000：

```bash
echo "PUID=$(id -u)" >> .env
echo "PGID=$(id -g)" >> .env
sudo chown -R "$(id -u):$(id -g)" data
```

### 18.9 环境变量

```bash
# .env（不进 git，权限 600）
PORT=3001
DB_PATH=/app/data/data.db
ALLOWED_ORIGIN=https://join.campuslink.vip

# 三个独立 pepper：生成方式
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
PEPPER_CAPTCHA=<32B base64url>
PEPPER_EDIT=<32B base64url>
PEPPER_IP=<32B base64url>

CONTACT_EMAIL=<人工兜底邮箱>
TRUST_PROXY=1              # 只信任一层（nginx），见下
NGINX_NETWORK=<现有 nginx 的网络名>
PUID=1000
PGID=1000
```

**pepper 一旦设定不可更改**：改了会导致所有 `edit_token_hash` / `answer_hmac` / `ip_hash` 失配（编辑码全部失效、去重失效）。备份时必须连同 `.env` 一起备份。

### 18.10 `trust proxy` 必须精确等于 1

```js
app.set('trust proxy', 1);   // 只信任一层代理
```

- 设成 `true`：Express 会信任整条 `X-Forwarded-For` 链，**客户端可伪造 IP** → 污染 `ip_hash` 与 `IP_BURST` 风控。
- 设成默认（不设）：所有请求来源都变成 `127.0.0.1` → `ip_hash` 全部相同 → `IP_BURST` 对所有人误报。

nginx 侧用 `$proxy_add_x_forwarded_for`（追加真实来源）。客户端若自带 `X-Forwarded-For: 1.2.3.4`，nginx 产出 `1.2.3.4, <真实IP>`，`trust proxy: 1` 取最右值 = 真实 IP，伪造被击败。

> 若将来在 nginx 前再加 CDN（如 Cloudflare），此值必须相应改为 2 并改用 `CF-Connecting-IP`，否则风控失真。

### 18.11 部署步骤

```bash
# 1. 上传代码
git clone <repo> /opt/recruit && cd /opt/recruit

# 2. 找到现有 nginx 的网络名
NGINX_C=$(docker ps --format '{{.Names}}' | grep -i nginx | head -1)
docker inspect "$NGINX_C" --format \
  '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'

# 3. 配置 .env（含 §18.9 的三个 pepper）
cp .env.example .env && $EDITOR .env && chmod 600 .env

# 4. 初始化 data 目录权限（§18.8）
mkdir -p data/backup && sudo chown -R 1000:1000 data

# 5. 启动（不动现有 nginx）
docker compose up -d --build
docker compose logs -f app

# 6. 验证容器可达性（在 nginx 容器内测）
docker exec "$NGINX_C" wget -qO- http://recruit-app:3001/api/health

# 7. nginx：加 §18.6 的 80 block → 扩证书 → 加 443 block → reload
docker exec "$NGINX_C" nginx -t && docker exec "$NGINX_C" nginx -s reload
```

**阿里云安全组**：只放行 80/443。3001 无需放行（compose 未发布该端口，双重保险）。

### 18.12 日常运维

```bash
./review                          # CLI 审核（wrapper，见下）
docker compose logs -f app        # 看日志
docker compose up -d --build      # 更新代码
docker compose down               # 停止（数据在 ./data，不丢）

# 备份（WAL 模式下直接 cp 会拿到不一致快照，必须用 VACUUM INTO）
docker compose exec app node scripts/backup.js
# 再由宿主机 cron 同步出去：
# 0 3 * * * cd /opt/recruit && docker compose exec -T app node scripts/backup.js \
#           && rsync -a data/backup/ /backup/recruit/
```

CLI wrapper `./review`（消除 Docker 带来的 `exec` 摩擦）：

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose exec app node scripts/review.js "$@"
```

用法与原生一致：`./review --accept 12`、`./review --open-registration "2026-10-08 10:00"`。

**换群二维码**（每 7 天）：

```bash
scp new-qr.png root@8.210.97.46:/opt/recruit/data/wechat-qr.png
# 无需重启：ETag 基于 mtime+size，文件一换立即生效
curl -sI https://join.campuslink.vip/api/wechat-qr | grep -i etag   # 验证 ETag 变化
```

### 18.13 本方案的风险与边界

| 风险 | 说明 | 缓解 |
|---|---|---|
| **共享命运** | 与 `campuslink.vip` 同机同网络。对方被攻破，报名数据（学号+手机号+微信号）一起暴露；本应用有漏洞也可能影响对方 | 容器隔离、`data/` 权限 600、nginx 只做反向代理不开目录浏览、本应用不发布端口 |
| **同源前端热更新** | `public/` 是 bind mount，宿主机上任何人改了 JS 都会立刻被所有访客执行 | 宿主 `public/` 目录权限收窄；`docker compose` 部署目录不对其他用户可写 |
| 证书扩展失败 | 若 certbot 由 systemd timer 驱动而配置未同步更新，新证书可能不被加载 | 扩展后手动 `nginx -t && nginx -s reload`，并用 `curl -I` 验证 SAN 含 join |
| 同网络其他容器 | 同一 Docker 网络上的容器都能访问 3001 | 单租户服务器可接受；如需强隔离，给 nginx 与 recruit-app 建专用网络 |
