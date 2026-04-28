const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 基础配置
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 初始化数据库
const DB_PATH = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({
    realname: [],
    contract: [],
    authorizedAccounts: []
  }, null, 2));
}

// 工具函数
function getDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// 1. 登录接口
app.post('/api/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: '账号或密码错误' });
});

// 2. 实名审核接口
app.post('/api/realname', (req, res) => {
  const { userId, realName, phone, idCard, cardFront, cardBack } = req.body;
  if (!userId || !realName || !phone || !idCard || !cardFront || !cardBack) {
    return res.json({ code: 400, msg: '信息不完整' });
  }
  const db = getDB();
  db.realname.unshift({
    id: Date.now(),
    userId, realName, phone, idCard, cardFront, cardBack,
    status: 0
  });
  saveDB(db);
  res.json({ code: 200, msg: '提交成功，等待审核' });
});
app.get('/api/realname/list', (req, res) => {
  res.json({ code: 200, data: getDB().realname });
});
app.post('/api/realname/check', (req, res) => {
  const { id, status } = req.body;
  if (![1, 2].includes(status)) return res.json({ code: 400, msg: '状态无效' });
  const db = getDB();
  const item = db.realname.find(x => x.id === id);
  if (!item) return res.json({ code: 404, msg: '未找到记录' });
  item.status = status;
  saveDB(db);
  res.json({ code: 200, msg: '操作成功' });
});

// 3. 授权账号接口
app.get('/api/authorized/list', (req, res) => {
  res.json({ code: 200, data: getDB().authorizedAccounts });
});
app.post('/api/authorized/add', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ code: 400, msg: '账号不能为空' });
  const db = getDB();
  if (db.authorizedAccounts.includes(userId)) return res.json({ code: 400, msg: '该账号已授权' });
  db.authorizedAccounts.push(userId);
  saveDB(db);
  res.json({ code: 200, msg: '授权成功' });
});
app.post('/api/authorized/remove', (req, res) => {
  const { userId } = req.body;
  const db = getDB();
  db.authorizedAccounts = db.authorizedAccounts.filter(x => x !== userId);
  saveDB(db);
  res.json({ code: 200, msg: '移除成功' });
});
app.get('/api/authorized/check/:userId', (req, res) => {
  const { userId } = req.params;
  const isAuth = getDB().authorizedAccounts.includes(userId);
  res.json({ code: 200, authorized: isAuth });
});

// 4. 合同管理接口
app.post('/api/contract/add', (req, res) => {
  const { userId, lendName, borrowName, money, yearRate } = req.body;
  if (!getDB().authorizedAccounts.includes(userId)) return res.json({ code: 403, msg: '未授权，无法创建合同' });
  const db = getDB();
  db.contract.unshift({
    id: Date.now(), userId, lendName, borrowName, money, yearRate,
    status: 1
  });
  saveDB(db);
  res.json({ code: 200, msg: '合同创建成功' });
});
app.get('/api/contract/list', (req, res) => {
  res.json({ code: 200, data: getDB().contract });
});

// 启动服务
app.listen(PORT, () => {
  console.log('服务已启动，端口：' + PORT);
});
