CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    role ENUM('user', 'assistant') NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

// 插入测试用的用户数据
INSERT INTO users (username, password) VALUES ('xufeng', '123456');
