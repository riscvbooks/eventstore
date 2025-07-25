// src/db/users.js
const { getClient } = require('./client');
const config = require('../../config/config');
 
const {verifyEvent} = require("eventstore-tools/src/key");

class UserService {
  constructor() {
    this.collections = config.database.collections;
    
  }

  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

 
 

  // 创建用户（首次建立 pubkey 和 email 的关联，需验证签名）
  async createUser(userData) {
    const db = await this.getDb();
    const usersCollection = db.collection(this.collections.users);

    // 验证必要字段
    
    if (!userData.user) throw new Error('缺少公钥字段');
    if (!userData.data.email) throw new Error('缺少邮箱字段');
    if (!userData.sig) throw new Error('缺少签名字段');

    // 验证邮箱格式
    if (!/\S+@\S+\.\S+/.test(userData.data.email)) {
      throw new Error('邮箱格式无效');
    }

    // 验证签名
    // 签名数据应为 pubkey 和 email 的组合（确保两者绑定关系可信）
 
    const isValid = verifyEvent(userData, userData.user );
    if (!isValid) {
      throw new Error('签名验证失败，公钥与邮箱的绑定关系不可信');
    }

    // 检查 pubkey 是否已存在
    const existingByPubkey = await usersCollection.findOne({ pubkey: userData.user.pubkey });
    if (existingByPubkey) {
      throw new Error('该公钥已被注册');
    }

    // 检查 email 是否已存在
    const existingByEmail = await usersCollection.findOne({ email: userData.data.email });
    if (existingByEmail) {
      throw new Error('该邮箱已被注册');
    }

    // 构建用户文档（移除临时签名字段）
    const userDoc = {
      pubkey:userData.user,
      email:userData.data.email,
      createdAt: new Date(),
      updatedAt: new Date()
    };
     
    // 保存用户
    try {
      const result = await usersCollection.insertOne(userDoc);
      return result;
    } catch (error) {
      if (error.code === 11000) {
        if (error.message.includes('pubkey_1')) {
          throw new Error('该公钥已被注册');
        }
        if (error.message.includes('email_1')) {
          throw new Error('该邮箱已被注册');
        }
      }
      throw error;
    }
  }
  async readUsers(filter = {}, limit = 1000) {
    const db = await this.getDb();
    let query = {
            };
    if (filter) query = filter ;
 
    return db.collection(this.collections.users)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  // 根据 pubkey 查找用户
  async getUserByPubkey(pubkey) {
    const db = await this.getDb();
    return db.collection(this.collections.users).findOne({ pubkey });
  }

  // 根据 email 查找用户
  async getUserByEmail(email) {
    const db = await this.getDb();
    return db.collection(this.collections.users).findOne({ email });
  }

  // 更新用户信息（禁止修改 pubkey 和 email）
  async updateUser(pubkey, updates) {
    const db = await this.getDb();

    // 禁止修改 pubkey 和 email（确保关联关系不可变）
    if (updates.pubkey) delete updates.pubkey;
    if (updates.email) delete updates.email;

    // 如果没有可更新的字段，直接返回
    if (Object.keys(updates).length === 0) {
      return await this.getUserByPubkey(pubkey);
    }

    // 更新其他字段
    updates.updatedAt = new Date();

    const result = await db.collection(this.collections.users).findOneAndUpdate(
      { pubkey },
      { $set: updates },
      { returnOriginal: false }
    );

    return result.value;
  }

  // 删除用户（逻辑删除）
  async deleteUser(pubkey) {
    const db = await this.getDb();
    return db.collection(this.collections.users).updateOne(
      { pubkey },
      { $set: { status: 'deleted', updatedAt: new Date() } }
    );
  }
}

module.exports =  UserService;
