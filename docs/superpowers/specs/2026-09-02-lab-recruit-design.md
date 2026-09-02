# 实验室招新网站设计

日期：2026-09-02
类型：Architectural（新项目）

## 背景

仿照 activetheory.net 的沉浸式动效风格，为「网络攻防与信息安全」实验室做一个招新网站。原站为全 WebGL 3D 体验，本项目简化为黑底白字极简风 + 轻量 Canvas 粒子背景，保证浏览器显示不糊不卡。

## 目标

1. 实验室展示（文字简介，素材较少，先用占位文案）
2. 报名表（核心）— 提交到后端数据库
3. 友情链接（独立区块，数量不固定，从数据库读取）
4. 沉浸式滚动：整屏分段展示，背景固定粒子层

## 技术栈

- 前端：纯 HTML/CSS/JS 单页，无构建工具，静态文件由后端托管
- 后端：Node.js (v24+) + Express + 内置 `node:sqlite`（无需原生编译）
- 图片上传：multer，存 `uploads/`，DB 存相对路径
- 部署：`npm start` 一键启动

## 页面结构（单页，从上往下，每屏 100vh scroll-snap）

1. **Hero**：实验室名「网络攻防与信息安全」+ 副标题 + 滚动提示
2. **方向选择**：软件 / 硬件 / 算法 / 人工智能 四张卡片，点击预填报名表方向
3. **报名表**：姓名 / 照片 / 专业 / 方向 / 个人简介 / 已学内容 / 对AI发展的看法（可选）
4. **友情链接**：卡片展示网站名 + 描述，点击展开 + 「在新标签页打开」；数量不固定

## 后端接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/applications | 提交报名（multipart，含照片） |
| GET  | /api/links | 获取友情链接列表 |

### 数据库表

**applications**
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | |
| name | TEXT | 姓名 |
| photo_path | TEXT | 照片路径（可空） |
| major | TEXT | 专业 |
| direction | TEXT | 方向 |
| intro | TEXT | 个人简介 |
| learned | TEXT | 已学内容 |
| ai_views | TEXT | 对AI发展的看法（可空） |
| created_at | TEXT | 提交时间 |

**friend_links**
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | |
| name | TEXT | 网站名 |
| url | TEXT | 链接 |
| description | TEXT | 描述 |
| sort_order | INTEGER | 排序 |
| created_at | TEXT | |

友链预置 2 条占位，之后可用 `sqlite3 data.db "INSERT..."` 增删。

## 视觉

- 配色：纯黑白 `#000` / `#f4f4f4` / 灰阶
- 字体：等宽现代字体栈（系统 monospace 近似 nbarchitekt），大标题宽字距
- 背景：固定 Canvas 黑白粒子漂浮层，跨区块连续
- 动效：scroll-snap 整屏滚动 + IntersectionObserver 淡入上移

## 目录结构

```
432web/
├── package.json
├── server.js          # Express 入口 + API + 静态托管
├── db.js              # 数据库初始化 + 查询
├── data.db            # SQLite 数据库（运行时生成）
├── uploads/           # 照片存储（运行时生成）
└── public/
    ├── index.html
    ├── style.css
    └── app.js         # 前端逻辑 + Canvas 粒子
```
