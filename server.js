const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 初始化数据存储 ==========
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

// ========== 后台登录接口 ==========
app.post('/admin/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' })
  }
  res.json({ code: 0, msg: 'fail' })
})

// ========== 后台页面（修复了所有语法问题） ==========
app.get('/admin', (req, res) => {
  const html =
'<!DOCTYPE html>\
<html lang="zh-CN">\
<head>\
  <meta charset="UTF-8">\
  <title>借条后台</title>\
  <style>\
    body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }\
    .login-box { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; }\
    h3 { margin-top: 0; text-align: center; }\
    input { width: 100%; box-sizing: border-box; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }\
    button { width: 100%; padding: 10px; background: #009688; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }\
    button:hover { background: #00796b; }\
    #main { display: none; width: 90%; max-width: 1200px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }\
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }\
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }\
    th { background: #f0f0f0; }\
    .tab-btn { margin: 0 5px; }\
  </style>\
</head>\
<body>\
  <div class="login-box" id="loginBox">\
    <h3>管理员登录</h3>\
    <input type="text" id="user" placeholder="账号" value="admin">\
    <input type="password" id="pwd" placeholder="密码" value="123456">\
    <button onclick="doLogin()">立即登录</button>\
  </div>\
\
  <div id="main">\
    <div>\
      <button class="tab-btn" onclick="showTab(1)">实名审核</button>\
      <button class="tab-btn" onclick="showTab(2)">合同管理</button>\
    </div>\
    <div id="tab1">\
      <h4>客户实名列表</h4>\
      <table>\
        <tr><th>用户ID</th><th>姓名</th><th>手机号</th><th>状态</th><th>操作</th></tr>\
        <tbody id="realnameBody"></tbody>\
      </table>\
    </div>\
    <div id="tab2" style="display: none;">\
      <h4>合同列表</h4>\
      <table>\
        <tr><th>出借人</th><th>借款人</th><th>金额</th><th>状态</th></tr>\
        <tbody id="contractBody"></tbody>\
      </table>\
    </div>\
  </div>\
\
<script>\
  function doLogin() {\
    const u = document.getElementById("user").value;\
    const p = document.getElementById("pwd").value;\
    fetch("/admin/login", {\
      method: "POST",\
      headers: { "Content-Type": "application/json" },\
      body: JSON.stringify({ username: u, pwd: p })\
    })\
    .then(res => res.json())\
    .then(data => {\
      if (data.code === 200) {\
        document.getElementById("loginBox").style.display = "none";\
        document.getElementById("main").style.display = "block";\
        loadRealname();\
        loadContract();\
      } else {\
        alert("账号密码错误");\
      }\
    })\
    .catch(err => {\
      alert("服务未启动，请稍后再试");\
    });\
  }\
\
  function showTab(n) {\
    document.getElementById("tab1").style.display = "none";\
    document.getElementById("tab2").style.display = "none";\
    document.getElementById("tab" + n).style.display = "block";\
  }\
\
  function loadRealname() {\
    fetch("/admin/realname/list")\
    .then(res => res.json())\
    .then(data => {\
      let html = "";\
      data.data.forEach(item => {\
        const st = item.status === 0 ? "待审核" : item.status === 1 ? "已通过" : "已驳回";\
        html += "<tr>"+"<td>"+item.userId+"</td>"+"<td>"+item.realName+"</td>"+"<td>"+item.phone+"</td>"+"<td>"+st+"</td>"+"<td>"+"<button onclick=\"check("+item.id+", 1)\">通过</button>"+"<button onclick=\"check("+item.id+", 2)\">驳回</button>"+"</td>"+"</tr>";\
      });\
      document.getElementById("realnameBody").innerHTML = html;\
    });\
  }\
\
  function check(id, status) {\
    fetch("/admin/realname/check", {\
      method: "POST",\
      headers: { "Content-Type": "application/json" },\
      body: JSON.stringify({ id, status })\
    }).then(() => loadRealname());\
  }\
\
  function loadContract() {\
    fetch("/admin/contract/list")\
    .then(res => res.json())\
    .then(data => {\
      let html = "";\
      data.data.forEach(item => {\
        const st = item.status === 1 ? "待签" : item.status === 2 ? "使用中" : item.status === 3 ? "已逾期" : "已结清";\
        html += "<tr>"+"<td>"+(item.lendName || "")+"</td>"+"<td>"+(item.borrowName || "")+"</td>"+"<td>"+(item.money || "")+"</td>"+"<td>"+st+"</td>"+"</tr>";\
      });\
      document.getElementById("contractBody").innerHTML = html;\
    });\
  }\
</script>\
</body>\
</html>';
  res.send(html);
});

// 实名相关接口
app.post('/api/realname', (req, res) => {
  const db = getDB();
  db.realname.unshift({
    id: Date.now(),
    userId: req.body.userId,
    realName: req.body.realName,
    phone: req.body.phone,
    status: 0
  });
  saveDB(db);
  res.json({ code: 200, msg: 'ok' });
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
  res.json({ code: 200 });
});

// 合同相关接口
app.post('/api/contract/add', (req, res) => {
  const db = getDB();
  db.contract.unshift({
    id: Date.now(),
    ...req.body,
    status: 1
  });
  saveDB(db);
  res.json({ code: 200, msg: 'ok' });
});

app.get('/admin/contract/list', (req, res) => {
  res.json({ code: 200, data: getDB().contract });
});

app.listen(PORT, () => {
  console.log('服务启动成功，端口：' + PORT);
});
