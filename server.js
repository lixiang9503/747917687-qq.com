const http = require('http');
const fs = require('fs');

let db = {
  users: [{username:"admin",pwd:"123456"}],
  black:[],
  real:[],
  contract:[]
};
const dbFile = "./db.json";
function save(){fs.writeFileSync(dbFile,JSON.stringify(db,null,2))}
try{db=JSON.parse(fs.readFileSync(dbFile,"utf8"))}catch{e=>save()}

const srv = http.createServer((req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.writeHead(200);res.end();return;}

  let body="";
  req.on("data",d=>body+=d);
  req.on("end",()=>{
    let post = body?JSON.parse(body):{};

    // 小程序实名提交 自动通过
    if(req.url==="/api/submitRealName"&&req.method==="POST"){
      if(db.black.includes(post.name)){
        res.end(JSON.stringify({code:400,msg:"已拉黑"}));
        return;
      }
      db.real.push({
        id:Date.now(),
        name:post.name,
        idCard:post.idCard,
        status:"已通过",
        time:new Date().toLocaleString()
      });
      save();
      res.end(JSON.stringify({code:200,msg:"实名认证自动通过"}));
      return;
    }

    // 后台获取实名
    if(req.url==="/api/getReal"){
      res.end(JSON.stringify({code:200,data:db.real}));
      return;
    }

    // 删除实名
    if(req.url==="/api/delReal"&&req.method==="POST"){
      db.real = db.real.filter(x=>x.id!==post.id);
      save();
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 拉黑
    if(req.url==="/api/black"&&req.method==="POST"){
      if(!db.black.includes(post.name))db.black.push(post.name);
      save();
      res.end(JSON.stringify({code:200}));
      return;
    }

    // 登录
    if(req.url==="/api/login"&&req.method==="POST"){
      let ok = db.users.find(x=>x.username===post.username&&x.pwd===post.pwd);
      res.end(ok?JSON.stringify({code:200}):JSON.stringify({code:400}));
      return;
    }

    // 防休眠
    if(req.url==="/ping"){
      res.end(JSON.stringify({code:200}));
      return;
    }

    res.writeHead(404);res.end("");
  })
});

const port = process.env.PORT||10000;
srv.listen(port,()=>console.log("服务正常"));
