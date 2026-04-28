const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 基础配置
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// 初始化数据存储
const DB_PATH = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ realname: [], contract: [] }));
}
function getDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDB(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }

// 1. 登录接口
app.post('/api/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: 'fail' });
});

// 2. 实名审核接口
app.post('/api/realname', (req, res) => {
  const db = getDB();
  db.realname.unshift({ id: Date.now(), ...req.body, status: 0 });
  saveDB(db);
  res.json({ code: 200 });
});
app.get('/api/realname/list', (req, res) => {
  res.json({ code: 200, data: getDB().realname });
});
app.post('/api/realname/check', (req, res) => {
  const db = getDB();
  db.realname = db.realname.map(x => 
    x.id === req.body.id ? {...x, status: req.body.status} : x
  );
  saveDB(db);
  res.json({ code: 200 });
});

// 3. 合同管理接口
app.post('/api/contract/add', (req, res) => {
  const db = getDB();
  db.contract.unshift({ id: Date.now(), ...req.body, status: 1 });
  saveDB(db);
  res.json({ code: 200 });
});
app.get('/api/contract/list', (req, res) => {
  res.json({ code: 200, data: getDB().contract });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`服务已启动，端口：${PORT}`);
});
