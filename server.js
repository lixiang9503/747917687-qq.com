const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== 数据存储（永久保存）==========
const DB_PATH = './db.json';
let db = {
  users: [
    { username:"admin",pwd:"123456",role:"super" }
  ],
  blackList: [],
  realName: [],
  contract: []
};

// 读取本地数据库
function loadDB(){
  try{
    let txt = fs.readFileSync(DB_PATH,'utf-8');
    db = JSON.parse(txt);
  }catch(e){ saveDB(); }
}
function saveDB(){
  fs.writeFileSync(DB_PATH,JSON.stringify(db,null,2));
}
loadDB();

// ========== 跨域+服务 ==========
const server = http.createServer((req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.writeHead(200);res.end();return;}

  let body = "";
  req.on("data",d=>body+=d);
  req.on("end",()=>{
    let post = {};
    if(body) try{post=JSON.parse(body);}catch(e){}

    // 1. 管理员登录
    if(req.url==="/api/login" && req.method==="POST"){
      let u = db.users.find(x=>x.username===post.username&&x.pwd===post.pwd);
      if(u){
        res.end(JSON.stringify({code:200,role:u.role}));
      }else{
        res.end(JSON.stringify({code:400,msg:"账号密码错误"}));
      }
      return;
    }

    // 2. 添加子账号（超管）
    if(req.url==="/api/addUser" && req.method==="POST"){
      if(!post.role||!post.username||!post.pwd){
        res.end(JSON.stringify({code:400}));return;
      }
      db.users.push({
        username:post.username,
        pwd:post.pwd,
        role:post.role
      });
      saveDB();
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 3. 小程序实名提交 自动通过 + 拉黑拦截
    if(req.url==="/api/submitRealName" && req.method==="POST"){
      if(db.blackList.includes(post.name)){
        res.end(JSON.stringify({code:400,msg:"该客户已被拉黑，禁止实名"}));
        return;
      }
      db.realName.push({
        id:Date.now(),
        name:post.name,
        idCard:post.idCard,
        status:"已通过",
        time:new Date().toLocaleString()
      });
      saveDB();
      res.end(JSON.stringify({code:200,msg:"实名认证自动通过"}));
      return;
    }

    // 4. 获取实名列表
    if(req.url==="/api/getRealName"){
      res.end(JSON.stringify({code:200,data:db.realName}));
      return;
    }

    // 5. 删除单条实名
    if(req.url==="/api/delRealName" && req.method==="POST"){
      db.realName = db.realName.filter(x=>x.id!==post.id);
      saveDB();
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 6. 拉黑客户
    if(req.url==="/api/addBlack" && req.method==="POST"){
      if(!db.blackList.includes(post.name)){
        db.blackList.push(post.name);
        saveDB();
      }
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 7. 新建合同
    if(req.url==="/api/addContract" && req.method==="POST"){
      db.contract.push({
        id:Date.now(),
        customerName:post.customerName,
        content:post.content,
        time:new Date().toLocaleString()
      });
      saveDB();
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 8. 获取合同列表
    if(req.url==="/api/getContract"){
      res.end(JSON.stringify({code:200,data:db.contract}));
      return;
    }

    // 9. 防休眠
    if(req.url==="/ping"){
      res.end(JSON.stringify({code:200}));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });
});

const port = process.env.PORT||10000;
server.listen(port,()=>{
  console.log("服务启动成功");
});
