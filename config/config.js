// config.js
module.exports = {
  // 数据库连接配置
  database: {
    uri: 'mongodb://localhost:27017',
    dbName: 'eventstore',
    // 连接池配置
    collections:{
      events:'events',
      users:'users'
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }
  },
  admin:{
    pubkey:""
  },//pubkey
};
