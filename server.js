// 实验室招新网站 —— 后端入口
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const { insertApplication, getLinks } = require('./db');

const app = express();
// 默认 3001：Windows 主机常用 3000，避免 localhost 转发撞车
const PORT = process.env.PORT || 3001;

// 确保 uploads 目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 照片上传配置：限制 5MB，仅图片类型
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `photo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  },
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
// 上传的图片可直接访问
app.use('/uploads', express.static(UPLOAD_DIR));

// 获取友情链接
app.get('/api/links', (req, res) => {
  res.json({ ok: true, links: getLinks() });
});

// 提交报名（照片必填）
app.post('/api/applications', upload.single('photo'), (req, res) => {
  const { name, major, direction, intro, learned, ai_views } = req.body || {};
  // 校验必填项
  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: '请填写姓名' });
  if (!major || !major.trim()) return res.status(400).json({ ok: false, error: '请填写专业' });
  if (!direction || !direction.trim()) return res.status(400).json({ ok: false, error: '请选择方向' });
  if (!intro || !intro.trim()) return res.status(400).json({ ok: false, error: '请填写个人简介' });
  if (!req.file) return res.status(400).json({ ok: false, error: '请上传照片（必填）' });

  const photoPath = `/uploads/${req.file.filename}`;
  const id = insertApplication({
    name: name.trim(),
    photo_path: photoPath,
    major: major.trim(),
    direction: direction.trim(),
    intro: intro.trim(),
    learned: (learned || '').trim(),
    ai_views: (ai_views || '').trim(),
  });
  res.json({ ok: true, id });
});

// 错误处理：文件大小超限 / 类型错误
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: '照片不能超过 5MB' });
    return res.status(400).json({ ok: false, error: '照片上传失败：' + err.message });
  }
  if (err) return res.status(400).json({ ok: false, error: err.message });
  next();
});

// 显式绑定 IPv4 0.0.0.0：WSL mirrored 网络模式下，只有 IPv4 监听才会被转发到 Windows 的 localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎯 实验室招新网站已启动: http://localhost:${PORT}`);
  console.log(`   数据库: data.db  (用 sqlite3 data.db 查询)`);
});
