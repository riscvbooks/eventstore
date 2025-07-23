// src/db/events.js
const { getClient } = require('./client');
const config = require('../../config/config');
const {    PERMISSIONS,
    defaultPermissionConfigs
} = require("eventstore-tools/src/common"); 

const {verifyEvent} = require("eventstore-tools/src/key");

class EventService {
  constructor() {
    this.collections = config.database.collections;
     this.adminPubkey = config.admin.pubkey; // 从配置文件读取管理员公钥
    
  }

  // 获取数据库实例（使用共享客户端）
  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

  // 创建事件
  async createEvent(event) {
    const db = await this.getDb();
    const eventsCollection = db.collection(this.collections.events);
    const permissionsCollection = db.collection(this.collections.permissions);

 
    // 时间校验
    const clientTime = new Date(event.created_at);
    const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - clientTime);
    if (timeDiff > 5 * 60 * 1000) { // 5分钟容忍度
      throw new Error('事件时间超出允许范围');
    }

    // 用户校验
    const user = await permissionsCollection.findOne({ pubkey: event.user });
    if (!user) {
      throw new Error(`无效用户: ${event.user}`);
    }

    if (event.user != this.adminPubkey && user.permissions !=  PERMISSIONS.CREATE_EVENTS){
    	throw new Error(`无权限`);
    }
    
    // 签名校验
   const isValid = verifyEvent(event, event.user);

    if (!isValid) {
      throw new Error('签名验证失败');
    }

    // 构建事件文档
    event.servertimestamp = new Date();
 
    // 保存事件
    await eventsCollection.insertOne(event);
    return event;
  }

  // 读取事件
  async readEvents(filter = {}, limit = 1000) {
    const db = await this.getDb();
    return db.collection(this.collections.events)
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  // 根据标签查询事件
  async getEventsByTags(tags, limit = 1000) {
    return this.readEvents({ tags: { $in: tags } }, limit);
  }
}

// 导出单例服务
module.exports = EventService ;
