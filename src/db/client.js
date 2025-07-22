// src/db/client.js
const { MongoClient } = require('mongodb');
const config = require('../../config/config');

let client = null;

// 获取共享客户端实例
async function getClient() {
  if (client) {
    return client;
  }

  client = await MongoClient.connect(
    config.database.uri,
    config.database.options
  );

  console.log('MongoDB 连接初始化成功');
  return client;
}

// 初始化数据库（创建索引等）
async function initDatabase() {
  const client = await getClient();
  const db = client.db(config.database.dbName);
  
  // 创建事件集合索引
  await db.collection(config.database.collections.events).createIndex({ eventId: 1 }, { unique: true });
  await db.collection(config.database.collections.events).createIndex({ user: 1 });
  await db.collection(config.database.collections.events).createIndex({ timestamp: -1 });
  await db.collection(config.database.collections.events).createIndex({ tags: 1 });
  
  // 创建用户集合索引
  await db.collection(config.database.collections.users).createIndex({ pubkey: 1 }, { unique: true });
  
  console.log('数据库索引初始化完成');
}

// 关闭连接
async function closeConnection() {
  if (client) {
    await client.close();
    console.log('MongoDB 连接已关闭');
    client = null;
  }
}

module.exports = {
  getClient,
  initDatabase,
  closeConnection
};
