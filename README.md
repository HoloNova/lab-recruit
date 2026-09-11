# 网络攻防与信息安全 · 实验室招新网站

沉浸式动效 + 三阶段招新流程（预热 / 报名 / 初筛面试）。
反滥用设计为「低摩擦 + 多层拦截」：自托管图形验证码、学号去重、风险标记、CLI 审核。

安全设计文档：`docs/superpowers/specs/2026-09-11-anti-abuse-security-design.md`

---

## 快速开始（本地）

```bash
npm install
npm start          # 默认 3001
```

访问 http://localhost:3001

> 首次启动会在 `data/` 下自动创建数据库，并在非生产环境下把开发密钥写入
> `data/dev-peppers.json`（仅限本地，生产必须显式配置 `PEPPER_*`）。

要求 **Node.js ≥ 22.9**（使用内置 `node:sqlite` 与 `--env-file-if-exists`，无原生编译依赖）。

### 本地把报名打开

默认处于**预热期**，报名接口是关闭的：

```bash
npm run review -- --settings          # 看当前阶段
npm run review -- --phase signup      # 临时强制开放（本地调试用）
npm run review -- --phase auto        # 恢复按时间自动判定
```

### 本地测试报名

页面上需要输入图形验证码。验证码答案在数据库里只存 HMAC，**无法反查**——
这是刻意设计。要自动化测试请用 `npm test`（测试里注入了可控的验证码答案）。

---

## 招新流程与阶段

| 阶段 | 报名接口 | 页面 |
|---|---|---|
| `warmup` 预热 | 关闭 | 介绍 / 方向 / 时间线 / 公告 / 加群二维码 |
| `signup` 报名 | 开放 | 完整报名表 |
| `review` 初筛面试 | 关闭 | 公告（面试安排） |

阶段由数据库 `settings` 表驱动，**运行时可用 CLI 修改，无需重启服务**：

```bash
npm run review -- --open-registration "2026-10-08 10:00"    # 北京时间
npm run review -- --close-registration "2026-10-20 23:59"
npm run review -- --phase warmup                            # 强制阶段
```

时间在数据库里存 **UTC**，CLI 与页面都按 `Asia/Shanghai` 显示，避免服务器时区不是
UTC+8 时开放时间差 8 小时。

---

## 审核（CLI）

零 HTTP 暴露，不监听任何端口。审核量只有几十到几百条时，CLI 比后台更省事、少一个攻击面。

```bash
npm run review                              # 列表，按风险分排序
npm run review -- --id 12                   # 详情：全字段 + 风险明细 + 修改历史
npm run review -- --accept 12 --note "面试通过"
npm run review -- --reject 12 --note "方向不符"
npm run review -- --waitlist 12
npm run review -- --events                  # 最近 7 天异常事件（含疑似学号枚举探测）
npm run review -- --export ./out            # 导出 CSV
```

风险等级：`0-19 正常` / `20-59 需留意` / `60-99 可疑` / `≥100 机器人`。
**可疑报名不会被自动删除**，只做标记，最终由人判断。

> `IP_BURST` 在校园网/宿舍 NAT 下必然误报（多人共用出口 IP），
> 因此在 CLI 里的文案是「需人工确认」而不是「作弊」。

### 编辑码

首次提交成功时会返回一次性 **编辑码**，页面上必须立刻保存。
数据库只存 `HMAC(token, pepper)`，服务端**不会再次显示**。

用户丢失编辑码时，管理员核验身份后重置：

```bash
npm run review -- --reset-token 12          # 只打印一次，请线下告知本人
```

修改流程是两次请求：`edit/lookup`（凭学号 + 编辑码取回当前值）→ `edit`（提交修改，需要验证码）。
前端会把编辑码存在 localStorage 作为**便利副本**，因此同一台设备可以直接点「修改这份报名」。

> localStorage 不是安全控制——无痕窗口、清数据、换设备都能绕过。
> 服务端的 `edit_token` 才是唯一权威凭证。

### 招新群二维码

微信群二维码 **7 天失效**，群满 200 人后也无法扫码进群。预热期约 4 周，需要定期更换。

```bash
npm run review -- --qr-status               # 查看文件时间，超过 6 天会提醒
npm run review -- --set-qr ./new-qr.png     # 更新，无需重启
```

二维码从 `data/` 读取，通过 `GET /api/wechat-qr` 以 ETag 条件请求提供，
换图后访客下次请求即生效（命中 304 时几乎零开销）。

页面上同时建议放个人微信二维码作为兜底（个人码不会过期）。
**建议引导同学转发本页链接而不是二维码截图**——截图 7 天后就失效了。

### 公告

```bash
npm run review -- --announce "初筛结果已公布" --body "面试时间：10 月 25 日 14:00
地点：实验楼 302"
npm run review -- --pin <id>
npm run review -- --unpublish <id>
```

公告前端按**纯文本**渲染（`textContent` + `white-space: pre-wrap`），不解析 Markdown/HTML。

---

## 安全设计要点

| 机制 | 说明 |
|---|---|
| 图形验证码 | 自托管 SVG。答案由 `crypto.randomInt` 生成，`svg-captcha` 只负责渲染 |
| 一次性消费 | 验证码绑定会话，TTL 180 秒，最多 5 次尝试，成功后原子消费（防重放） |
| 学号唯一 | `student_id NOT NULL UNIQUE`，由数据库约束兜底，不用「先查后插」 |
| 不泄露已有信息 | 重复学号返回 `409`，响应体**不含**姓名/联系方式/id/打码提示 |
| 验证码先于查重 | 否则可零成本枚举「谁报过名」。现在每次探测都要消耗一张验证码 |
| 不做 IP 硬限流 | 校园 NAT 会误伤。IP 只用于打风险标记 |
| 蜜罐 | 字段名由服务端下发、前端动态渲染，非白名单字段非空即判定为机器人 |
| CSRF | `Origin` 精确匹配 + **只解析 JSON**（跨站表单发不了 JSON）+ `Sec-Fetch-Site` |
| 存储型 XSS | 入库原文，输出端一律 `textContent`；严格 CSP（无内联脚本） |
| 时区 | 全库存 UTC，展示按 `Asia/Shanghai`，避免开放时间偏差 8 小时 |
| 隐私 | 照片上传已移除；面试名单不提供任何网站接口，只在群内公布 |

### 已知的残余风险

- **存在性预言机**：`409` 本身仍泄露「该学号提交过报名」（但不泄露任何内容）。
  这是保留可用性的代价——否则真实用户会以为自己重新提交成功。
  缓解：同一会话 10 分钟内 ≥5 次 `student_dup` 会聚合为「疑似学号枚举探测」在 CLI 告警。
- **验证码不是墙**：打码平台可以低成本绕过任何图形验证码。
  它的作用是抬高批量灌水的单位成本；真正兜底的是学号唯一约束 + 风险标记 + 人工审核。

---

## 目录结构

```
432web/
├── server.js              # Express 入口 + createApp() 工厂
├── db.js                  # SQLite 打开 / 迁移 / 仓储
├── config.js              # 所有 env 的唯一读取点
├── lib/
│   ├── captcha.js         # 验证码签发与校验
│   ├── validate.js        # 服务端字段校验（唯一权威）
│   ├── risk.js            # 风险评分
│   ├── phase.js           # 三阶段状态机
│   └── time.js            # UTC / Asia-Shanghai 换算
├── scripts/
│   ├── review.js          # CLI 审核工具
│   └── backup.js          # VACUUM INTO 备份
├── public/                # 前端（纯 HTML/CSS/JS，无构建）
├── data/                  # 运行时数据（不进 git）
│   ├── data.db            # SQLite
│   ├── wechat-qr.png      # 招新群二维码
│   └── backup/            # 备份
├── deploy/nginx-join.conf # nginx server block
├── test/                  # node:test，零依赖
├── Dockerfile
└── docker-compose.yml
```

---

## 测试

```bash
npm test        # 92 个用例：HTTP 层 + 真实验证码集成 + 单元测试
```

覆盖阶段门控、验证码生命周期、学号去重与信息不泄露、编辑码流程、
CSRF/Origin/内容类型、蜜罐、字段校验、时区换算、风险规则、二维码 ETag、
CSV 公式注入防护、并发打开数据库等。

---

## 备份

WAL 模式下直接 `cp data.db` 会拿到不一致快照，**必须**用 `VACUUM INTO`：

```bash
npm run backup      # 产出 data/backup/data-YYYYMMDD-HHMMSS.db，权限 600
```

> ⚠ 备份数据库时**必须连同 `.env` 一起备份**。
> `PEPPER_*` 一旦更改，所有编辑码会失效、IP 风控会失配。

---

## Docker 部署

前置：服务器上已有 nginx（同样是 Docker）。本服务**不发布任何宿主机端口**，
只加入 nginx 所在的 Docker 网络，由 nginx 按容器名 `recruit-app` 代理。

```bash
# 1. 配置环境变量
cp .env.example .env && chmod 600 .env && $EDITOR .env
#    生成三个 pepper：
#    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 2. 找出 nginx 所在的网络名
docker ps --format '{{.Names}}' | grep -i nginx
docker inspect <nginx容器名> --format \
  '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
#    把结果填进 .env 的 NGINX_NETWORK

# 3. 数据目录属主必须与容器内 uid 对齐，否则 SQLite 写入失败
mkdir -p data/backup && sudo chown -R "$(id -u):$(id -g)" data
#    并把 id -u / id -g 填进 .env 的 PUID / PGID

# 4. 启动
docker compose up -d --build
docker compose logs -f app

# 5. 在 nginx 容器内验证连通性
docker exec <nginx容器名> wget -qO- http://recruit-app:3001/api/health
```

### nginx 与证书

`deploy/nginx-join.conf` 是 server block 模板。部署顺序（避免鸡生蛋）：

1. 先只加 **80 端口** 的 server（含 ACME 验证 location），不要加 443
2. 扩展证书：`certbot certonly --webroot -w <webroot> -d campuslink.vip -d join.campuslink.vip --expand`
3. 再加 **443** server
4. `nginx -t && nginx -s reload`

> 安全响应头（CSP / nosniff / HSTS）由 Node 发出，nginx 默认透传——
> 放在应用里才能被测试断言，也避免两处配置漂移。

### 运维

```bash
./deploy/review.sh                      # CLI wrapper（等价于 docker compose exec）
docker compose logs -f app
docker compose up -d --build            # 更新代码
docker compose down                     # 停止（数据在 ./data，不会丢）
docker compose exec app node scripts/backup.js
```

### 环境变量

见 `.env.example`。几个容易踩的点：

- **`TRUST_PROXY=1`**：只信任一层反代。设成 `true` 会让客户端伪造 `X-Forwarded-For`
  污染 IP 风控；不设则所有请求来源都变成 `127.0.0.1`，风控对所有人误报。
- **`COOKIE_SECURE=1`**：https 下必须为 1，才会启用 `__Host-` cookie 前缀
  （浏览器强制要求 `Secure` + 无 `Domain` + `Path=/`，可防止兄弟子域覆盖会话）。
  本地 http 调试设为 0。
- **`ALLOWED_ORIGIN`** 必须是精确 origin，校验用字符串全等——
  写成后缀匹配会让 `campuslink.vip.evil.com` 通过。

---

## 数据保留

招新结束后删除历史数据：

```bash
npm run review -- --purge --before "2026-06-01" --yes    # 删行 + VACUUM
```

建议报名数据保留不超过 3 个月。
