const http = require('http');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'xinyueqian_jwt_secret_2026';
const PORT = process.env.PORT || 10000;
const dbFile = './db.json';

function loadDb() {
    try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); }
    catch (e) { return { users: [], realApplications: [], contracts: [], authorizedNames: [], blackAccounts: [], blackIps: [] }; }
}
function saveDb(db) { fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8'); }

let db = loadDb();

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); } });
    });
}
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
    const body = await parseBody();

    // ========== 公共路由 ==========
    if (path === '/api/loan/login' && req.method === 'POST') {
        const { openid } = body;
        if (!openid) return sendJson(res, { code: 400, message: 'openid required' });
        let user = db.users.find(u => u.openid === openid);
        if (!user) {
            user = { openid, realName: '', idCard: '', realStatus: 'unverified', realTime: '', createTime: new Date().toISOString() };
            db.users.push(user);
        }
        const token = signToken({ openid: user.openid });
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Login success', token, user });
    }

    if (path === '/ping') return sendJson(res, { code: 200, message: 'ok' });

    // ========== 鉴权中间件（后台接口跳过） ==========
    let currentUser = null;
    if (!path.startsWith('/api/admin/')) {
        const auth = req.headers['authorization'];
        if (!auth || !auth.startsWith('Bearer ')) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const decoded = verifyToken(auth.split(' ')[1]);
        if (!decoded) return sendJson(res, { code: 401, message: 'Token expired' }, 401);
        currentUser = db.users.find(u => u.openid === decoded.openid);
        if (!currentUser) return sendJson(res, { code: 404, message: 'User not found' });
    }

    // ========== 用户接口 ==========
    if (path === '/api/loan/realname' && req.method === 'POST') {
        const { realName, idCard } = body;
        if (!realName || !idCard) return sendJson(res, { code: 400, message: '缺少信息' });
        currentUser.realName = realName;
        currentUser.idCard = idCard;
        currentUser.realStatus = 'verified';
        currentUser.realTime = new Date().toLocaleString('zh-CN');
        saveDb(db);
        return sendJson(res, { code: 200, user: currentUser });
    }

    if (path === '/api/loan/user/info' && req.method === 'GET') {
        return sendJson(res, { code: 200, user: currentUser });
    }

    if (path === '/api/loan/checkAuth' && req.method === 'GET') {
        return sendJson(res, { code: 200, authorized: db.authorizedNames.includes(currentUser.realName) });
    }

    // ========== 合同接口 ==========
    if (path === '/api/loan/contract/list' && req.method === 'GET') {
        const list = db.contracts.filter(c => c.lenderOpenid === currentUser.openid || c.borrowerOpenid === currentUser.openid);
        return sendJson(res, { code: 200, data: list });
    }

    if (path === '/api/loan/contract/detail' && req.method === 'GET') {
        const id = parseInt(url.searchParams.get('id'));
        const contract = db.contracts.find(c => c.id === id);
        if (!contract) return sendJson(res, { code: 404, message: 'Not found' });
        return sendJson(res, { code: 200, data: contract, isLender: contract.lenderOpenid === currentUser.openid });
    }

    if (path === '/api/loan/contract/create' && req.method === 'POST') {
        if (currentUser.realStatus !== 'verified') return sendJson(res, { code: 400, message: '请先实名' });
        if (!db.authorizedNames.includes(currentUser.realName)) return sendJson(res, { code: 403, message: '未授权' });
        const { amount, rate, reason, payMethod, startDate, endDate, lenderSignature } = body;
        const contract = {
            id: Date.now(),
            lenderOpenid: currentUser.openid,
            lenderName: currentUser.realName,
            lenderIdCard: currentUser.idCard,
            borrowerOpenid: '', borrowerName: '', borrowerIdCard: '',
            amount: parseFloat(amount), rate, reason, payMethod, startDate, endDate,
            repaymentMethod: 'lumpSum',
            lenderSignature: lenderSignature || '',
            borrowerSignature: '',
            status: 'pending',
            extensions: [],
            createTime: new Date().toLocaleString('zh-CN')
        };
        db.contracts.push(contract);
        saveDb(db);
        return sendJson(res, { code: 200, contract });
    }

    if (path === '/api/loan/contract/sign' && req.method === 'POST') {
        if (currentUser.realStatus !== 'verified') return sendJson(res, { code: 400, message: '未实名' });
        const { contractId, borrowerSignature } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404 }, 404);
        contract.borrowerOpenid = currentUser.openid;
        contract.borrowerName = currentUser.realName;
        contract.borrowerIdCard = currentUser.idCard;
        contract.borrowerSignature = borrowerSignature || '';
        contract.status = 'active';
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Signed', contract });
    }

    if (path === '/api/loan/contract/extend' && req.method === 'POST') {
        const { contractId, newEndDate, reason } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract || contract.lenderOpenid !== currentUser.openid) return sendJson(res, { code: 403 }, 403);
        if (!contract.extensions) contract.extensions = [];
        contract.extensions.push({ date: newEndDate, reason: reason || '手动延期', time: new Date().toLocaleString('zh-CN') });
        contract.endDate = newEndDate;
        contract.status = 'active';
        saveDb(db);
        return sendJson(res, { code: 200, contract });
    }

    if (path === '/api/loan/contract/close' && req.method === 'POST') {
        const { contractId } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract || contract.lenderOpenid !== currentUser.openid) return sendJson(res, { code: 403 }, 403);
        contract.status = 'closed';
        saveDb(db);
        return sendJson(res, { code: 200, contract });
    }

    // ========== 后台管理接口 ==========
    if (path === '/api/admin/realname' && req.method === 'GET') return sendJson(res, { code: 200, data: db.realApplications });
    if (path === '/api/admin/contracts' && req.method === 'GET') return sendJson(res, { code: 200, data: db.contracts });
    if (path === '/api/admin/auth/list' && req.method === 'GET') return sendJson(res, { code: 200, data: db.authorizedNames });
    if (path === '/api/admin/auth/add' && req.method === 'POST') {
        const { name } = body;
        if (!name) return sendJson(res, { code: 400 });
        if (!db.authorizedNames.includes(name)) db.authorizedNames.push(name);
        saveDb(db);
        return sendJson(res, { code: 200, data: db.authorizedNames });
    }
    if (path === '/api/admin/auth/remove' && req.method === 'POST') {
        const { name } = body;
        db.authorizedNames = db.authorizedNames.filter(n => n !== name);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }
    if (path === '/api/admin/users' && req.method === 'GET') return sendJson(res, { code: 200, data: db.users });
    if (path === '/api/admin/user/delete' && req.method === 'POST') {
        const { openid } = body;
        db.users = db.users.filter(u => u.openid !== openid);
        db.contracts = db.contracts.filter(c => c.lenderOpenid !== openid && c.borrowerOpenid !== openid);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }
    if (path === '/api/admin/black/account' && req.method === 'POST') {
        const { openid } = body;
        if (!db.blackAccounts.includes(openid)) db.blackAccounts.push(openid);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }
    if (path === '/api/admin/black/unaccount' && req.method === 'POST') {
        const { openid } = body;
        db.blackAccounts = db.blackAccounts.filter(a => a !== openid);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }
    if (path === '/api/admin/black/ip' && req.method === 'POST') {
        const { ip } = body;
        if (!db.blackIps.includes(ip)) db.blackIps.push(ip);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }
    if (path === '/api/admin/black/unip' && req.method === 'POST') {
        const { ip } = body;
        db.blackIps = db.blackIps.filter(i => i !== ip);
        saveDb(db);
        return sendJson(res, { code: 200 });
    }

    sendJson(res, { code: 404 }, 404);
});

server.listen(PORT, () => console.log('Server running on port ' + PORT));
