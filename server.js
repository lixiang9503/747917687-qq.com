const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 跨域设置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json());

// ========== 数据存储初始化 ==========
const DB_PATH = path.join(__dirname, './db.json');
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({
    realname: [],
    contract: []
  }, null, 2))
}

function getDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

// ========== 1. 后台登录接口 ==========
app.post('/admin/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: '账号或密码错误' });
});

// ========== 2. 实名审核接口 ==========
app.post('/api/realname', (req, res) => {
  const db = getDB();
  db.realname.unshift({
    id: Date.now(),
    userId: req.body.userId,
    realName: req.body.realName,
    phone: req.body.phone,
    idCard: req.body.idCard,
    cardFront: req.body.cardFront,
    cardBack: req.body.cardBack,
    status: 0
  });
  saveDB(db);
  res.json({ code: 200, msg: '提交成功' });
});

app.get('/admin/realname/list', (req, res) => {
  res.json({ code: 200, data: getDB().realname });
});

app.post('/admin/realname/check', (req, res) => {
  const db = getDB();
  db.realname = db.realname.map(item => {
    if (item.id === req.body.id) item.status = req.body.status;
    return item;
  });
  saveDB(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ========== 3. 合同管理接口 ==========
app.post('/api/contract/add', (req, res) => {
  const db = getDB();
  db.contract.unshift({
    id: Date.now(),
    lendName: req.body.lendName,
    borrowName: req.body.borrowName,
    money: req.body.money,
    yearRate: req.body.yearRate,
    status: 1
  });
  saveDB(db);
  res.json({ code: 200, msg: '创建成功' });
});

app.get('/admin/contract/list', (req, res) => {
  res.json({ code: 200, data: getDB().contract });
});

// ========== 4. 完整后台页面（纯字符串拼接，无语法问题） ==========
app.get('/admin', (req, res) => {
  const html =
'<!DOCTYPE html>' +
'<html lang="zh-CN">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <title>借条管理后台</title>' +
'  <style>' +
'    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }' +
'    .login-card { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px; margin: 100px auto; }' +
'    h3 { text-align: center; margin-bottom: 20px; }' +
'    input { width: 100%; box-sizing: border-box; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }' +
'    button { width: 100%; padding: 10px; background-color: #009688; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }' +
'    .container { display: none; width: 90%; max-width: 1200px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }' +
'    .tab-btn { margin: 0 5px; padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; }' +
'    .tab-btn.active { background: #009688; color: #fff; }' +
'    table { width: 100%; border-collapse: collapse; margin-top: 20px; }' +
'    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }' +
'    th { background: #f0f0f0; }' +
'    img { height: 60px; cursor: pointer; }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="login-card" id="loginBox">' +
'    <h3>管理员登录</h3>' +
'    <input type="text" id="username" placeholder="账号" value="admin">' +
'    <input type="password" id="password" placeholder="密码" value="123456">' +
'    <button onclick="handleLogin()">立即登录</button>' +
'  </div>' +
'  <div class="container" id="mainBox">' +
'    <div>' +
'      <button class="tab-btn active" onclick="switchTab(1)">实名审核</button>' +
'      <button class="tab-btn" onclick="switchTab(2)">合同管理</button>' +
'    </div>' +
'    <div id="tab1">' +
'      <h4>客户实名列表</h4>' +
'      <table>' +
'        <tr><th>用户ID</th><th>姓名</th><th>手机号</th><th>状态</th><th>证件照片</th><th>操作</th></tr>' +
'        <tbody id="realnameBody"></tbody>' +
'      </table>' +
'    </div>' +
'    <div id="tab2" style="display: none;">' +
'      <h4>合同列表</h4>' +
'      <table>' +
'        <tr><th>出借人</th><th>借款人</th><th>金额</th><th>年利率</th><th>状态</th></tr>' +
'        <tbody id="contractBody"></tbody>' +
'      </table>' +
'    </div>' +
'  </div>' +
'  <script>' +
'    function handleLogin() {' +
'      const username = document.getElementById("username").value;' +
'      const password = document.getElementById("password").value;' +
'      fetch("/admin/login", {' +
'        method: "POST",' +
'        headers: { "Content-Type": "application/json" },' +
'        body: JSON.stringify({ username: username, pwd: password })' +
'      })' +
'      .then(res => res.json())' +
'      .then(data => {' +
'        if (data.code === 200) {' +
'          document.getElementById("loginBox").style.display = "none";' +
'          document.getElementById("mainBox").style.display = "block";' +
'          loadRealname();' +
'          loadContract();' +
'        } else {' +
'          alert("登录失败：" + data.msg);' +
'        }' +
'      })' +
'      .catch(err => alert("请求失败：服务未启动"));' +
'    }' +
'    function switchTab(n) {' +
'      document.querySelectorAll(".tab-btn").forEach(function(btn) { btn.classList.remove("active"); });' +
'      event.target.classList.add("active");' +
'      document.getElementById("tab1").style.display = n === 1 ? "block" : "none";' +
'      document.getElementById("tab2").style.display = n === 2 ? "block" : "none";' +
'    }' +
'    function loadRealname() {' +
'      fetch("/admin/realname/list")' +
'      .then(res => res.json())' +
'      .then(data => {' +
'        let html = "";' +
'        data.data.forEach(function(item) {' +
'          const st = item.status === 0 ? "待审核" : item.status === 1 ? "已通过" : "已驳回";' +
'          html += "<tr>" +' +
'            "<td>" + item.userId + "</td>" +' +
'            "<td>" + item.realName + "</td>" +' +
'            "<td>" + item.phone + "</td>" +' +
'            "<td>" + st + "</td>" +' +
'            "<td>" +' +
'              "< img src=\'" + item.cardFront + "\' onclick=\'openImg(\"" + item.cardFront + "\")\'>" +' +
'              "< img src=\'" + item.cardBack + "\' onclick=\'openImg(\"" + item.cardBack + "\")\'>" +' +
'            "</td>" +' +
'            "<td>" +' +
'              "<button onclick=\'check(" + item.id + ", 1)\'>通过</button>" +' +
'              "<button onclick=\'check(" + item.id + ", 2)\'>驳回</button>" +' +
'            "</td>" +' +
'          "</tr>";' +
'        });' +
'        document.getElementById("realnameBody").innerHTML = html;' +
'      });' +
'    }' +
'    function check(id, status) {' +
'      fetch("/admin/realname/check", {' +
'        method: "POST",' +
'        headers: { "Content-Type": "application/json" },' +
'        body: JSON.stringify({ id: id, status: status })' +
'      }).then(() => loadRealname());' +
'    }' +
'    function loadContract() {' +
'      fetch("/admin/contract/list")' +
'      .then(res => res.json())' +
'      .then(data => {' +
'        let html = "";' +
'        data.data.forEach(function(item) {' +
'          const st = item.status === 1 ? "待签" : item.status === 2 ? "使用中" : item.status === 3 ? "已逾期" : "已结清";' +
'          html += "<tr>" +' +
'            "<td>" + (item.lendName || "") + "</td>" +' +
'            "<td>" + (item.borrowName || "") + "</td>" +' +
'            "<td>" + (item.money || "") + "</td>" +' +
'            "<td>" + (item.yearRate || "") + "</td>" +' +
'            "<td>" + st + "</td>" +' +
'          "</tr>";' +
'        });' +
'        document.getElementById("contractBody").innerHTML = html;' +
'      });' +
'    }' +
'    function openImg(url) {' +
'      window.open(url);' +
'    }' +
'  </script>' +
'</body>' +
'</html>';
  res.send(html);
});

// 启动服务
app.listen(PORT, () => {
  console.log('服务已启动，端口：' + PORT);
});
