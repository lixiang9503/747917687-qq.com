const express = require('express');
const cors = require('cors');
const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 模拟数据库，用来存实名信息
let realNameList = [];

// 实名认证提交接口（自动通过）
app.post('/api/submit', (req, res) => {
  const { userId, name, phone, idCard } = req.body;
  
  // 保存数据
  realNameList.push({
    userId,
    name,
    phone,
    idCard,
    status: 'approved' // 直接标记为通过
  });

  // 直接返回成功
  res.json({
    code: 200,
    message: "实名认证自动通过",
    data: { status: "approved" }
  });
});

// 给后台管理系统用的接口，获取所有实名列表
app.get('/api/list', (req, res) => {
  res.json({
    code: 200,
    data: realNameList
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
});
