const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 登录接口
app.post('/api/login', (req, res) => {
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: '账号或密码错误' });
});

// 带完整登录逻辑的后台页面
app.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>管理员登录</title>
<style>
body { font-family: Arial; background: #f5f5f5; margin: 0; padding: 0; }
.login-box { width: 300px; margin: 100px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
h3 { text-align: center; margin-bottom: 20px; }
input { width: 100%; box-sizing: border-box; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
button { width: 100%; padding: 10px; background: #009688; color: #fff; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }
#main { display: none; width: 90%; max-width: 1200px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
</style>
</head>
<body>
  <div class="login-box" id="loginBox">
    <h3>管理员登录</h3>
    <input type="text" id="username" placeholder="账号" value="admin">
    <input type="password" id="pwd" placeholder="密码" value="123456">
    <button onclick="doLogin()">立即登录</button>
  </div>

  <div id="main">
    <h1 style="text-align: center;">欢迎进入后台管理系统！</h1>
    <p style="text-align: center;">现在登录功能已经正常了，接下来我们会加上实名审核和合同管理功能。</p >
  </div>

<script>
function doLogin() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('pwd').value;
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, pwd: p })
  })
  .then(res => res.json())
  .then(data => {
    if (data.code === 200) {
      alert('登录成功！');
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('main').style.display = 'block';
    } else {
      alert('登录失败：' + data.msg);
    }
  })
  .catch(err => {
    alert('请求出错，请稍后再试');
    console.error(err);
  });
}
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log('服务已启动，端口：' + PORT);
});
