const http = require('http');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'xinyueqian_jwt_secret_2026';
const PORT = process.env.PORT || 10000;
const dbFile = './db.json';

function loadDb() {
    try {
        const raw = fs.readFileSync(dbFile, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return {
            users: [],
            realApplications: [],
            contracts: [],
            authorizedNames: [],
            blackAccounts: [],
            blackIps: []
        };
    }
}

function saveDb(db) {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadDb();

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { resolve({}); }
        });
    });
}

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); }
    catch (e) { return null; }
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection.remoteAddress || '';
}

function sendJson(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const clientIp = getClientIp(req);
    if (db.blackIps.includes(clientIp)) {
        sendJson(res, { code: 403, message: 'IP blocked' }, 403);
        return;
    }

    const url = new URL(req.url, 'http://' + req.headers.host);
    const path = url.pathname;
    const method = req.method;
    const body = await parseBody(req);

    // ========== PUBLIC ROUTES ==========
    if (path === '/api/loan/login' && method === 'POST') {
        const { openid } = body;
        if (!openid) return sendJson(res, { code: 400, message: 'openid required' });

        if (db.blackAccounts.includes(openid)) {
            return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
        }

        let user = db.users.find(u => u.openid === openid);
        if (!user) {
            user = {
                openid,
                realName: '',
                idCard: '',
                realStatus: 'unverified',
                realTime: '',
                authorized: false,
                createTime: new Date().toISOString()
            };
            db.users.push(user);
        }

        const token = signToken({ openid: user.openid, realName: user.realName });
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Login success', token, user });
    }

    if (path === '/ping') {
        return sendJson(res, { code: 200, message: 'ok' });
    }

    // ========== AUTH MIDDLEWARE (skip for admin) ==========
    let currentUser = null;
    if (!path.startsWith('/api/admin/')) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        }
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (!decoded) {
            return sendJson(res, { code: 401, message: 'Token expired' }, 401);
        }
        currentUser = db.users.find(u => u.openid === decoded.openid);
        if (!currentUser) {
            return sendJson(res, { code: 404, message: 'User not found' });
        }
        if (db.blackAccounts.includes(currentUser.openid)) {
            return sendJson(res, { code: 403, message: 'Account blocked' }, 403);
        }
    }

    // ========== USER ROUTES ==========
    if (path === '/api/loan/realname' && method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const { realName, idCard, frontImg, backImg } = body;
        if (!realName || !idCard) {
            return sendJson(res, { code: 400, message: 'Name and ID required' });
        }
        const application = {
            id: Date.now(),
            openid: currentUser.openid,
            realName,
            idCard,
            frontImg: frontImg || '',
            backImg: backImg || '',
            status: 'approved',
            time: new Date().toLocaleString('zh-CN')
        };
        db.realApplications.push(application);
        currentUser.realName = realName;
        currentUser.idCard = idCard;
        currentUser.realStatus = 'verified';
        currentUser.realTime = new Date().toLocaleString('zh-CN');
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Verified', user: currentUser });
    }

    if (path === '/api/loan/user/info' && method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        return sendJson(res, { code: 200, user: currentUser });
    }

    // 合同列表（测试用：返回所有合同）
    if (path === '/api/loan/contract/list' && method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        return sendJson(res, { code: 200, data: db.contracts });
    }

    // 合同详情
    if (path === '/api/loan/contract/detail' && method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const contractId = parseInt(url.searchParams.get('id'));
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: 'Not found' });
        const isLender = contract.lenderOpenid === currentUser.openid;
        const isBorrower = contract.borrowerOpenid === currentUser.openid;
        return sendJson(res, { code: 200, data: contract, isLender, isBorrower });
    }

    if (path === '/api/loan/checkAuth' && method === 'GET') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const isAuth = db.authorizedNames.includes(currentUser.realName);
        return sendJson(res, { code: 200, authorized: isAuth });
    }

    // ========== CONTRACT ROUTES ==========
    if (path === '/api/loan/contract/create' && method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        if (currentUser.realStatus !== 'verified') {
            return sendJson(res, { code: 400, message: 'Please verify first' });
        }
        if (!db.authorizedNames.includes(currentUser.realName)) {
            return sendJson(res, { code: 403, message: 'Not authorized' }, 403);
        }
        const { amount, rate, reason, payMethod, startDate, endDate, lenderSignature, amountChinese } = body;
        const contract = {
            id: Date.now(),
            lenderOpenid: currentUser.openid,
            lenderName: currentUser.realName,
            lenderIdCard: currentUser.idCard,
            borrowerOpenid: '',
            borrowerName: '',
            borrowerIdCard: '',
            amount: parseFloat(amount),
            amountChinese: amountChinese || '',
            rate: rate,
            reason: reason || 'other',
            payMethod: payMethod || 'other',
            startDate: startDate,
            endDate: endDate,
            repaymentMethod: 'lumpSum',
            lenderSignature: lenderSignature || '',
            borrowerSignature: '',
            status: 'pending',
            extensions: [],
            createTime: new Date().toLocaleString('zh-CN')
        };
        db.contracts.push(contract);
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Contract created', contract });
    }

    // 签署合同（自动绑定当前用户为借款人）
    if (path === '/api/loan/contract/sign' && method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const { contractId, borrowerSignature } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: 'Not found' });
        if (currentUser.realStatus !== 'verified') {
            return sendJson(res, { code: 400, message: 'Please verify first' });
        }
        contract.borrowerOpenid = currentUser.openid;
        contract.borrowerName = currentUser.realName;
        contract.borrowerIdCard = currentUser.idCard;
        contract.borrowerSignature = borrowerSignature || '';
        contract.status = 'active';
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Signed', contract });
    }

    // 延期
    if (path === '/api/loan/contract/extend' && method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const { contractId, newEndDate, reason } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: 'Not found' });
        if (contract.lenderOpenid !== currentUser.openid) {
            return sendJson(res, { code: 403, message: 'Lender only' }, 403);
        }
        if (!contract.extensions) contract.extensions = [];
        contract.extensions.push({
            date: newEndDate,
            reason: reason || '手动延期',
            time: new Date().toLocaleString('zh-CN')
        });
        contract.endDate = newEndDate;
        contract.status = 'active';
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Extended', contract });
    }

    // 结清
    if (path === '/api/loan/contract/close' && method === 'POST') {
        if (!currentUser) return sendJson(res, { code: 401, message: 'Unauthorized' }, 401);
        const { contractId } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: 'Not found' });
        if (contract.lenderOpenid !== currentUser.openid) {
            return sendJson(res, { code: 403, message: 'Lender only' }, 403);
        }
        contract.status = 'closed';
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Closed', contract });
    }

    // ========== ADMIN ROUTES (no auth) ==========
    if (path === '/api/admin/realname' && method === 'GET') {
        return sendJson(res, { code: 200, data: db.realApplications });
    }
    if (path === '/api/admin/realname/approve' && method === 'POST') {
        const { applicationId } = body;
        const app = db.realApplications.find(a => a.id === applicationId);
        if (app) app.status = 'approved';
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Approved' });
    }
    if (path === '/api/admin/contracts' && method === 'GET') {
        return sendJson(res, { code: 200, data: db.contracts });
    }
    if (path === '/api/admin/auth/list' && method === 'GET') {
        return sendJson(res, { code: 200, data: db.authorizedNames });
    }
    if (path === '/api/admin/auth/add' && method === 'POST') {
        const { name } = body;
        if (!name) return sendJson(res, { code: 400, message: 'Name required' });
        if (!db.authorizedNames.includes(name)) {
            db.authorizedNames.push(name);
            saveDb(db);
        }
        return sendJson(res, { code: 200, message: 'Authorized', data: db.authorizedNames });
    }
    if (path === '/api/admin/auth/remove' && method === 'POST') {
        const { name } = body;
        db.authorizedNames = db.authorizedNames.filter(n => n !== name);
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Removed', data: db.authorizedNames });
    }
    if (path === '/api/admin/users' && method === 'GET') {
        return sendJson(res, { code: 200, data: db.users.map(u => ({
            openid: u.openid,
            realName: u.realName,
            realStatus: u.realStatus,
            authorized: db.authorizedNames.includes(u.realName),
            blacked: db.blackAccounts.includes(u.openid)
        }))});
    }
    if (path === '/api/admin/user/delete' && method === 'POST') {
        const { openid } = body;
        db.users = db.users.filter(u => u.openid !== openid);
        db.realApplications = db.realApplications.filter(a => a.openid !== openid);
        db.contracts = db.contracts.filter(c => c.lenderOpenid !== openid && c.borrowerOpenid !== openid);
        db.authorizedNames = db.authorizedNames.filter(n => {
            const user = db.users.find(u => u.realName === n);
            return !user || user.openid !== openid;
        });
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Deleted' });
    }
    if (path === '/api/admin/black/account' && method === 'POST') {
        const { openid } = body;
        if (!db.blackAccounts.includes(openid)) {
            db.blackAccounts.push(openid);
            saveDb(db);
        }
        return sendJson(res, { code: 200, message: 'Blacklisted' });
    }
    if (path === '/api/admin/black/unaccount' && method === 'POST') {
        const { openid } = body;
        db.blackAccounts = db.blackAccounts.filter(a => a !== openid);
        saveDb(db);
        return sendJson(res, { code: 200, message: 'Unblacklisted' });
    }
    if (path === '/api/admin/black/ip' && method === 'POST') {
        const { ip } = body;
        if (!db.blackIps.includes(ip)) {
            db.blackIps.push(ip);
            saveDb(db);
        }
        return sendJson(res, { code: 200, message: 'IP blocked' });
    }
    if (path === '/api/admin/black/unip' && method === 'POST') {
        const { ip } = body;
        db.blackIps = db.blackIps.filter(i => i !== ip);
        saveDb(db);
        return sendJson(res, { code: 200, message: 'IP unblocked' });
    }

    sendJson(res, { code: 404, message: 'Not found' }, 404);
});

server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
