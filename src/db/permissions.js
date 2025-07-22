const { getClient } = require('./client');
const config = require('../../config/config');

const userService = require('./users'); // 引入用户服务
const logger = require('../utils/logger'); // 引入日志模块 
const {    PERMISSIONS,
    defaultPermissionConfigs
} = require("eventstore-tools/src/common");


class PermissionService {
  constructor() {
    this.collections = config.database.collections;
    
    this.adminPubkey = config.admin.pubkey; // 从配置文件读取管理员公钥
  }

  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

  

  // 初始化默认权限配置（首次启动时调用）
  async initDefaultPermissions() {
    const db = await this.getDb();
     
    const permissionsCollection = db.collection(this.collections.permissions);
    // 验证管理员签名（防止非管理员初始化）
    const initData = { action: 'init_default_permissions', timestamp: new Date().toISOString() };
 
    // 检查是否已初始化（通过检查管理员是否已有权限值）
    const adminUser = await permissionsCollection.findOne({ pubkey: this.adminPubkey });
    if (adminUser && adminUser.permissions !== undefined) {
      logger.info('默认权限已初始化，无需重复操作');
      throw new Error('默认权限已初始化，无需重复操作');
    }



    try {
      // 更新管理员用户，设置为admin权限
      await permissionsCollection.insertOne(
        { pubkey: this.adminPubkey ,
         permissions: defaultPermissionConfigs.admin, 
        updatedAt: new Date() } 
      );
      
      logger.info('默认权限初始化成功');
      return defaultPermissionConfigs;
    } catch (error) {
      logger.error('默认权限初始化失败:', error);
      throw new Error('默认权限初始化失败');
    }
  }

  // 将权限名称转换为位值
  getPermissionBitValue(permissionName) {
    const permissionMap = {
      'user:manage': PERMISSIONS.MANAGE_USERS,
      'permission:manage': PERMISSIONS.MANAGE_PERMISSIONS,
      'event:manage': PERMISSIONS.MANAGE_EVENTS,
      'event:create': PERMISSIONS.CREATE_EVENTS,
      'event:read:own': PERMISSIONS.READ_OWN_EVENTS,
      'event:read:public': PERMISSIONS.READ_PUBLIC_EVENTS
    };
    
    const bitValue = permissionMap[permissionName];
    if (!bitValue) {
      throw new Error(`未知权限名称: ${permissionName}`);
    }
    return bitValue;
  }

  // 为用户分配权限（需管理员签名）
  async assignPermission(userId, permissionName, adminSig) {
    const db = await this.getDb();
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 将权限名称转换为位值
    const permissionBitValue = this.getPermissionBitValue(permissionName);

    // 2. 验证管理员签名
    const assignData = {
      action: 'assign_permission',
      userId,
      permissionName,
      timestamp: new Date().toISOString()
    };
 

    // 3. 获取用户当前权限
    const user = await permissionsCollection.findOne({ pubkey: userId });
    if (!user) {
      throw new Error(`用户 ${userId} 不存在`);
    }
    
    // 4. 添加权限（使用位运算OR）
    const newPermissions = (user.permissions || 0) | permissionBitValue;
    
    try {
      const result = await permissionsCollection.updateOne(
        { pubkey: userId },
        {
          $set: { 
            permissions: newPermissions,
            updatedAt: new Date() 
          }
        }
      );
      
      if (result.modifiedCount === 0 && user.permissions === newPermissions) {
        logger.info(`用户 ${userId} 已拥有权限 ${permissionName}`);
      } else {
        logger.info(`成功为用户 ${userId} 分配权限 ${permissionName}`);
      }
      return result;
    } catch (error) {
      logger.error(`为用户 ${userId} 分配权限 ${permissionName} 失败:`, error);
      throw new Error(`为用户 ${userId} 分配权限 ${permissionName} 失败`);
    }
  }

  // 撤销用户权限（需管理员签名）
  async revokePermission(userId, permissionName, adminSig) {
    const db = await this.getDb();
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 将权限名称转换为位值
    const permissionBitValue = this.getPermissionBitValue(permissionName);

    // 2. 验证管理员签名
    const revokeData = {
      action: 'revoke_permission',
      userId,
      permissionName,
      timestamp: new Date().toISOString()
    };
    if (!await this.verifyAdminSignature(revokeData, adminSig)) {
      logger.error('管理员签名验证失败，无法撤销权限');
      throw new Error('管理员签名验证失败，无法撤销权限');
    }

    // 3. 获取用户当前权限
    const user = await permissionsCollection.findOne({ pubkey: userId });
    if (!user || !user.permissions) {
      logger.info(`用户 ${userId} 没有任何权限可撤销`);
      return { modifiedCount: 0 };
    }
    
    // 4. 撤销权限（使用位运算AND NOT）
    const newPermissions = user.permissions & ~permissionBitValue;
    
    try {
      const result = await permissionsCollection.updateOne(
        { pubkey: userId },
        {
          $set: { 
            permissions: newPermissions,
            updatedAt: new Date() 
          }
        }
      );
      
      if (result.modifiedCount === 0 && user.permissions === newPermissions) {
        logger.info(`用户 ${userId} 未拥有权限 ${permissionName}`);
      } else {
        logger.info(`成功撤销用户 ${userId} 的权限 ${permissionName}`);
      }
      return result;
    } catch (error) {
      logger.error(`撤销用户 ${userId} 的权限 ${permissionName} 失败:`, error);
      throw new Error(`撤销用户 ${userId} 的权限 ${permissionName} 失败`);
    }
  }

  // 获取用户所有权限（返回权限名称列表）
  async getUserPermissions(userId) {
    const db = await this.getDb();
    const permissionsCollection = db.collection(this.collections.permissions);

    // 1. 获取用户信息
    const user = await permissionsCollection.findOne(
      { pubkey: userId },
      { projection: { permissions: 1 } }
    );
    if (!user) {
      logger.error(`用户 ${userId} 不存在`);
      throw new Error(`用户 ${userId} 不存在`);
    }

    // 2. 解析权限位值为权限名称列表
    const permissionValue = user.permissions || 0;
    const permissionNames = [];
    
    if (permissionValue & PERMISSIONS.MANAGE_USERS) {
      permissionNames.push('user:manage');
    }
    if (permissionValue & PERMISSIONS.MANAGE_PERMISSIONS) {
      permissionNames.push('permission:manage');
    }
    if (permissionValue & PERMISSIONS.MANAGE_EVENTS) {
      permissionNames.push('event:manage');
    }
    if (permissionValue & PERMISSIONS.CREATE_EVENTS) {
      permissionNames.push('event:create');
    }
    if (permissionValue & PERMISSIONS.READ_OWN_EVENTS) {
      permissionNames.push('event:read:own');
    }
    if (permissionValue & PERMISSIONS.READ_PUBLIC_EVENTS) {
      permissionNames.push('event:read:public');
    }
    
    logger.info(`成功获取用户 ${userId} 的权限: ${permissionNames.join(', ')}`);
    return permissionNames;
  }

  // 检查用户是否有特定权限
  async hasPermission(userId, permissionName) {
    try {
      const db = await this.getDb();
      const permissionsCollection = db.collection(this.collections.permissions);
      
      // 获取用户权限值
      const user = await permissionsCollection.findOne(
        { pubkey: userId },
        { projection: { permissions: 1 } }
      );
      
      if (!user) {
        throw new Error(`用户 ${userId} 不存在`);
      }
      
      // 将权限名称转换为位值
      const requiredPermission = this.getPermissionBitValue(permissionName);
      
      // 检查权限
      const hasPerm = (user.permissions || 0) & requiredPermission;
      logger.info(`用户 ${userId} 是否拥有权限 ${permissionName}: ${!!hasPerm}`);
      return !!hasPerm;
    } catch (error) {
      logger.error(`检查用户 ${userId} 是否拥有权限 ${permissionName} 失败:`, error);
      throw new Error(`检查用户 ${userId} 是否拥有权限 ${permissionName} 失败`);
    }
  }

  // 获取权限位值对应的权限名称列表（用于调试）
  getPermissionNames(permissionValue) {
    const permissionNames = [];
    
    if (permissionValue & PERMISSIONS.MANAGE_USERS) {
      permissionNames.push('user:manage');
    }
    if (permissionValue & PERMISSIONS.MANAGE_PERMISSIONS) {
      permissionNames.push('permission:manage');
    }
    if (permissionValue & PERMISSIONS.MANAGE_EVENTS) {
      permissionNames.push('event:manage');
    }
    if (permissionValue & PERMISSIONS.CREATE_EVENTS) {
      permissionNames.push('event:create');
    }
    if (permissionValue & PERMISSIONS.READ_OWN_EVENTS) {
      permissionNames.push('event:read:own');
    }
    if (permissionValue & PERMISSIONS.READ_PUBLIC_EVENTS) {
      permissionNames.push('event:read:public');
    }
    
    return permissionNames;
  }
}

module.exports = PermissionService;    
