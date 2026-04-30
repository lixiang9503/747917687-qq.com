const http = require('http');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'xinyueqian_jwt_secret_2026';
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: 'postgresql://db_747917687_user:B5FdlA82EdRVvkYrNw21qKsWTDJMOMnS@dpg-d7pgjif7f7vs739jp71g-a/db_747917687',
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      openid TEXT PRIMARY KEY,
      realName TEXT DEFAULT '',
      idCard TEXT DEFAULT '',
      realStatus TEXT DEFAULT 'unverified',
      realTime TEXT DEFAULT '',
      createTime TEXT
    );
    CREATE TABLE IF NOT EXISTS real_applications (
      id BIGINT PRIMARY KEY,
      openid TEXT REFERENCES users(openid),
      realName TEXT,
      idCard TEXT,
      frontImg TEXT DEFAULT '',
      backImg TEXT DEFAULT '',
      status TEXT DEFAULT 'approved',
      time TEXT
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id BIGINT PRIMARY KEY,
      lenderOpenid TEXT REFERENCES users(openid),
      lenderName TEXT,
      lenderIdCard TEXT,
      borrowerOpenid TEXT DEFAULT '',
      borrowerName TEXT DEFAULT '',
      borrowerIdCard TEXT DEFAULT '',
      amount DECIMAL,
      amountChinese TEXT DEFAULT '',
      rate TEXT,
      reason TEXT DEFAULT 'other',
      payMethod TEXT DEFAULT 'other',
      startDate TEXT,
      endDate TEXT,
      repaymentMethod TEXT DEFAULT 'lumpSum',
      lenderSignature TEXT DEFAULT '',
      borrowerSignature TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      createTime TEXT
    );
    CREATE TABLE IF NOT EXISTS extensions (
      id SERIAL PRIMARY KEY,
      contractId BIGINT REFERENCES contracts(id),
      date TEXT,
      reason TEXT DEFAULT '手动延期',
      time TEXT
    );
    CREATE TABLE IF NOT EXISTS authorized_users (
      realName TEXT NOT NULL,
      idCard TEXT NOT NULL,
      PRIMARY KEY (realName, idCard)
    );
    CREATE TABLE IF NOT EXISTS black_accounts (
      openid TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS black_ips (
      ip TEXT PRIMARY KEY
    );
  `);
  console.log('数据库初始化完成');
}
initDB();

function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' }); }
function verifyToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; } }
function sendJson(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, 'http://' + req.headers.host);
  const path = url.pathname;
  let body = '';
  try { for await (const chunk of req) body += chunk; } catch (e) {}
  let post = {};
  try { post = body ? JSON.parse(body) : {}; } catch (e) {}

  const blackIps = (await pool.query('SELECT ip FROM black_ips')).rows.map(r => r.ip);
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection.remoteAddress || '';
  if (blackIps.includes(clientIp)) return sendJson(res, { code: 403, message: 'IP blocked' }, 403);

  // ========== 公共路由 ==========
  if (path === '/api/loan/login' && req.method === 'POST') {
    const { openid } = post;
    if (!openid) return sendJson(res, { code: 400 });
    const blacked = (await pool.query('SELECT openid FROM black_accounts WHERE openid=$1', [openid])).rows[0];
    if (blacked) return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
    let user = (await pool.query('SELECT * FROM users WHERE openid=$1', [openid])).rows[0];
    if (!user) {
      await pool.query('INSERT INTO users(openid, createTime) VALUES($1, $2)', [openid, new Date().toISOString()]);
      user = (await pool.query('SELECT * FROM users WHERE openid=$1', [openid])).rows[0];
    }
    const token = signToken({ openid: user.openid });
    return sendJson(res, { code: 200, message: 'Login success', token, user });
  }

  if (path === '/ping') return sendJson(res, { code: 200, message: 'ok' });

  // ========== 鉴权（后台跳过） ==========
  let currentUser = null;
  if (!path.startsWith('/api/admin/')) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return sendJson(res, { code: 401 }, 401);
    const decoded = verifyToken(auth.split(' ')[1]);
    if (!decoded) return sendJson(res, { code: 401 }, 401);
    currentUser = (await pool.query('SELECT * FROM users WHERE openid=$1', [decoded.openid])).rows[0];
    if (!currentUser) return sendJson(res, { code: 404 }, 404);
    const blacked = (await pool.query('SELECT openid FROM black_accounts WHERE openid=$1', [currentUser.openid])).rows[0];
    if (blacked) return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
  }

  // ========== 用户接口 ==========
  if (path === '/api/loan/realname' && req.method === 'POST') {
    const { realName, idCard, frontImg, backImg } = post;
    if (!realName || !idCard) return sendJson(res, { code: 400 });

    await pool.query(
      'UPDATE users SET realName=$1, idCard=$2, realStatus=$3, realTime=$4 WHERE openid=$5',
      [realName, idCard, 'verified', new Date().toLocaleString('zh-CN'), currentUser.openid]
    );

    await pool.query(
      'INSERT INTO real_applications(id, openid, realName, idCard, frontImg, backImg, status, time) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [Date.now(), currentUser.openid, realName, idCard, frontImg || '', backImg || '', 'approved', new Date().toLocaleString('zh-CN')]
    );

    currentUser = (await pool.query('SELECT * FROM users WHERE openid=$1', [currentUser.openid])).rows[0];
    return sendJson(res, { code: 200, user: currentUser });
  }

  if (path === '/api/loan/user/info' && req.method === 'GET') {
    return sendJson(res, { code: 200, user: currentUser });
  }

  if (path === '/api/loan/checkAuth' && req.method === 'GET') {
    const authorized = (await pool.query(
      'SELECT * FROM authorized_users WHERE realName=$1 AND idCard=$2',
      [currentUser.realname, currentUser.idcard]
    )).rows[0];
    return sendJson(res, { code: 200, authorized: !!authorized });
  }

  // ========== 合同接口 ==========
  if (path === '/api/loan/contract/list' && req.method === 'GET') {
    const contracts = (await pool.query('SELECT * FROM contracts ORDER BY id DESC')).rows;
    return sendJson(res, { code: 200, data: contracts });
  }

  if (path === '/api/loan/contract/detail' && req.method === 'GET') {
    const id = parseInt(url.searchParams.get('id'));
    const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [id])).rows[0];
    if (!contract) return sendJson(res, { code: 404 });
    contract.extensions = (await pool.query('SELECT * FROM extensions WHERE contractId=$1 ORDER BY id', [id])).rows;
    return sendJson(res, { code: 200, data: contract, isLender: contract.lenderopenid === currentUser.openid });
  }

  if (path === '/api/loan/contract/create' && req.method === 'POST') {
    if (currentUser.realstatus !== 'verified') return sendJson(res, { code: 400, message: '请先实名' });
    const authorized = (await pool.query(
      'SELECT * FROM authorized_users WHERE realName=$1 AND idCard=$2',
      [currentUser.realname, currentUser.idcard]
    )).rows[0];
    if (!authorized) return sendJson(res, { code: 403, message: '未授权' });

    const { amount, rate, reason, payMethod, startDate, endDate, lenderSignature, amountChinese } = post;
    const contract = {
      id: Date.now(),
      lenderopenid: currentUser.openid,
      lendername: currentUser.realname,
      lenderidcard: currentUser.idcard,
      amount: parseFloat(amount),
      amountchinese: amountChinese || '',
      rate,
      reason: reason || 'other',
      paymethod: payMethod || 'other',
      startdate: startDate,
      enddate: endDate,
      lendersignature: lenderSignature || '',
      status: 'pending',
      createtime: new Date().toLocaleString('zh-CN')
    };
    await pool.query(
      'INSERT INTO contracts(id,lenderopenid,lendername,lenderidcard,amount,amountchinese,rate,reason,paymethod,startdate,enddate,lendersignature,status,createtime) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [contract.id, contract.lenderopenid, contract.lendername, contract.lenderidcard, contract.amount, contract.amountchinese, contract.rate, contract.reason, contract.paymethod, contract.startdate, contract.enddate, contract.lendersignature, contract.status, contract.createtime]
    );
    return sendJson(res, { code: 200, contract });
  }

  if (path === '/api/loan/contract/sign' && req.method === 'POST') {
    if (currentUser.realstatus !== 'verified') return sendJson(res, { code: 400 });
    const { contractId, borrowerSignature } = post;
    await pool.query(
      'UPDATE contracts SET borroweropenid=$1, borrowername=$2, borroweridcard=$3, borrowersignature=$4, status=$5 WHERE id=$6',
      [currentUser.openid, currentUser.realname, currentUser.idcard, borrowerSignature || '', 'active', contractId]
    );
    return sendJson(res, { code: 200, message: 'Signed' });
  }

  if (path === '/api/loan/contract/extend' && req.method === 'POST') {
    const { contractId, newEndDate, reason } = post;
    const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [contractId])).rows[0];
    if (!contract || contract.lenderopenid !== currentUser.openid) return sendJson(res, { code: 403 });
    await pool.query('INSERT INTO extensions(contractId, date, reason, time) VALUES($1,$2,$3,$4)',
      [contractId, newEndDate, reason || '手动延期', new Date().toLocaleString('zh-CN')]);
    await pool.query('UPDATE contracts SET enddate=$1, status=$2 WHERE id=$3', [newEndDate, 'active', contractId]);
    return sendJson(res, { code: 200, message: 'Extended' });
  }

  if (path === '/api/loan/contract/close' && req.method === 'POST') {
    const { contractId } = post;
    const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [contractId])).rows[0];
    if (!contract || contract.lenderopenid !== currentUser.openid) return sendJson(res, { code: 403 });
    await pool.query('UPDATE contracts SET status=$1 WHERE id=$2', ['closed', contractId]);
    return sendJson(res, { code: 200, message: 'Closed' });
  }

  // ========== 后台管理 ==========
  if (path === '/api/admin/realname' && req.method === 'GET') {
    const data = (await pool.query('SELECT * FROM real_applications ORDER BY id DESC')).rows;
    return sendJson(res, { code: 200, data });
  }
  if (path === '/api/admin/contracts' && req.method === 'GET') {
    const data = (await pool.query('SELECT * FROM contracts ORDER BY id DESC')).rows;
    return sendJson(res, { code: 200, data });
  }
  if (path === '/api/admin/auth/list' && req.method === 'GET') {
    const data = (await pool.query('SELECT * FROM authorized_users')).rows;
    return sendJson(res, { code: 200, data });
  }
  if (path === '/api/admin/auth/add' && req.method === 'POST') {
    const { realName, idCard } = post;
    if (!realName || !idCard) return sendJson(res, { code: 400, message: '姓名和身份证号不能为空' });
    await pool.query(
      'INSERT INTO authorized_users(realName, idCard) VALUES($1, $2) ON CONFLICT DO NOTHING',
      [realName, idCard]
    );
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/auth/remove' && req.method === 'POST') {
    const { realName, idCard } = post;
    await pool.query('DELETE FROM authorized_users WHERE realName=$1 AND idCard=$2', [realName, idCard]);
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/users' && req.method === 'GET') {
    const users = (await pool.query('SELECT * FROM users')).rows;
    const authList = (await pool.query('SELECT * FROM authorized_users')).rows;
    const blackList = (await pool.query('SELECT openid FROM black_accounts')).rows.map(r => r.openid);
    const result = users.map(u => ({
      openid: u.openid,
      realName: u.realname,
      realStatus: u.realstatus,
      idCard: u.idcard,
      authorized: !!authList.find(a => a.realname === u.realname && a.idcard === u.idcard),
      blacked: blackList.includes(u.openid),
      realTime: u.realtime
    }));
    return sendJson(res, { code: 200, data: result });
  }
  if (path === '/api/admin/user/delete' && req.method === 'POST') {
    const { openid } = post;
    await pool.query('DELETE FROM users WHERE openid=$1', [openid]);
    await pool.query('DELETE FROM real_applications WHERE openid=$1', [openid]);
    await pool.query('DELETE FROM contracts WHERE lenderopenid=$1 OR borroweropenid=$1', [openid]);
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/black/account' && req.method === 'POST') {
    const { openid } = post;
    await pool.query('INSERT INTO black_accounts(openid) VALUES($1) ON CONFLICT DO NOTHING', [openid]);
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/black/unaccount' && req.method === 'POST') {
    const { openid } = post;
    await pool.query('DELETE FROM black_accounts WHERE openid=$1', [openid]);
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/black/ip' && req.method === 'POST') {
    const { ip } = post;
    await pool.query('INSERT INTO black_ips(ip) VALUES($1) ON CONFLICT DO NOTHING', [ip]);
    return sendJson(res, { code: 200 });
  }
  if (path === '/api/admin/black/unip' && req.method === 'POST') {
    const { ip } = post;
    await pool.query('DELETE FROM black_ips WHERE ip=$1', [ip]);
    return sendJson(res, { code: 200 });
  }

  sendJson(res, { code: 404 }, 404);
});

server.listen(PORT, () => console.log('Server running on port ' + PORT));
