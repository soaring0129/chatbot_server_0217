const { NONAME } = require('dns');
const Emitter = require('events');
const { v4: uuidv4 } = require('uuid');

class AsrWorkerSession extends Emitter {
    constructor(asrWorker) {
        super();
        this.asrWorker = asrWorker;
        this.sessionId = uuidv4();
        this.initializeBuffer();
    }

    /**
     * 初始化缓冲区，用于存储会话ID和Opus数据长度。
     * 该函数主要完成以下任务：
     * 1. 创建一个4字节的缓冲区，用于存储会话ID的长度。
     * 2. 将会话ID的长度写入缓冲区。
     * 3. 将会话ID的长度缓冲区和会话ID的UTF-8编码缓冲区连接起来，形成最终的会话ID缓冲区。
     * 4. 创建一个4字节的缓冲区，用于存储Opus数据的长度。
     */
    initializeBuffer() {
        // 创建一个4字节的缓冲区，用于存储会话ID的长度
        const sessionIdLength = Buffer.alloc(4);

        // 将会话ID的长度以大端序写入缓冲区
        sessionIdLength.writeUInt32BE(this.sessionId.length, 0);

        // 将会话ID的长度缓冲区和会话ID的UTF-8编码缓冲区连接起来，形成最终的会话ID缓冲区
        this.sessionIdBuffer = Buffer.concat([sessionIdLength, Buffer.from(this.sessionId, 'utf-8')]);

        // 创建一个4字节的缓冲区，用于存储Opus数据的长度
        this.opusDataLengthBuffer = Buffer.alloc(4);
    }

    /**
     * 发送音频数据到ASR（自动语音识别）工作线程。
     * 
     * 该函数将音频数据（opus格式）与当前会话ID结合，构建一个包含会话ID和音频数据长度的缓冲区，
     * 并将其发送到ASR工作线程进行处理。
     * 
     * @param {Buffer} opusData - 包含opus编码音频数据的缓冲区。
     * @returns {void} 该函数没有返回值。
     */
    sendAudio(opusData) {
        // 将opus数据的长度写入预先分配的缓冲区
        this.opusDataLengthBuffer.writeUInt32BE(opusData.length, 0);

        /**
         * 构建一个新的缓冲区，包含以下部分：
         * 1. 会话ID的缓冲区
         * 2. opus数据长度的缓冲区
         * 3. opus数据本身
         */
        // const buffer = Buffer.concat([this.sessionIdBuffer, this.opusDataLengthBuffer, opusData]);

        const buffer = Buffer.concat([this.sessionIdBuffer, this.opusDataLengthBuffer, opusData]);

        // 将构建好的缓冲区发送到ASR工作线程，标记为二进制数据
        this.asrWorker.send(buffer, { binary: true });
    }

    sendJson(json) {
        json.session_id = this.sessionId;
        this.asrWorker.send(JSON.stringify(json));
    }

    finish() {
        this.sendJson({ type: 'finish' });
        this.asrWorker.removeSession(this.sessionId);
    }

    // 修改：处理从asr-worker.js接收到的消息
    onMessage(message) {
        try {
            // 解析消息字符串为JSON对象
            const data = JSON.parse(message);

            console.log('Received json from asr-worker.js:', data);
            
            // 从解析后的数据中提取相关字段
            const { session_id, type, content } = data;

            // 如果消息类型为'text'且会话ID存在于当前会话集合中
            if (type === 'text' && this.sessions.has(session_id)) {
                // 向指定会话发送消息内容
                this.sessions.get(session_id).emit('text', content);
            }
            // 新增：如果消息类型为'chat'且会话ID存在于当前会话集合中
            else if (type === 'chat' && this.sessions.has(session_id)) {
                // 向指定会话发送消息内容
                this.sessions.get(session_id).emit('chat', content);
            }
        } catch (error) {
            // 捕获并记录解析消息时的错误
            console.error('解析消息时出错:', error);
        }
    }
}

class AsrWorker extends Emitter {
    constructor(ws, workerId) {
        super();
        this.sessions = new Map();
        this.workerId = workerId;
        this.ws = ws;
        this.initWebSocket();
    }

    initWebSocket() {
        this.ws.on('message', this.onMessage.bind(this));
        this.ws.on('close', this.onClose.bind(this));
        this.ws.on('error', this.onError.bind(this));
    }

    // 原代码，设计缺少options
    // send(data) {
    //     this.ws.send(data);
    // }


    send(data, options) {
        this.ws.send(data, options);
    }
    /**
     * 处理从python的worker端（即asr_worker_app.py）接收到的消息。消息为音频转换的结果
     * 该函数解析传入的消息，并根据消息类型和会话ID将内容传递给相应的会话。
     * 
     * @param {string} message - 接收到的消息字符串，通常为JSON格式。
     * @returns {void} 该函数没有返回值。
     */
    onMessage(message) {
        try {
            // 解析消息字符串为JSON对象
            const data = JSON.parse(message);

            console.log('Received json from asr-workder.js:', data);
            
            // 从解析后的数据中提取相关字段
            const { session_id, type, content } = data;

            // 如果消息类型为'chat'且会话ID存在于当前会话集合中
            if (type === 'chat' && this.sessions.has(session_id)) {
                // 向指定会话发送消息内容
                this.sessions.get(session_id).emit('text', content);
            }
        } catch (error) {
            // 捕获并记录解析消息时的错误
            console.error('解析消息时出错:', error);
        }
    }

    onClose() {
        this.emit('close');
    }

    onError(error) {
        console.error(`工作节点 ${this.workerId} 发生错误:`, error);
        this.emit('error', error);
    }

    newSession() {
        const session = new AsrWorkerSession(this);
        this.sessions.set(session.sessionId, session);

        return session;
    }

    removeSession(sessionId) {
        this.sessions.delete(sessionId);
    }

    close() {
        this.sessions.forEach(session => session.emit('close'));
        this.sessions.clear();
        this.ws.close();
    }
}

module.exports = AsrWorker;
