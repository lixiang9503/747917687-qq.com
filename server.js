const http = require('http');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// ----- JWT 密钥 & 配置 -----
const JWT_SECRET = 'xinyueqian_jwt_secret_2026';
const PORT = process.env.PORT || 10000;

// ----- 数据库文件路径 -----
const dbFile = './db.json';

// ----- 初始化数据库 -----
function loadDb() {
    try {
        const raw = fs.readFileSync(dbFile, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return {
            users: [],           // 用户列表 (openid, 实名信息, 授权状态)
            realApplications: [],// 实名申请记录
            contracts: [],       // 借条合同
            authorizedNames: [], // 授权可发起合同的用户姓名
            blackAccounts: [],   // 拉黑的用户姓名
            blackIps: []         // 拉黑的IP地址
        };
    }
}

function saveDb(db) {
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadDb();

// ----- 工具函数：解析请求体 -----
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });
}

// ----- 工具函数：JWT 签发 -----
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

// ----- 工具函数：JWT 验证 -----
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// ----- 工具函数：获取客户端IP -----
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection.remoteAddress ||
           '';
}

// ----- 发送响应 -----
function sendJson(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

// ----- 创建服务器 -----
const server = http.createServer(async (req, res) => {
    // CORS 预检处理
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 拉黑IP检查
    const clientIp = getClientIp(req);
    if (db.blackIps.includes(clientIp)) {
        sendJson(res, { code: 403, message: '访问被拒绝' }, 403);
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;
    const body = await parseBody(req);

    // ----- 不需要登录的接口 -----
    
    // 1. 微信一键登录 (模拟)
    if (path === '/api/loan/login' && method === 'POST') {
        const { openid } = body; // 模拟传入 openid
        if (!openid) return sendJson(res, { code: 400, message: '缺少openid' });
        
        // 检查是否拉黑
        if (db.blackAccounts.includes(openid)) {
            return sendJson(res, { code: 403, message: '账号已被限制' });
        }

        // 查找或创建用户
        let user = db.users.find(u => u.openid === openid);
        if (!user) {
            user = {
                openid,
                realName: '',
                idCard: '',
                realStatus: '未实名', // 未实名 / 已实名
                realTime: '',
                authorized: false,
                createTime: new Date().toISOString()
            };
            db.users.push(user);
        }

        const token = signToken({ openid: user.openid, realName: user.realName });
        saveDb(db);
        return sendJson(res, { code: 200, message: '登录成功', token, user });
    }

    // 2. 防休眠
    if (path === '/ping') {
        return sendJson(res, { code: 200, message: '服务正常' });
    }

    // ----- 需要登录的接口 (通过 Bearer Token) -----
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendJson(res, { code: 401, message: '请先登录' }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        return sendJson(res, { code: 401, message: '登录已过期' }, 401);
    }

    // 通过 openid 查找当前用户
    const currentUser = db.users.find(u => u.openid === decoded.openid);
    if (!currentUser) {
        return sendJson(res, { code: 404, message: '用户不存在' });
    }

    // 检查账号是否被拉黑
    if (db.blackAccounts.includes(currentUser.openid)) {
        return sendJson(res, { code: 403, message: '账号已被限制' });
    }

    // ========== 用户相关接口 ==========

    // 3. 提交实名认证 (自动通过)
    if (path === '/api/loan/realname' && method === 'POST') {
        const { realName, idCard, frontImg, backImg } = body;
        if (!realName || !idCard) {
            return sendJson(res, { code: 400, message: '姓名和身份证号不能为空' });
        }

        // 记录申请
        const application = {
            id: Date.now(),
            openid: currentUser.openid,
            realName,
            idCard,
            frontImg: frontImg || '',
            backImg: backImg || '',
            status: '已通过', // 自动通过
            time: new Date().toLocaleString('zh-CN')
        };
        db.realApplications.push(application);

        // 更新用户实名状态
        currentUser.realName = realName;
        currentUser.idCard = idCard;
        currentUser.realStatus = '已实名';
        currentUser.realTime = new Date().toLocaleString('zh-CN');

        saveDb(db);
        return sendJson(res, { code: 200, message: '实名认证自动通过', user: currentUser });
    }

    // 4. 获取当前用户信息
    if (path === '/api/loan/user/info' && method === 'GET') {
        return sendJson(res, { code: 200, user: currentUser });
    }

    // 5. 获取我的借条列表
    if (path === '/api/loan/contract/list' && method === 'GET') {
        const myContracts = db.contracts.filter(c => 
            c.lenderOpenid === currentUser.openid || c.borrowerOpenid === currentUser.openid
        );
        return sendJson(res, { code: 200, data: myContracts });
    }

    // 6. 获取借条详情
    if (path === '/api/loan/contract/detail' && method === 'GET') {
        const contractId = parseInt(url.searchParams.get('id'));
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: '合同不存在' });
        
        // 判断当前用户角色
        const isLender = contract.lenderOpenid === currentUser.openid;
        return sendJson(res, { code: 200, data: contract, isLender });
    }

    // 7. 检查授权状态
    if (path === '/api/loan/checkAuth' && method === 'GET') {
        const isAuth = db.authorizedNames.includes(currentUser.realName);
        return sendJson(res, { code: 200, authorized: isAuth });
    }

    // ========== 借条操作接口 ==========

    // 8. 创建借条 (出借人签名)
    if (path === '/api/loan/contract/create' && method === 'POST') {
        if (currentUser.realStatus !== '已实名') {
            return sendJson(res, { code: 400, message: '请先完成实名认证' });
        }
        if (!db.authorizedNames.includes(currentUser.realName)) {
            return sendJson(res, { code: 403, message: '未授权，请联系管理员' });
        }

        const { amount, rate, reason, payMethod, startDate, endDate, lenderSignature, borrowerName } = body;
        
        const contract = {
            id: Date.now(),
            lenderOpenid: currentUser.openid,
            lenderName: currentUser.realName,
            lenderIdCard: currentUser.idCard,
            borrowerOpenid: '', // 待借款人登录后填充
            borrowerName: borrowerName || '',
            borrowerIdCard: '',
            amount: parseFloat(amount),
            amountChinese: body.amountChinese || '',
            rate: rate,
            reason: reason || '其它',
            payMethod: payMethod || '其他转账方式',
            startDate: startDate,
            endDate: endDate,
            repaymentMethod: '一次性还本付息',
            lenderSignature: lenderSignature || '',
            borrowerSignature: '',
            status: '待签', // 待签 / 使用中 / 已逾期 / 已结清
            createTime: new Date().toLocaleString('zh-CN')
        };

        db.contracts.push(contract);
        saveDb(db);
        return sendJson(res, { code: 200, message: '借条创建成功', contract });
    }

    // 9. 借款人签署合同
    if (path === '/api/loan/contract/sign' && method === 'POST') {
        const { contractId, borrowerSignature } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: '合同不存在' });
        
        if (currentUser.realStatus !== '已实名') {
            return sendJson(res, { code: 400, message: '请先完成实名认证' });
        }

        // 更新借款人信息
        contract.borrowerOpenid = currentUser.openid;
        contract.borrowerName = currentUser.realName;
        contract.borrowerIdCard = currentUser.idCard;
        contract.borrowerSignature = borrowerSignature || '';
        contract.status = '使用中'; // 签署后生效

        saveDb(db);
        return sendJson(res, { code: 200, message: '签署成功，合同已生效', contract });
    }

    // 10. 延期合同 (仅出借人)
    if (path === '/api/loan/contract/extend' && method === 'POST') {
        const { contractId, newEndDate } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: '合同不存在' });
        if (contract.lenderOpenid !== currentUser.openid) {
            return sendJson(res, { code: 403, message: '只有出借人可以延期' });
        }
        contract.endDate = newEndDate;
        contract.status = '使用中';
        saveDb(db);
        return sendJson(res, { code: 200, message: '合同已延期', contract });
    }

    // 11. 结清合同 (仅出借人)
    if (path === '/api/loan/contract/close' && method === 'POST') {
        const { contractId } = body;
        const contract = db.contracts.find(c => c.id === contractId);
        if (!contract) return sendJson(res, { code: 404, message: '合同不存在' });
        if (contract.lenderOpenid !== currentUser.openid) {
            return sendJson(res, { code: 403, message: '只有出借人可以结
