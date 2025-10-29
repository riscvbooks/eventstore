
const {    PERMISSIONS,
    defaultPermissionConfigs
} = require("eventstore-tools/src/common");


// config.js
module.exports = {
  uploaddir:"uploads", 
 // 数据库连接配置
  database: {
    uri: 'mongodb://localhost:27017',
    dbName: 'rvbstore',
    // 连接池配置
    collections:{
      events:'events',
      users:'users',
      permissions: 'permissions', // 权限
      comments: 'comments',
      likes: 'likes'
    },
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }
  },
  admin:{
    pubkey:"",
    email:"admin@riscvbooks.com"
  },//pubkey
  defaultPermission:defaultPermissionConfigs.user,
};
