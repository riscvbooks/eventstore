// src/server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // 用于生成唯一ID
const { db } = require('./db');

class WebSocketServer {
  constructor(port = 8080) {
    this.port = port;
    this.wss = null;
    this.clients = new Map(); // 使用Map存储客户端连接，便于管理
  }

  // 启动服务器
  async start() {
    try {
      // 初始化WebSocket服务器
      this.wss = new WebSocket.Server({ port: this.port });
      console.log(`WebSocket 服务器启动，监听端口 ${this.port}`);

      // 处理新连接
      this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

      // 处理服务器错误
      this.wss.on('error', (error) => this.handleServerError(error));
    } catch (error) {
      console.error('启动服务器失败:', error);
      process.exit(1);
    }
  }

  // 处理新客户端连接
  handleConnection(ws, req) {
    // 生成唯一客户端ID
    const clientId = uuidv4();
    
    // 记录客户端信息
    const clientInfo = {
      id: clientId,
      ip: req.socket.remoteAddress,
      connectionTime: new Date(),
      ws: ws
    };
    
    // 存储客户端连接
    this.clients.set(clientId, clientInfo);
    console.log(`新客户端连接: ${clientId} (${clientInfo.ip})`);
    console.log(`当前连接数: ${this.clients.size}`);

 

    // 处理接收到的消息
    ws.on('message', (message) => this.handleMessage(clientId, message));

    // 处理连接关闭
    ws.on('close', (code, reason) => this.handleDisconnect(clientId, code, reason));

    // 处理错误
    ws.on('error', (error) => this.handleClientError(clientId, error));
  }

  // 处理客户端消息
  async handleMessage(clientId, message) {
    try {
      // 解析JSON消息
      const event = JSON.parse(message);
      
      // 验证消息格式
      if (!event.type) {
        throw new Error('无效的事件格式: 缺少type字段');
      }
      
      console.log(`收到来自 ${clientId} 的事件: ${event.type}`);
      
      // 构建完整的事件对象
      const fullEvent = {
        id: uuidv4(),
        type: event.type,
        data: event.data || {},
        metadata: {
          clientId: clientId,
          timestamp: new Date().toISOString()
        },
        version: event.version || 0
      };
      
      // 保存事件到数据库
      await db.appendEvent('client-events', fullEvent);
      
      // 广播事件给所有客户端（除发送者外）
      this.broadcastEvent(clientId, fullEvent);
      
    } catch (error) {
      console.error(`处理消息失败 (${clientId}):`, error);
      
      // 发送错误响应给客户端
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'error',
          message: error.message || '处理消息时出错'
        }));
      }
    }
  }

 

  // 处理客户端断开连接
  handleDisconnect(clientId, code, reason) {
 
  }

  // 处理客户端错误
  handleClientError(clientId, error) {
    console.error(`客户端错误 (${clientId}):`, error);
 
  }

  // 处理服务器错误
  handleServerError(error) {
    console.error('WebSocket服务器错误:', error);
  }

  // 关闭服务器
  async close() {
    try {
      // 关闭所有客户端连接
      this.clients.forEach((client) => {
        if (client.ws.readyState !== WebSocket.CLOSED) {
          client.ws.close(1001, '服务器关闭');
        }
      });
      
      // 清空客户端列表
      this.clients.clear();
      
      // 关闭WebSocket服务器
      return new Promise((resolve, reject) => {
        if (this.wss) {
          this.wss.close((error) => {
            if (error) {
              console.error('关闭服务器失败:', error);
              reject(error);
            } else {
              console.log('WebSocket服务器已关闭');
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    } catch (error) {
      console.error('关闭服务器时出错:', error);
      throw error;
    }
  }
}

// 主函数
async function Servermain() {
  try {
    // 创建并启动服务器
    const server = new WebSocketServer(8080);
    await server.start();
    
    // 优雅处理进程退出
    process.on('SIGINT', async () => {
      console.log('接收到关闭信号，正在优雅退出...');
      await server.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('接收到终止信号，正在优雅退出...');
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('服务器运行失败:', error);
    process.exit(1);
  }
}

// 启动服务器
if (require.main === module) {
  Servermain();
}

// 导出WebSocketServer类，便于测试和扩展
module.exports = {
  WebSocketServer
};
