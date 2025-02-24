const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 创建MySQL连接池
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '12345678',
    database: 'chatbot_db',
});

// 读取login.html文件内容
const loginHtml = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');

// 添加根路径路由，返回登录表单
app.get('/', (req, res) => {
    res.send(loginHtml);
});

// 添加GET请求路由，返回登录表单
app.get('/login', (req, res) => {
    res.send(loginHtml);
});

// 登录路由
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await pool.query(
            'SELECT id FROM users WHERE username = ? AND password = ?',
            [username, password]
        );

        if (users.length > 0) {
            const userId = users[0].id;
            const history = await getHistoryMessages(userId);
            res.json({ success: true, history });
        } else {
            res.status(401).json({ success: false, message: '无效的用户名或密码' });
        }
    } catch (err) {
        console.error('数据库错误:', err);
        res.status(500).json({ success: false, message: '内部服务器错误' });
    }
});

// 获取用户历史消息
async function getHistoryMessages(userId) {
    try {
        const [history] = await pool.query(
            'SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at ASC',
            [userId]
        );
        return history;
    } catch (err) {
        throw err;
    }
}

// 启动服务器
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => { // 修改: 将监听地址改为 '0.0.0.0'
    console.log(`服务器已启动，访问地址: http://localhost:${PORT} 或 http://<你的局域网IP>:${PORT}`);
});