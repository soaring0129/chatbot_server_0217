const express = require('express');
const mysql = require('mysql');
const app = express();
const port = 3001;

// 创建只读数据库连接
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'chat_db',
  readOnly: true
});

// 连接数据库
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to database as read-only');
});

// 获取对话记录
app.get('/api/chat-history', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const query = 'SELECT * FROM chat_history WHERE user_id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`Read-only server running at http://localhost:${port}`);
});
