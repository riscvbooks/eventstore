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
      return {code:500,message:'时间和服务器差距太大'}
    }

    // 用户校验
    const user = await permissionsCollection.findOne({ pubkey: event.user });
    if (!user) {
      return {code:500,message:'无效用户'}
    }

    if (event.user != this.adminPubkey && !(user.permissions &PERMISSIONS.CREATE_EVENTS)){
    	return {code:500,message:'无create event权限'};
    }
    
    // 签名校验
   const isValid = verifyEvent(event, event.user);

    if (!isValid) {
      return {code:500,message:'签名验证失败'}
    }

    // 构建事件文档
    event.servertimestamp = new Date();
 
    // 保存事件
    await eventsCollection.insertOne(event);
    return  {code:200,message:'事件创建成功'};
  }

  // 读取事件
  async readEvents(filter = {}, limit = 1000) {
    const db = await this.getDb();
    const query = {

            };
    if (filter.tags) query["tags"] = {$all:filter.tags};
    if (filter.user) query['user'] = filter.user
    
    return db.collection(this.collections.events)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  async deleteEvent(event){

    const db = await this.getDb();
    const eventsCollection = db.collection(this.collections.events);

    let eventid = event.data.eventid 
     
    
    let eventdoc = await eventsCollection.findOne({id:eventid})

    if(!eventdoc) return {code:500,message:"事件不存在"};

    if (event.user != this.adminPubkey && event.user != eventdoc.user)
      return {code:403,message:"你没有删除权限"};

    const isValid = verifyEvent(event, event.user);

    if (!isValid) {
        return {code:500,message:'签名验证失败'}
    }

    await eventsCollection.deleteOne({id:eventid});
    return  {code:200,message:'事件删除成功'};

  }

}

// 导出单例服务
module.exports = EventService ;
