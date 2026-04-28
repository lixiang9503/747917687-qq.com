const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 必须开启跨域，否则浏览器会拦截请求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 解析JSON请求体
app.use(express.json());

// 1. 后台登录接口（和前端请求完全匹配）
app.post('/admin/login', (req, res) => {
  console.log('收到登录请求:', req.body); // 打印请求日志，方便排查
  const { username, pwd } = req.body;
  if (username === 'admin' && pwd === '123456') {
    return res.json({ code: 200, msg: 'success' });
  }
  res.json({ code: 0, msg: '账号或密码错误' });
});

// 2. 后台登录页面（修复了所有JS语法问题）
app.get('/admin', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>借条管理后台</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .login-card {
      background: #fff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      width: 300px;
    }
    h3 {
      text-align: center;
      margin-bottom: 20px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px;
      margin: 10px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    button {
      width: 100%;
      padding: 10px;
      background-color: #009688;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    button:hover {
      background-color: #00796b;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <h3>管理员登录</h3>
    <input type="text" id="username" placeholder="账号" value="admin">
    <input type="password" id="password" placeholder="密码" value="123456">
    <button onclick="handleLogin()">立即登录</button>
  </div>

  <script>
    function handleLogin() {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      // 发送登录请求
      fetch('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username, pwd: password })
      })
      .then(response => response.json())
      .then(data => {
        if (data.code === 200) {
          alert('登录成功！即将进入后台');
          // 登录成功后跳转到后台主界面（这里先简化为提示）
          document.body.innerHTML = '<h1 style="text-align:center;margin-top:100px;">欢迎进入后台管理系统！</h1>';
        } else {
          alert('登录失败：' + data.msg);
        }
      })
      .catch(error => {
        alert('请求失败：服务未启动或网络错误');
        console.error('Error:', error);
      });
    }
  </script>
</body>
</html>
`;
  res.send(html);
});

// 启动服务
app.listen(PORT, () => {
  console.log(`服务已启动，端口：${PORT}`);
});
