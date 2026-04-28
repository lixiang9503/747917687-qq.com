const express = require('express');
const fs = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 最简单后台页面，无任何报错符号
app.get('/admin', (req, res) => {
  res.send(`
<html>
<head>
<meta charset="utf-8">
<title>登录</title>
</head>
<body>
<div style="width:300px;margin:80px auto;">
<h3>管理员登录</h3>
<input id="u" placeholder="admin" value="admin" style="width:100%;padding:8px;margin:8px 0;">
<input id="p" placeholder="密码" value="123456" style="width:100%;padding:8px;margin:8px 0;">
<button onclick="login()" style="width:100%;padding:10px;background:#009688;color:#fff;border:none;">登录</button>
</div>
<script>
function login(){
  alert('登录成功，后台正常了！')
}
</script>
</body>
</html>
  `)
})

app.listen(PORT,()=>{
  console.log('服务正常启动')
})
