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
function getDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ========== 1. 登录接口 ==========
app.post('/api/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: '账号或密码错误' });
});

// ========== 2. 实名审核接口 ==========
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
  if (![1, 2].includes(status)) {
    return res.json({ code: 400, msg: '状态无效' });
  }
  const db = getDB();
  const item = db.realname.find(x => x.id === id);
  if (!item) return res.json({ code: 404, msg: '未找到记录' });
  item.status = status;
  saveDB(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ========== 3. 授权账号接口 ==========
app.get('/api/authorized/list', (req, res) => {
  res.json({ code: 200, data: getDB().authorizedAccounts });
});

app.post('/api/authorized/add', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ code: 400, msg: '账号不能为空' });
  const db = getDB();
  if (db.authorizedAccounts.includes(userId)) {
    return res.json({ code: 400, msg: '该账号已授权' });
  }
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

// ========== 4. 合同管理接口 ==========
app.post('/api/contract/add', (req, res) => {
  const { userId, lendName, borrowName, money, yearRate } = req.body;
  if (!getDB().authorizedAccounts.includes(userId)) {
    return res.json({ code: 403, msg: '未授权，无法创建合同' });
  }
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

// ========== 5. 后台管理页面 ==========
app.get('/admin', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>借条后台管理系统</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { background: #f5f5f5; margin: 0; padding: 0; }
    .login-box { width: 300px; margin: 100px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h3 { text-align: center; margin-bottom: 20px; }
    input { width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; }
    button { width: 100%; padding: 10px; background: #009688; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    button.small { width: auto; padding: 5px 10px; margin: 0 2px; font-size: 12px; }
    .container { display: none; width: 95%; max-width: 1400px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .tab-bar { margin-bottom: 20px; }
    .tab-btn { margin: 0 5px; padding: 8px 16px; border: none; border-radius: 4px; background: #eee; cursor: pointer; }
    .tab-btn.active { background: #009688; color: #fff; }
    .tab-content { display: none; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; }
    th { background: #f0f0f0; }
    img { height: 60px; cursor: pointer; border-radius: 4px; }
    .auth-input { display: flex; gap: 10px; margin: 10px 0; }
    .auth-input input { flex: 1; margin: 0; }
    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
    .modal-content { background: #fff; padding: 20px; border-radius: 8px; max-width: 90%; max-height: 90%; overflow: auto; }
    .modal-content img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="login-box" id="loginBox">
    <h3>管理员登录</h3>
    <input type="text" id="username" placeholder="账号" value="admin">
    <input type="password" id="pwd" placeholder="密码" value="123456">
    <button onclick="handleLogin()">立即登录</button>
  </div>

  <div class="container" id="mainBox">
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab(1)">实名审核</button>
      <button class="tab-btn" onclick="switchTab(2)">合同管理</button>
      <button class="tab-btn" onclick="switchTab(3)">授权账号</button>
    </div>

    <div class="tab-content" id="tab1" style="display:block;">
      <h4>用户实名审核列表</h4>
      <table>
        <tr>
          <th>用户ID</th><th>姓名</th><th>手机号</th><th>身份证号</th>
          <th>身份证正面</th><th>身份证反面</th><th>状态</th><th>操作</th>
        </tr>
        <tbody id="realnameBody"></tbody>
      </table>
    </div>

    <div class="tab-content" id="tab2">
      <h4>合同列表</h4>
      <table>
        <tr>
          <th>用户ID</th><th>出借人</th><th>借款人</th><th>金额</th>
          <th>年利率</th><th>状态</th>
        </tr>
        <tbody id="contractBody"></tbody>
      </table>
    </div>

    <div class="tab-content" id="tab3">
      <h4>授权打合同账号管理</h4>
      <div class="auth-input">
        <input type="text" id="authUserId" placeholder="输入要授权的用户ID">
        <button onclick="addAuth()">添加授权</button>
      </div>
      <table>
        <tr><th>授权用户ID</th><th>操作</th></tr>
        <tbody id="authBody"></tbody>
      </table>
    </div>
  </div>

  <div class="modal" id="imgModal" onclick="closeModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      < img id="previewImg" src="">
      <button onclick="closeModal()" style="margin-top:10px;">关闭</button>
    </div>
  </div>

<script>
  const BASE_URL = '';

  function handleLogin() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('pwd').value;
    fetch(BASE_URL + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, pwd: p })
    })
    .then(res => res.json())
    .then(data => {
      if (data.code === 200) {
        document.getElementById('loginBox').style.display = 'none';
        document.getElementById('mainBox').style.display = 'block';
        loadRealname();
        loadContract();
        loadAuthList();
      } else {
        alert('登录失败：' + data.msg);
      }
    })
    .catch(err => alert('请求失败：服务未启动'));
  }

  function switchTab(n) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab' + n).style.display = 'block';
  }

  function loadRealname() {
    fetch(BASE_URL + '/api/realname/list')
    .then(res => res.json())
    .then(data => {
      let html = '';
      data.data.forEach(item => {
        const status = item.status === 0 ? '待审核' : item.status === 1 ? '已通过' : '已驳回';
        html += '<tr>' +
          '<td>' + item.userId + '</td>' +
          '<td>' + item.realName + '</td>' +
          '<td>' + item.phone + '</td>' +
          '<td>' + item.idCard + '</td>' +
          '<td>< img src="' + item.cardFront + '" onclick="previewImg(\\'' + item.cardFront + '\\')"></td>' +
          '<td>< img src="' + item.cardBack + '" onclick="previewImg(\\'' + item.cardBack + '\\')"></td>' +
          '<td>' + status + '</td>' +
          '<td>' +
            '<button class="small" onclick="checkRealname(' + item.id + ', 1)">通过</button>' +
            '<button class="small" onclick="checkRealname(' + item.id + ', 2)">驳回</button>' +
          '</td>' +
        '</tr>';
      });
      document.getElementById('realnameBody').innerHTML = html;
    });
  }

  function checkRealname(id, status) {
    fetch(BASE_URL + '/api/realname/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.msg);
      loadRealname();
    });
  }

  function loadContract() {
    fetch(BASE_URL + '/api/contract/list')
    .then(res => res.json())
    .then(data => {
      let html = '';
      data.data.forEach(item => {
        const status = item.status === 1 ? '待签' : item.status === 2 ? '使用中' : item.status === 3 ? 
