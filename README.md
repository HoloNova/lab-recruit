# 网络攻防与信息安全 · 实验室招新网站

仿照 activetheory.net 的沉浸式动效风格，纯黑白极简 + Canvas 粒子背景。

## 快速开始

```bash
npm install
npm start        # 或 PORT=8080 npm start
```

访问 http://localhost:3001

> 端口说明：默认 3001（非 3000），因为本项目跑在 WSL2 里，而 Windows 主机常用 3000 端口，避免 localhost 转发冲突。可用 `PORT=xxxx npm start` 自定义。
>
> **绑定说明**：server.js 显式绑定 `0.0.0.0`（IPv4）。在 WSL2 mirrored 网络模式下，只有 IPv4 监听才会被转发到 Windows 的 localhost，绑定双栈会导致 Windows 浏览器连不上（症状：localhost 拒绝连接，但 WSL 内 curl 正常）。

要求 Node.js ≥ 22.5（使用内置 `node:sqlite`，无需编译原生依赖）。

## 目录结构

```
432web/
├── server.js          # Express 入口：API + 静态托管
├── db.js              # SQLite 初始化 + 查询
├── data.db            # 数据库（首次启动自动生成）
├── uploads/           # 报名照片（自动生成）
└── public/            # 前端（纯 HTML/CSS/JS，无构建）
    ├── index.html
    ├── style.css
    └── app.js
```

## 查报名数据

直接查 SQLite：

```bash
sqlite3 data.db "SELECT name, major, direction, created_at FROM applications;"
sqlite3 data.db "SELECT * FROM applications ORDER BY id DESC;"   # 完整记录
```

照片文件在 `uploads/` 目录，数据库中存的是访问路径（如 `/uploads/photo-xxx.jpg`）。

## 维护友情链接

友链从数据库读取，增删改都直接操作 SQLite：

```bash
# 新增
sqlite3 data.db "INSERT INTO friend_links (name, url, description, sort_order) VALUES ('我的博客', 'https://blog.example.com', '记录安全研究日常', 3);"

# 修改
sqlite3 data.db "UPDATE friend_links SET url='https://new-url.com' WHERE id=1;"

# 删除
sqlite3 data.db "DELETE FROM friend_links WHERE id=2;"

# 查看
sqlite3 data.db "SELECT * FROM friend_links ORDER BY sort_order;"
```

改完刷新页面即可生效（无需重启）。

## 待办（素材补充）

- [ ] Hero 副标题、研究方向描述文案可自定义（`public/index.html`）
- [ ] 实验室简介文字（如需，可在 Directions 区补一段）
- [ ] 替换 2 条占位友链为真实网站
