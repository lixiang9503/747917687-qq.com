const http = require('http');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = 'xinyueqian_jwt_secret_2026';
const PORT = process.env.PORT || 10000;

// 创建上传目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 北京时间转换函数
function beijingTime() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toLocaleString('zh-CN');
}

// PostgreSQL 数据库连接
const pool = new Pool({
    connectionString: 'postgresql://db_747917687_user:B5FdlA82EdRVvkYrNw21qKsWTDJMOMnS@dpg-d7pgjif7f7vs739jp71g-a/db_747917687',
    ssl: { rejectUnauthorized: false }
});

// 初始化数据库表
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
        -- 新增：后台管理账号表
        CREATE TABLE IF NOT EXISTS admin_accounts (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff'  -- admin 或 staff
        );
    `);

    // 插入默认老板和员工账号（如果不存在）
    try {
        await pool.query(
            "INSERT INTO admin_accounts (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING",
            ['admin', 'xinyueqian2026', 'admin']
        );
        await pool.query(
            "INSERT INTO admin_accounts (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING",
            ['staff', 'staff123456', 'staff']
        );
    } catch (e) {
        console.error('插入默认账号失败:', e);
    }

    console.log('数据库初始化完成');
}
initDB();

// JWT 签名与验证
function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' }); }
function verifyToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; } }
function sendJson(res, data, code = 200) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

// 保存 base64 图片到本地文件，增强错误处理，失败时返回空字符串
function saveBase64Image(base64Data) {
    if (!base64Data || !base64Data.startsWith('data:image/')) return '';
    try {
        const matches = base64Data.match(/^data:image\/(.*);base64,(.*)$/);
        if (!matches) return '';
        const ext = matches[1] === 'png' ? 'png' : 'jpg';
        const data = matches[2];
        const filename = Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.' + ext;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
        return '/uploads/' + filename;
    } catch (e) {
        console.error('保存图片失败:', e);
        return ''; // 失败时返回空字符串，不抛出异常
    }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, 'http://' + req.headers.host);
    const reqPath = url.pathname;
    let body = '';
    try { for await (const chunk of req) body += chunk; } catch (e) {}
    let post = {};
    try { post = body ? JSON.parse(body) : {}; } catch (e) {}

    // ========== 静态文件：后台管理页面 ==========
    if (reqPath === '/admin.html' && req.method === 'GET') {
        const adminPath = path.join(__dirname, 'admin.html');
        if (fs.existsSync(adminPath)) {
            const htmlContent = fs.readFileSync(adminPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlContent);
        } else {
            res.writeHead(404);
            res.end('admin.html not found');
        }
        return;
    }

    // ========== 静态文件服务：访问上传的图片 ==========
    if (reqPath.startsWith('/uploads/')) {
        const filename = reqPath.replace('/uploads/', '');
        const filepath = path.join(uploadsDir, filename);
        if (fs.existsSync(filepath)) {
            const ext = path.extname(filename).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
            const data = fs.readFileSync(filepath);
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'max-age=86400' });
            res.end(data);
        } else {
            res.writeHead(404);
            res.end();
        }
        return;
    }

    // IP 黑名单检查
    const blackIps = (await pool.query('SELECT ip FROM black_ips')).rows.map(r => r.ip);
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection.remoteAddress || '';
    if (blackIps.includes(clientIp)) return sendJson(res, { code: 403, message: 'IP blocked' }, 403);

    // ========== 公共路由 ==========
    if (reqPath === '/api/loan/login' && req.method === 'POST') {
        const { openid } = post;
        if (!openid) return sendJson(res, { code: 400 });
        const blacked = (await pool.query('SELECT openid FROM black_accounts WHERE openid=$1', [openid])).rows[0];
        if (blacked) return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
        let user = (await pool.query('SELECT * FROM users WHERE openid=$1', [openid])).rows[0];
        if (!user) {
            await pool.query('INSERT INTO users(openid, createTime) VALUES($1, $2)', [openid, beijingTime()]);
            user = (await pool.query('SELECT * FROM users WHERE openid=$1', [openid])).rows[0];
        }
        const token = signToken({ openid: user.openid });
        return sendJson(res, { code: 200, message: 'Login success', token, user });
    }

    if (reqPath === '/ping') return sendJson(res, { code: 200, message: 'ok' });

    // ========== 后台登录接口 ==========
    if (reqPath === '/api/admin/login' && req.method === 'POST') {
        const { username, password } = post;
        if (!username || !password) return sendJson(res, { code: 400, message: '账号和密码不能为空' });
        const admin = (await pool.query('SELECT * FROM admin_accounts WHERE username=$1 AND password=$2', [username, password])).rows[0];
        if (!admin) return sendJson(res, { code: 401, message: '账号或密码错误' }, 401);
        const adminToken = signToken({ role: admin.role, username: admin.username });
        return sendJson(res, { code: 200, message: 'Login success', token: adminToken, role: admin.role });
    }

    // ========== 后台账号管理接口 ==========
    if (reqPath === '/api/admin/accounts' && req.method === 'GET') {
        // 获取所有后台账号（密码不返回）
        const accounts = (await pool.query('SELECT id, username, role FROM admin_accounts ORDER BY id')).rows;
        return sendJson(res, { code: 200, data: accounts });
    }

    // ========== 鉴权（小程序用户接口） ==========
    let currentUser = null;
    if (!reqPath.startsWith('/api/admin/')) {
        const auth = req.headers['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
            const token = auth.split(' ')[1];
            const decoded = verifyToken(token);
            if (decoded) {
                currentUser = (await pool.query('SELECT * FROM users WHERE openid=$1', [decoded.openid])).rows[0];
                if (currentUser) {
                    const blacked = (await pool.query('SELECT openid FROM black_accounts WHERE openid=$1', [currentUser.openid])).rows[0];
                    if (blacked) return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
                }
            }
        }
        if (!currentUser && !reqPath.startsWith('/api/admin/')) {
            if (reqPath !== '/api/loan/contract/extend' && reqPath !== '/api/loan/contract/close') {
                if (reqPath.startsWith('/api/loan/') && reqPath !== '/api/loan/login' && reqPath !== '/ping') {
                    return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
                }
            }
        }
    }

    // ========== 后台管理员鉴权 ==========
    let adminUser = null;
    if (reqPath.startsWith('/api/admin/') && reqPath !== '/api/admin/login') {
        const auth = req.headers['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
            const token = auth.split(' ')[1];
            const decoded = verifyToken(token);
            if (decoded && decoded.role) {
                adminUser = decoded;
            }
        }
        if (!adminUser) return sendJson(res, { code: 401, message: '请先登录后台' }, 401);
    }

    // ========== 用户接口 ==========
    if (reqPath === '/api/loan/realname' && req.method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const { realName, idCard, frontImg, backImg } = post;
        if (!realName || !idCard) return sendJson(res, { code: 400 });

        const frontImgPath = saveBase64Image(frontImg);
        const backImgPath = saveBase64Image(backImg);

        await pool.query(
            'UPDATE users SET realName=$1, idCard=$2, realStatus=$3, realTime=$4 WHERE openid=$5',
            [realName, idCard, 'verified', beijingTime(), currentUser.openid]
        );

        await pool.query(
            'INSERT INTO real_applications(id, openid, realName, idCard, frontImg, backImg, status, time) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [Date.now(), currentUser.openid, realName, idCard, frontImgPath, backImgPath, 'approved', beijingTime()]
        );

        currentUser = (await pool.query('SELECT * FROM users WHERE openid=$1', [currentUser.openid])).rows[0];
        return sendJson(res, { code: 200, user: currentUser });
    }

    if (reqPath === '/api/loan/user/info' && req.method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        return sendJson(res, { code: 200, user: currentUser });
    }

    if (reqPath === '/api/loan/checkAuth' && req.method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const authorized = (await pool.query(
            'SELECT * FROM authorized_users WHERE realName=$1 AND idCard=$2',
            [currentUser.realname, currentUser.idcard]
        )).rows[0];
        return sendJson(res, { code: 200, authorized: !!authorized });
    }

    // ========== 合同接口 ==========
    if (reqPath === '/api/loan/contract/list' && req.method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const contracts = (await pool.query(
            'SELECT * FROM contracts WHERE lenderopenid=$1 OR borroweropenid=$1 ORDER BY id DESC',
            [currentUser.openid]
        )).rows;
        return sendJson(res, { code: 200, data: contracts });
    }

    if (reqPath === '/api/loan/contract/detail' && req.method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const id = parseInt(url.searchParams.get('id'));
        const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [id])).rows[0];
        if (!contract) return sendJson(res, { code: 404 });
        contract.extensions = (await pool.query('SELECT * FROM extensions WHERE contractId=$1 ORDER BY id', [id])).rows;
        return sendJson(res, { code: 200, data: contract, isLender: contract.lenderopenid === currentUser.openid });
    }

    if (reqPath === '/api/loan/contract/create' && req.method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
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
            createtime: beijingTime()
        };
        await pool.query(
            'INSERT INTO contracts(id,lenderopenid,lendername,lenderidcard,amount,amountchinese,rate,reason,paymethod,startdate,enddate,lendersignature,status,createtime) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
            [contract.id, contract.lenderopenid, contract.lendername, contract.lenderidcard, contract.amount, contract.amountchinese, contract.rate, contract.reason, contract.paymethod, contract.startdate, contract.enddate, contract.lendersignature, contract.status, contract.createtime]
        );
        return sendJson(res, { code: 200, contract });
    }

    if (reqPath === '/api/loan/contract/sign' && req.method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        if (currentUser.realstatus !== 'verified') return sendJson(res, { code: 400 });
        const { contractId, borrowerSignature } = post;
        await pool.query(
            'UPDATE contracts SET borroweropenid=$1, borrowername=$2, borroweridcard=$3, borrowersignature=$4, status=$5 WHERE id=$6',
            [currentUser.openid, currentUser.realname, currentUser.idcard, borrowerSignature || '', 'active', contractId]
        );
        return sendJson(res, { code: 200, message: 'Signed' });
    }

    // 延期合同：后台操作放行
    if (reqPath === '/api/loan/contract/extend' && req.method === 'POST') {
        const { contractId, newEndDate, reason } = post;
        const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [contractId])).rows[0];
        if (!contract) return sendJson(res, { code: 404 });
        if (currentUser && contract.lenderopenid !== currentUser.openid) return sendJson(res, { code: 403 });
        await pool.query('INSERT INTO extensions(contractId, date, reason, time) VALUES($1,$2,$3,$4)',
            [contractId, newEndDate, reason || '手动延期', beijingTime()]);
        await pool.query('UPDATE contracts SET enddate=$1, status=$2 WHERE id=$3', [newEndDate, 'active', contractId]);
        return sendJson(res, { code: 200, message: 'Extended' });
    }

    // 结清合同：后台操作放行
    if (reqPath === '/api/loan/contract/close' && req.method === 'POST') {
        const { contractId } = post;
        const contract = (await pool.query('SELECT * FROM contracts WHERE id=$1', [contractId])).rows[0];
        if (!contract) return sendJson(res, { code: 404 });
        if (currentUser && contract.lenderopenid !== currentUser.openid) return sendJson(res, { code: 403 });
        await pool.query('UPDATE contracts SET status=$1 WHERE id=$2', ['closed', contractId]);
        return sendJson(res, { code: 200, message: 'Closed' });
    }

    // ========== 后台管理接口（带权限校验） ==========
    // 实名审核：老板和员工都可访问
    if (reqPath === '/api/admin/realname' && req.method === 'GET') {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const pageSize = Math.min(parseInt(url.searchParams.get('pageSize')) || 20, 50);
        const offset = (page - 1) * pageSize;
        const countResult = await pool.query('SELECT COUNT(*) FROM real_applications');
        const total = parseInt(countResult.rows[0].count);
        const rows = (await pool.query(
            'SELECT id, openid, realName, idCard, frontImg, backImg, status, time FROM real_applications ORDER BY id DESC LIMIT $1 OFFSET $2',
            [pageSize, offset]
        )).rows;
        return sendJson(res, { code: 200, data: rows, page, pageSize, total });
    }

    // 根据 ID 获取身份证图片数据（老板和员工都可）
    if (reqPath === '/api/admin/realname/images' && req.method === 'GET') {
        const id = parseInt(url.searchParams.get('id'));
        const row = (await pool.query('SELECT frontImg, backImg FROM real_applications WHERE id=$1', [id])).rows[0];
        if (!row) return sendJson(res, { code: 404, message: 'Not found' });
        return sendJson(res, { code: 200, data: { frontImg: row.frontimg || '', backImg: row.backimg || '' } });
    }

    // 合同管理：仅老板
    if (reqPath === '/api/admin/contracts' && req.method === 'GET') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const data = (await pool.query('SELECT * FROM contracts ORDER BY id DESC')).rows;
        return sendJson(res, { code: 200, data });
    }

    // 授权列表：仅老板
    if (reqPath === '/api/admin/auth/list' && req.method === 'GET') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const data = (await pool.query('SELECT * FROM authorized_users')).rows;
        return sendJson(res, { code: 200, data });
    }

    // 添加授权：仅老板
    if (reqPath === '/api/admin/auth/add' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { realName, idCard } = post;
        if (!realName || !idCard) return sendJson(res, { code: 400, message: '姓名和身份证号不能为空' });
        await pool.query(
            'INSERT INTO authorized_users(realName, idCard) VALUES($1, $2) ON CONFLICT DO NOTHING',
            [realName, idCard]
        );
        return sendJson(res, { code: 200 });
    }

    // 取消授权：仅老板
    if (reqPath === '/api/admin/auth/remove' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { realName, idCard } = post;
        await pool.query('DELETE FROM authorized_users WHERE realName=$1 AND idCard=$2', [realName, idCard]);
        return sendJson(res, { code: 200 });
    }

    // 用户列表：仅老板
    if (reqPath === '/api/admin/users' && req.method === 'GET') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
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

    // 删除用户：仅老板
    if (reqPath === '/api/admin/user/delete' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { openid } = post;
        const apps = (await pool.query('SELECT frontImg, backImg FROM real_applications WHERE openid=$1', [openid])).rows;
        apps.forEach(app => {
            [app.frontimg, app.backimg].forEach(imgPath => {
                if (imgPath && imgPath.startsWith('/uploads/')) {
                    const filepath = path.join(uploadsDir, imgPath.replace('/uploads/', ''));
                    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (e) {}
                }
            });
        });
        await pool.query('DELETE FROM real_applications WHERE openid=$1', [openid]);
        await pool.query('DELETE FROM contracts WHERE lenderopenid=$1 OR borroweropenid=$1', [openid]);
        await pool.query('DELETE FROM authorized_users WHERE realName=(SELECT realName FROM users WHERE openid=$1) AND idCard=(SELECT idCard FROM users WHERE openid=$1)', [openid]);
        await pool.query('DELETE FROM black_accounts WHERE openid=$1', [openid]);
        await pool.query('DELETE FROM users WHERE openid=$1', [openid]);
        return sendJson(res, { code: 200, message: '删除成功' });
    }

    // 拉黑账号：仅老板
    if (reqPath === '/api/admin/black/account' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { openid } = post;
        await pool.query('INSERT INTO black_accounts(openid) VALUES($1) ON CONFLICT DO NOTHING', [openid]);
        return sendJson(res, { code: 200 });
    }

    // 解除拉黑：仅老板
    if (reqPath === '/api/admin/black/unaccount' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { openid } = post;
        await pool.query('DELETE FROM black_accounts WHERE openid=$1', [openid]);
        return sendJson(res, { code: 200 });
    }

    // 拉黑IP：仅老板
    if (reqPath === '/api/admin/black/ip' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { ip } = post;
        await pool.query('INSERT INTO black_ips(ip) VALUES($1) ON CONFLICT DO NOTHING', [ip]);
        return sendJson(res, { code: 200 });
    }

    // 解除拉黑IP：仅老板
    if (reqPath === '/api/admin/black/unip' && req.method === 'POST') {
        if (adminUser.role !== 'admin') return sendJson(res, { code: 403, message: '无权限' }, 403);
        const { ip } = post;
        await pool.query('DELETE FROM black_ips WHERE ip=$1', [ip]);
        return sendJson(res, { code: 200 });
    }

    sendJson(res, { code: 404 }, 404);
});

server.listen(PORT, () => console.log('Server running on port ' + PORT));
