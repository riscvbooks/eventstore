// src/db/permissions.js
const { getClient } = require('./client.js');
const config = require('../../config/config');
const { ec } = require('elliptic');
const crypto = require('crypto');
const userService = require('./users'); // 引入用户服务

class PermissionService {
  constructor() {
    this.collections = config.database.collections;
    this.ec = new ec('secp256k1'); // 与用户/事件签名算法保持一致
    this.adminPubkey = config.admin.pubkey; // 从配置文件读取管理员公钥
  }

  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

  // 验证管理员签名（确保权限操作由管理员发起）
  async verifyAdminSignature(data, sig) {
    try {
      // 检查管理员公钥是否存在于用户表
      const adminUser = await userService.getUserByPubkey(this.adminPubkey);
      if (!adminUser) {
        throw new Error('管理员公钥未注册');
      }

      // 对数据哈希后验证签名
      const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
      
      const adminKey = this.ec.keyFromPublic(this.adminPubkey, 'hex');
      return adminKey.verify(dataHash, sig);
    } catch (error) {
      console.error('管理员签名验证失败:', error);
      return false;
    }
  }

  // 初始化默认权限（首次启动时调用）
  async initDefaultPermissions(adminSig) {
    const db = await this.getDb();
    const permissionsCollection = db.collection(this.collections.permissions);

    // 验证管理员签名（防止非管理员初始化）
    const initData = { action: 'init_default_permissions', timestamp: new Date().toISOString() };
    if (!await this.verifyAdminSignature(initData, adminSig)) {
      throw new Error('管理员签名验证失败，无法初始化权限');
    }

    // 检查是否已初始化
    const count = await permissionsCollection.countDocuments();
    if (count > 0) {
      throw new Error('默认权限已初始化，无需重复操作');
    }

    // 默认权限列表
    const defaultPermissions = [
      {
        name: 'admin',
        description: '管理员权限',
        scopes: ['user:manage', 'permission:manage', 'event:manage']
      },
      {
        name: 'user',
        description: '普通用户权限',
        scopes: ['event:create', 'event:read:own']
      },
      {
        name: 'guest',
        description: '访客权限',
        scopes: ['event:read:public']
      }
    ];

    // 添加时间戳
    const permissionsWithTime = defaultPermissions.map(perm => ({
      ...perm,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await permissionsCollection.insertMany(permissionsWithTime);
    return permissionsWithTime;
  }

  // 为用户分配权限（需管理员签名）
  async assignPermission(userId, permissionName, adminSig) {
    const db = await this.getDb();
    const usersCollection = db.collection(this.collections.users);
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 验证权限存在
    const permission = await permissionsCollection.findOne({ name: permissionName });
    if (!permission) {
      throw new Error(`权限 ${permissionName} 不存在`);
    }

    // 2. 验证管理员签名
    const assignData = {
      action: 'assign_permission',
      userId,
      permissionName,
      timestamp: new Date().toISOString()
    };
    if (!await this.verifyAdminSignature(assignData, adminSig)) {
      throw new Error('管理员签名验证失败，无法分配权限');
    }

    // 3. 为用户添加权限（用户表中存储权限ID数组）
    return usersCollection.updateOne(
      { pubkey: userId }, // 以 pubkey 作为用户唯一标识
      { 
        $addToSet: { permissions: permission._id }, // 避免重复添加
        $set: { updatedAt: new Date() }
      }
    );
  }

  // 撤销用户权限（需管理员签名）
  async revokePermission(userId, permissionName, adminSig) {
    const db = await this.getDb();
    const usersCollection = db.collection(this.collections.users);
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 验证权限存在
    const permission = await permissionsCollection.findOne({ name: permissionName });
    if (!permission) {
      throw new Error(`权限 ${permissionName} 不存在`);
    }

    // 2. 验证管理员签名
    const revokeData = {
      action: 'revoke_permission',
      userId,
      permissionName,
      timestamp: new Date().toISOString()
    };
    if (!await this.verifyAdminSignature(revokeData, adminSig)) {
      throw new Error('管理员签名验证失败，无法撤销权限');
    }

    // 3. 从用户移除权限
    return usersCollection.updateOne(
      { pubkey: userId },
      { 
        $pull: { permissions: permission._id },
        $set: { updatedAt: new Date() }
      }
    );
  }

  // 获取用户所有权限
  async getUserPermissions(userId) {
    const db = await this.getDb();
    const usersCollection = db.collection(this.collections.users);
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 获取用户信息
    const user = await usersCollection.findOne(
      { pubkey: userId },
      { projection: { permissions: 1 } }
    );
    if (!user) {
      throw new Error(`用户 ${userId} 不存在`);
    }

    // 2. 获取权限详情
    if (!user.permissions || user.permissions.length === 0) {
      return []; // 无权限
    }

    return permissionsCollection.find({
      _id: { $in: user.permissions }
    }).toArray();
  }

  // 检查用户是否有特定权限
  async hasPermission(userId, permissionName) {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some(perm => perm.name === permissionName);
  }
}

module.exports = new PermissionService();
