const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 全局数据存储（自动本地文件数据库，无需账号密码）==========
const DB_PATH = path.join(__dirname, './db.json');

// 初始化空数据库
function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      user: [],
      realname: [],
      contract: [],
      power: []
    }, null, 2))
  }
}
initDB();

// 读取数据库
function getDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
}

// 保存数据库
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

// ========== 1.后台管理员登录接口 ==========
app.post('/admin/login', (req, res) => {
  const { username, pwd } = req.body;
  if(username === 'admin' && pwd === '123456'){
    return res.json({code:200,msg:'登录成功',token:'admin888'})
  }
  res.json({code:0,msg:'账号密码错误'})
})

// ========== 2.客户实名提交（实时存入后台） ==========
app.post('/api/realname', (req, res) => {
  const db = getDB();
  const info = {
    id: Date.now(),
    userId: req.body.userId,
    realName: req.body.realName,
    idCard: req.body.idCard,
    phone: req.body.phone,
    cardFront: req.body.cardFront,
    cardBack: req.body.cardBack,
    status: 0,
    createTime: new Date().toLocaleString()
  }
  db.realname.unshift(info);
  saveDB(db);
  res.json({code:200,msg:'实名提交成功，后台实时已收到'})
})

// ========== 3.后台获取全部实名列表 ==========
app.get('/admin/realname/list', (req, res) => {
  const db = getDB();
  res.json({code:200,data:db.realname})
})

// ========== 4.实名审核 通过/驳回 ==========
app.post('/admin/realname/check', (req, res) => {
  const {id,status} = req.body;
  const db = getDB();
  db.realname = db.realname.map(item=>{
    if(item.id == id) item.status = status;
    return item;
  })
  saveDB(db);
  res.json({code:200,msg:'操作成功'})
})

// ========== 5.合同权限：开启/关闭打合同 ==========
app.post('/admin/user/power', (req, res) => {
  const {userId,canContract} = req.body;
  const db = getDB();
  let find = db.power.find(v=>v.userId===userId);
  if(find){
    find.canContract = canContract
  }else{
    db.power.push({userId,canContract})
  }
  saveDB(db);
  res.json({code:200})
})

// ========== 6.查询用户是否有打合同权限（小程序用） ==========
app.get('/api/user/power', (req, res) => {
  const userId = req.query.userId;
  const db = getDB();
  let find = db.power.find(v=>v.userId==userId);
  res.json({code:200,canContract: find ? find.canContract : 0})
})

// ========== 7.合同数据保存、后台查看全部合同 ==========
app.post('/api/contract/add',(req,res)=>{
  const db = getDB();
  const cont = {
    id: Date.now(),
    lendName: req.body.lendName,
    borrowName: req.body.borrowName,
    money: req.body.money,
    yearRate: req.body.yearRate,
    payWay: req.body.payWay,
    status: req.body.status || 1,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    createTime: new Date().toLocaleString()
  }
  db.contract.unshift(cont);
  saveDB(db);
  res.json({code:200,msg:'合同创建成功'})
})
app.get('/admin/contract/list',(req,res)=>{
  const db = getDB();
  res.json({code:200,data:db.contract})
})

// ========== 8.纯网页后台（直接访问就能用） ==========
app.get('/admin', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>借条管理后台</title>
<style>
body{margin:0;padding:20px;font-size:14px;}
.login-box{max-width:400px;margin:100px auto;border:1px solid #eee;padding:30px;border-radius:8px;}
input{width:100%;box-sizing:border-box;padding:10px;margin:8px 0;}
button{padding:10px 20px;background:#009688;color:#fff;border:none;border-radius:4px;cursor:pointer;}
.tab{margin:20px 0;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th,td{border:1px solid #ccc;padding:8px;text-align:center;}
img{height:60px;cursor:pointer;}
.hide{display:none;}
</style>
</head>
<body>
<div class="login-box" id="loginBox">
  <h3>管理员登录</h3>
  <input type="text" id="user" placeholder="账号" value="admin">
  <input type="password" id="pwd" placeholder="密码" value="123456">
  <button onclick="login()">立即登录</button>
</div>

<div id="mainBox" class="hide">
  <div class="tab">
    <button onclick="switchTab(1)">实时实名审核</button>
    <button onclick="switchTab(2)">全部合同管理</button>
  </div>

  <div id="tab1">
    <h4>客户实名列表（实时接收）</h4>
    <table>
      <tr>
        <th>用户ID</th>
        <th>姓名</th>
        <th>手机号</th>
        <th>身份证</th>
        <th>证件正反面</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
      <tbody id="realnameBody"></tbody>
    </table>
  </div>

  <div id="tab2" class="hide">
    <h4>全部合同</h4>
    <table>
      <tr>
        <th>出借人</th>
        <th>借款人</th>
        <th>金额</th>
        <th>年利率</th>
        <th>状态</th>
      </tr>
      <tbody id="contractBody"></tbody>
    </table>
  </div>

</div>

<script>
let token = '';
async function login(){
  let u = document.getElementById('user').value;
  let p = document.getElementById('pwd').value;
  let res = await fetch('/admin/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:u,pwd:p})
  }).then(d=>d.json());
  if(res.code===200){
    token = res.token;
    document.getElementById('loginBox').classList.add('hide');
    document.getElementById('mainBox').classList.remove('hide');
    loadRealname();
    loadContract();
  }else{
    alert('账号密码错误');
  }
}
function switchTab(n){
  document.getElementById('tab1').classList.add('hide');
  document.getElementById('tab2').classList.add('hide');
  document.getElementById('tab'+n).classList.remove('hide');
}
async function loadRealname(){
  let res = await fetch('/admin/realname/list').then(d=>d.json());
  let html = '';
  res.data.forEach(item=>{
    let st = item.status===0?'待审核':item.status===1?'已通过':'已驳回';
    html += '<tr>' +
      '<td>' + item.userId + '</td>' +
      '<td>' + item.realName + '</td>' +
      '<td>' + item.phone + '</td>' +
      '<td>' + item.idCard + '</td>' +
      '<td>' +
        '< img src="' + item.cardFront + '" onclick="openImg(\'' + item.cardFront + '\')">' +
        '< img src="' + item.cardBack + '" onclick="openImg(\'' + item.cardBack + '\')">' +
      '</td>' +
      '<td>' + st + '</td>' +
      '<td>' +
        '<button onclick="checkReal(' + item.id + ',1)">通过</button>' +
        '<button onclick="checkReal(' + item.id + ',2)">驳回</button>' +
      '</td>' +
    '</tr>';
  })
  document.getElementById('realnameBody').innerHTML = html;
}
async function checkReal(id,st){
  await fetch('/admin/realname/check',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,status:st})
  })
  loadRealname();
}
async function loadContract(){
  let res = await fetch('/admin/contract/list').then(d=>d.json());
  let html='';
  res.data.forEach(item=>{
    let statusText = item.status==1?'待签':item.status==2?'使用中':item.status==3?'已逾期':'已结清';
    html += '<tr>' +
      '<td>' + (item.lendName||'') + '</td>' +
      '<td>' + (item.borrowName||'') + '</td>' +
      '<td>' + (item.money||'') + '</td>' +
      '<td>' + (item.yearRate||'') + '</td>' +
      '<td>' + statusText + '</td>' +
    '</tr>';
  })
  document.getElementById('contractBody').innerHTML = html;
}
function openImg(url){
  window.open(url)
}
</script>
</body>
</html>
  `
  res.send(html)
})

// 启动服务
app.listen(PORT, () => {
  console.log('服务运行成功，端口：',PORT)
});
