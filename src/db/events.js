// src/db/events.js
const { getClient } = require('./client.js');
const config = require('../../config/config');
const crypto = require('crypto');
const { ec } = require('elliptic');

class EventService {
  constructor() {
    this.collections = config.database.collections;
    this.ecInstance = new ec('secp256k1'); // 初始化椭圆曲线实例
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
    const usersCollection = db.collection(this.collections.users);

    // 字段校验
    const requiredFields = ['id', 'user', 'ops', 'code', 'sig', 'created_at'];
    const missingFields = requiredFields.filter(field => !event[field]);
    if (missingFields.length > 0) {
      throw new Error(`缺少必要字段: ${missingFields.join(', ')}`);
    }

    // 时间校验
    const clientTime = new Date(event.created_at);
    const timeDiff = Math.abs(Date.now() - clientTime);
    if (timeDiff > 5 * 60 * 1000) { // 5分钟容忍度
      throw new Error('事件时间超出允许范围');
    }

    // 用户校验
    const user = await usersCollection.findOne({ pubkey: event.user });
    if (!user) {
      throw new Error(`无效用户: ${event.user}`);
    }

    // 签名校验
    const dataToSign = [
      event.id,
      event.user,
      event.ops,
      event.code,
      JSON.stringify(event.data),
      event.created_at
    ].join('|');

    const isValid = this.ecInstance.keyFromPublic(event.user, 'hex')
      .verify(
        crypto.createHash('sha256').update(dataToSign).digest('hex'),
        event.sig
      );

    if (!isValid) {
      throw new Error('签名验证失败');
    }

    // 构建事件文档
    const eventDoc = {
      eventId: event.id,
      user: event.user,
      ops: event.ops,
      code: event.code,
      sig: event.sig,
      data: event.data,
      tags: event.tags || [],
      created_at: clientTime,
      timestamp: new Date()
    };

    // 保存事件
    await eventsCollection.insertOne(eventDoc);
    return eventDoc;
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
module.exports = new EventService();
