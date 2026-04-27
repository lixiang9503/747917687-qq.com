const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🎉 服务部署成功啦！');
});

app.listen(port, () => {
  console.log(`服务运行在端口 ${port}`);
});