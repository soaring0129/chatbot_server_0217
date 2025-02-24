const config = require('./config');
const {WebSocketServer} = require('ws');
const mysql = require('mysql2/promise');
const OpenAI = require('openai');

const AsrWorkerManager = require('./asr-work-manager');
const { OpusEncoder } = require('@discordjs/opus');



// 初始化OpenAI客户端
const openai = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 创建WebSocket服务器
const wss = new WebSocketServer({ port: config.asrFrontendPort, host: '0.0.0.0' });

// 创建一个AsrWorkerManager实例，用于管理ASR工作进程
const asrWorkerManager = new AsrWorkerManager();

// 创建MySQL连接池
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '12345678',
    database: 'chatbot_db',
});



wss.on('listening', () => {
    console.log(`前端接口服务器正在监听端口 ${config.asrFrontendPort}`);
})


// 处理WebSocket连接，这里的ws代表了与客户端（esp32）的Websocket连接
wss.on('connection', async (ws) => {

    // 注意这里应该有验证客户端mac地址的代码，暂时不做
    // 连接好了以后，服务器应该返还给客户端一个access token，这个token用于后续的认证


    // 客户端连接上后，就从asrWorkerManager获取一个worker，
    // 这里的work类似一个“句柄”，通过它，就能找真正的工作进程，而真正work实际上是一个连接asr后端服务器的客户端，用python实现
    // 实际上与客户端（esp32）进行对话的，还不是work本身，而是work下保存的一个session，这个session对应了上述python客户端中一个AsrWork对象
    const arsWorker = asrWorkerManager.getWorker();
    if (!arsWorker) {
        console.error('There is no asr-worker');
        ws.close();
        return;
    }

    // 定义处理工作节点关闭事件的函数，以关闭WebSocket连接
    const closeHandler = () => {
        ws.close();
    };

    // 监听工作节点的关闭事件
    arsWorker.on('close', closeHandler);

    // 创建Opus解码器实例， 采样率16000，单通道
    const decoder = new OpusEncoder(config.decodeSampleRate, 1);

    // 通过工作节点创建一个新的asr会话
    // 暂时是asr的session，后面考虑作为共同的session，扩展其功能
    const asrWorkerSession = arsWorker.newSession();

    // 当会话产生文本数据时，这是从worker发送来的消息，（由session转接）通过session转发给客户端（esp32）
    asrWorkerSession.on('text', (text) => {
        // 这是发给客户端（esp32)的json
        ws.send(JSON.stringify({ type: 'text', content: text }));
        console.log('Received text:', text);
    });

    // 监听WebSocket的message事件，从客户端（esp32）发来的消息
    ws.on('message', (message, isBinary) => {
        try {
            // 根据消息类型处理二进制数据或JSON数据
            if (isBinary) {
                // 音频数据，解码，通过session发送给后端服务器
                // const data = decoder.decode(message);
                // asrWorkerSession.sendAudio(data);

                // test
                asrWorkerSession.sendAudio(message);
            } else {
                // 解析JSON数据
                const json = JSON.parse(message);
                // 目前只处理'listen'类型的消息
                if (json.type === 'listen') {
                    // 这里只处理了一个'listen'消息，其他未处理
                    asrWorkerSession.sendJson(json);
                } else {
                    // 输出未知消息类型的错误信息
                    console.error('收到未知消息类型:', json.type);
                }
            }
        } catch (err) {
            // 输出处理消息时的错误信息
            console.error('处理消息时出错:', err);
        }
    });


    ws.on('close', () => {
        console.log('Client disconnected');
    });
});


/**
 * 认证用户
 * 
 * 该函数尝试通过用户名和密码查询用户表，以验证用户的身份
 * 如果查询成功且存在匹配的用户，则返回该用户的信息；否则返回null
 * 如果在查询过程中遇到错误，则抛出错误
 * 
 * @param {string} username 用户名，用于尝试查询用户
 * @param {string} password 密码，用于尝试查询用户
 * @returns {Promise<Object|null>} 返回一个Promise，解析为用户信息对象或null
 */
async function authenticateUser(username, password) {
    try {
        // 执行SQL查询以验证用户名和密码
        const [users] = await pool.query(
            'SELECT id FROM users WHERE username = ? AND password = ?',
            [username, password]
        );
        // 根据查询结果决定返回用户信息还是返回null
        return users.length > 0 ? users[0] : null;
    } catch (err) {
        // 如果查询过程中出现错误，抛出错误
        throw err;
    }
}

/**
 * 异步获取用户的历史消息
 * 
 * 该函数通过查询数据库来获取指定用户的所有历史消息，并按照创建时间升序排列
 * 主要用于用户界面展示或其他需要回顾用户交互历史的场景
 * 
 * @param {string} userId - 用户的唯一标识符，用于数据库查询
 * @returns {Promise<Array>} 包含用户历史消息的数组，每条消息包括角色和内容
 * @throws {Error} 如果数据库查询失败，则抛出错误
 */
async function getHistoryMessages(userId) {
    try {
        // 执行数据库查询，获取用户的历史消息
        const [history] = await pool.query(
            'SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at ASC',
            [userId]
        );
        // 返回查询结果
        return history;
    } catch (err) {
        // 如果发生错误，将其抛出，以便在调用处进行处理
        throw err;
    }
}

/**
 * 处理聊天消息
 * @param {WebSocket} ws - WebSocket连接对象
 * @param {string} userId - 用户ID
 * @param {Array} messages - 消息上下文数组
 * @param {string} prompt - 用户输入的提示
 */
async function handleChatMessage(ws, userId, messages, prompt) {
    // 打印接收到的提示信息
    console.log(`Received prompt: ${prompt}`);

    // 添加用户消息到上下文
    messages.push({ role: 'user', content: prompt });

    try {
        // 使用OpenAI API进行流式响应
        const completion = await openai.chat.completions.create({
            model: 'qwen-plus',
            messages: messages,
            stream: true,
        });

        // 初始化助手的响应内容
        let assistantResponse = '';
        // 处理OpenAI API的流式响应
        for await (const chunk of completion) {
            // 提取响应块中的内容
            const content = chunk.choices[0]?.delta?.content || '';
            // 累加助手的响应内容
            assistantResponse += content;
            // 确保每次读取到数据时发送给客户端
            ws.send(content);
        }

        // 通知客户端响应结束
        ws.send('[DONE]');
        // 添加助手响应到上下文
        messages.push({ role: 'assistant', content: assistantResponse });

        // 异步写入新消息到数据库
        await saveMessages(userId, messages.slice(-2)); // 只保存最新的用户和助手消息
    } catch (error) {
        // 处理OpenAI API错误
        console.error('OpenAI API error:', error);
        // 向客户端发送错误消息
        ws.send('Error: Failed to generate response');
    }
}

/**
 * 异步保存消息到数据库
 * 
 * 该函数接收用户ID和一组新消息作为参数，将这些消息插入到数据库的messages表中
 * 它首先构建一个包含所有必要信息的数组，然后构造一个相应的SQL查询以执行插入操作
 * 
 * @param {string} userId - 用户的唯一标识符
 * @param {Array} newMessages - 包含消息对象的数组，每个对象包含'role'和'content'属性
 */
async function saveMessages(userId, newMessages) {
    try {
        // 构建一个二维数组，每个子数组包含用户ID、消息角色和消息内容
        const values = newMessages.map(msg => [userId, msg.role, msg.content]).flat();
        // 构造占位符字符串，用于SQL查询
        const placeholders = newMessages.map(() => '(?, ?, ?)').join(', ');
        // 执行SQL查询以插入消息到数据库
        await pool.query(
            `INSERT INTO messages (user_id, role, content) VALUES ${placeholders}`,
            values
        );
    } catch (err) {
        // 如果发生错误，抛出错误
        throw err;
    }
}