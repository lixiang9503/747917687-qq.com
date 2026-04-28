const http = require('http');
const fs = require('fs');
const path = require('path');

// 数据库文件路径
const DB_PATH = './db.json';
let db = {
  users: [{ username: "admin", pwd: "123456", role: "super" }],
  blackList: [],
  realName: [],
  contract: []
};

// 读取本地数据库
function loadDB() {
  try {
    let txt = fs.readFileSync(DB_PATH, 'utf-8');
    db = JSON.parse(txt);
  } catch (e) {
    saveDB();
  }
}
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
loadDB();

const server = http.createServer((req, res) => {
  // 跨域配置，允许小程序和后台访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let post = {};
    if (body) {
      try { post = JSON.parse(body); } catch (e) {}
    }

    // 1. 小程序实名提交接口（和小程序完全对齐）
    if (req.url === '/api/submitRealName' && req.method === 'POST') {
      // 先检查是否在黑名单
      if (db.blackList.includes(post.name)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, msg: "该客户已被拉黑，禁止实名" }));
        return;
      }
      // 保存数据
      db.realName.push({
        id: Date.now(),
        name: post.name,
        idCard: post.idCard,
        status: "已通过",
        time: new Date().toLocaleString()
      });
      saveDB();
      // 直接返回成功
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, msg: "实名认证自动通过" }));
      return;
    }

    // 2. 后台获取实名列表接口
    if (req.url === '/api/getRealName' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data: db.realName }));
      return;
    }

    // 3. 管理员登录接口
    if (req.url === '/api/login' && req.method === 'POST') {
      let u = db.users.find(x => x.username === post.username && x.pwd === post.pwd);
      if (u) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 200, role: u.role }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 400, msg: "账号密码错误" }));
      }
      return;
    }

    // 4. 其他接口（拉黑、删除、合同）
    if (req.url === '/api/delRealName' && req.method === 'POST') {
      db.realName = db.realName.filter(x => x.id !== post.id);
      saveDB();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200 }));
      return;
    }
    if (req.url === '/api/addBlack' && req.method === 'POST') {
      if (!db.blackList.includes(post.name)) {
        db.blackList.push(post.name);
        saveDB();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200 }));
      return;
    }
    if (req.url === '/api/addContract' && req.method === 'POST') {
      db.contract.push({
        id: Date.now(),
        customerName: post.customerName,
        content: post.content,
        time: new Date().toLocaleString()
      });
      saveDB();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200 }));
      return;
    }
    if (req.url === '/api/getContract' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data: db.contract }));
      return;
    }

    // 防休眠接口
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200 }));
      return;
    }

    // 其他路径返回404
    res.writeHead(404);
    res.end("Not Found");
  });
});

const port = process.env.PORT || 10000;
server.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
});
