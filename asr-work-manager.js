const Emitter = require('events');
const AsrWorker = require('./asr-worker');
const { WebSocketServer } = require('ws');
const config = require('./config');

class AsrWorkerManager extends Emitter {
    constructor() {
        super();
        this.workers = new Map();
        this.initTaskServer();
        this.startPingInterval();
    }

    // 后端服务器与asr/worker/app.py中AsrTaskClient 通过websocket相连
    initTaskServer() {
        this.taskServer = new WebSocketServer({ port: config.asrBackendPort });
        this.taskServer.on('connection', this.onConnection.bind(this));
        this.taskServer.on('error', this.onServerError.bind(this));
        this.taskServer.on('listening', this.onServerListening.bind(this));
    }

    // 定期向所有节点发送Ping消息，检测节点健康状态，
    // 如果某节点没有响应，标记为不可用，从works Map中删除
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            this.workers.forEach(worker => worker.ws.ping());
        }, config.asrBackendPingInterval);
    }

    onServerError(err) {
        console.error('ASR任务服务器错误:', err);
    }

    onServerListening() {
        console.log('ASR后端任务服务器正在监听端口', this.taskServer.options.port);
    }

    onConnection(ws, req) {
        let remoteAddress = req.socket.remoteAddress;
        if (remoteAddress === '::1') {
            remoteAddress = '127.0.0.1';
        }
        const workerId = `${remoteAddress}:${req.socket.remotePort}`;
        console.log('ASR工作节点已连接:', workerId);

        const worker = new AsrWorker(ws, workerId);
        this.workers.set(workerId, worker);

        ws.on('close', () => this.onWorkerDisconnect(workerId));
    }

    onWorkerDisconnect(workerId) {
        console.log('ASR工作节点已断开连接:', workerId);
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.close();
            this.workers.delete(workerId);
        }
    }

    destroy() {
        clearInterval(this.pingInterval);
        this.taskServer.close();
        this.workers.forEach(worker => worker.close());
        this.workers.clear();
    }

    // 随机选择工作节点，保证负载均衡和高可用性
    getWorker() {
        if (this.workers.size === 0) return null;
        const workers = Array.from(this.workers.values());
        return workers[Math.floor(Math.random() * workers.length)];
    }
}

module.exports = AsrWorkerManager;
