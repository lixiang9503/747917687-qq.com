const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 跨域（最简）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json());

// 初始化空数据
const DB_PATH = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ realname: [], contract: [] }));
}
function getDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function saveDB(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }

// 登录接口（最简单）
app.post('/admin/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200 });
  }
  res.json({ code: 0 });
});

// 实名、合同接口（保留功能）
app.post('/api/realname', (req, res) => {
  const db = getDB();
  db.realname.unshift({ id: Date.now(), ...req.body, status: 0 });
  saveDB(db);
  res.json({ code: 200 });
});
app.get('/admin/realname/list', (req, res) => res.json({ code: 200, data: getDB().realname }));
app.post('/admin/realname/check', (req, res) => {
  const db = getDB();
  db.realname = db.realname.map(x => x.id === req.body.id ? {...x, status: req.body.status} : x);
  saveDB(db);
  res.json({ code: 200 });
});
app.post('/api/contract/add', (req, res) => {
  const db = getDB();
  db.contract.unshift({ id: Date.now(), ...req.body, status: 1 });
  saveDB(db);
  res.json({ code: 200 });
});
app.get('/admin/contract/list', (req, res) => res.json({ code: 200, data: getDB().contract }));

// 后台页面（JS 最简单、无任何特殊符号）
app.get('/admin', (req, res) => {
  const html =
'<!DOCTYPE html>'+
'<html>'+
'<head>'+
'<meta charset="UTF-8">'+
'<title>后台登录</title>'+
'<style>'+
'body{background:#f5f5f5;font-family:Arial;}'+
'.login{width:300px;margin:100px auto;background:#fff;padding:30px;border-radius:8px;}'+
'input{width:100%;box-sizing:border-box;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:4px;}'+
'button{width:100%;padding:10px;background:#009688;color:#fff;border:none;border-radius:4px;font-size:16px;}'+
'.container{display:none;width:90%;margin:20px auto;background:#fff;padding:20px;border-radius:8px;}'+
'.tab{margin:10px 0;}'+
'.tab button{width:auto;padding:8px 16px;margin:0 5px;}'+
'table{width:100%;border-collapse:collapse;margin-top:20px;}'+
'th,td{border:1px solid #ddd;padding:8px;text-align:center;}'+
'img{height:60px;}'+
'</style>'+
'</head>'+
'<body>'+

'<div class="login" id="loginBox">'+
'<h3>管理员登录</h3>'+
'<input type="text" id="username" value="admin" placeholder="账号">'+
'<input type="password" id="pwd" value="123456" placeholder="密码">'+
'<button onclick="login()">登录</button>'+
'</div>'+

'<div class="container" id="mainBox">'+
'<div class="tab">'+
'<button onclick="switchTab(1)">实名审核</button>'+
'<button onclick="switchTab(2)">合同管理</button>'+
'</div>'+

'<div id="tab1">'+
'<h4>实名列表</h4>'+
'<table><tr><th>姓名</th><th>手机</th><th>状态</th><th>操作</th></tr><tbody id="rlist"></tbody></table>'+
'</div>'+

'<div id="tab2" style="display:none">'+
'<h4>合同列表</h4>'+
'<table><tr><th>出借人</th><th>借款人</th><th>金额</th></tr><tbody id="clist"></tbody></table>'+
'</div>'+
'</div>'+

'<script>'+
'function login(){'+
'  var u=document.getElementById("username").value;'+
'  var p=document.getElementById("pwd").value;'+
'  fetch("/admin/login",{'+
'    method:"POST",'+
'    headers:{"Content-Type":"application/json"},'+
'    body:JSON.stringify({username:u,pwd:p})'+
'  })'+
'  .then(function(r){return r.json();})'+
'  .then(function(d){'+
'    if(d.code===200){'+
'      document.getElementById("loginBox").style.display="none";'+
'      document.getElementById("mainBox").style.display="block";'+
'      loadReal();loadCon();'+
'    }else{alert("登录失败");}'+
'  })'+
'  .catch(function(){alert("请求出错");});'+
'}'+

'function switchTab(n){'+
'  document.getElementById("tab1").style.display=n===1?"block":"none";'+
'  document.getElementById("tab2").style.display=n===2?"block":"none";'+
'}'+

'function loadReal(){'+
'  fetch("/admin/realname/list")'+
'  .then(function(r){return r.json();})'+
'  .then(function(d){'+
'    var html="";'+
'    d.data.forEach(function(item){'+
'      var st=item.status===0?"待审核":item.status===1?"已通过":"已驳回";'+
'      html+="<tr><td>"+item.realName+"</td><td>"+item.phone+"</td><td>"+st+"</td>"+
'      "<td><button onclick=\"check("+item.id+",1)\">通过</button>"+
'      "<button onclick=\"check("+item.id+",2)\">驳回</button></td></tr>";'+
'    });'+
'    document.getElementById("rlist").innerHTML=html;'+
'  });'+
'}'+

'function check(id,st){'+
'  fetch("/admin/realname/check",{'+
'    method:"POST",'+
'    headers:{"Content-Type":"application/json"},'+
'    body:JSON.stringify({id:id,status:st})'+
'  }).then(function(){loadReal();});'+
'}'+

'function loadCon(){'+
'  fetch("/admin/contract/list")'+
'  .then(function(r){return r.json();})'+
'  .then(function(d){'+
'    var html="";'+
'    d.data.forEach(function(item){'+
'      html+="<tr><td>"+(item.lendName||"")+"</td><td>"+(item.borrowName||"")+"</td><td>"+(item.money||"")+"</td></tr>";'+
'    });'+
'    document.getElementById("clist").innerHTML=html;'+
'  });'+
'}'+
'</script>'+
'</body>'+
'</html>';

  res.send(html);
});

app.listen(PORT, () => console.log('ok', PORT));
