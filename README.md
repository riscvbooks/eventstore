# eventstore

`eventstore` 是一个基于WebSocket和MongoDB的事件存储系统，支持CRUD操作，并提供了权限管理和签名验证机制，以确保数据的安全性和完整性。

## 项目结构
```
eventstore/
├── config/
│   └── config.js           # 配置文件，包含数据库连接信息和管理员公钥
├── src
│   ├── db
│   │   ├── client.js
│   │   ├── events.js
│   │   ├── permissions.js
│   │   └── users.js
│   ├── index.js
│   ├── server.js
│   └── utils
│       └── logger.js
├── package.json            # 项目依赖和脚本配置
└── README.md               # 项目说明文档
```

## 环境依赖
- Node.js
- MongoDB

## 安装和启动
1. **克隆项目**
```bash
git clone https://github.com/asmcos/eventstore.git
cd eventstore
```
2. **安装依赖**
```bash
npm install
```
3. **配置文件**
在 `config/config.js` 中配置数据库连接信息和管理员公钥。
```javascript
module.exports = {
  // 数据库连接配置
  database: {
    uri: 'mongodb://localhost:27017',
    dbName: 'eventstore',
    // 连接池配置
    collections: {
      events:'events',
      users:'users',
      permissions: 'permissions' // 权限
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }
  },
  admin: {
    pubkey: "", // 管理员公钥
    email:"",
  }
};
```
4. **启动项目**
```bash
npm start
```

## CRUD操作说明

### 请求格式
```javascript
["REQ", "b1", {
  "ops": "C", // 操作类型，C/R/U/D 分别代表创建、读取、更新、删除
  "code": 1,  // 命令类型，1=短文本，2=长文本等
  "user": "publickey", // 用户公钥
  "content": "{\"title\":\"新书\"}", // 实际内容
  "tags": [["d", "book_001"]], // 标签
  "created_at": 1750915446, // 创建时间戳
  "sig": "xxxx" // 签名
}]
```

 

## 客户端编程例子
 
参考 eventstore-tools库。

## 代码库主要模块说明

### `src/db/client.js`
- 负责MongoDB客户端的连接和初始化。
- 提供 `getClient` 函数获取共享客户端实例。
- 提供 `initDatabase` 函数初始化数据库索引。
- 提供 `closeConnection` 函数关闭数据库连接。

### `src/db/events.js`
- 提供事件相关的数据库操作，包括创建事件、读取事件和根据标签查询事件。
- 在创建事件时进行字段校验、时间校验、用户校验和签名校验。

### `src/db/permissions.js`
- 提供权限管理相关的数据库操作，包括初始化默认权限、为用户分配权限、撤销用户权限、获取用户所有权限和检查用户是否有特定权限。
- 所有权限操作需要管理员签名验证。

### `src/db/users.js`
- 提供用户相关的数据库操作，包括创建用户、根据公钥或邮箱查找用户、更新用户信息和删除用户。
- 创建用户时需要验证签名和邮箱格式，确保公钥和邮箱的绑定关系可信。

### `src/server.js`
- 启动WebSocket服务器，处理客户端连接、消息接收和广播。
- 对客户端发送的消息进行格式验证和签名验证，将有效事件保存到数据库。

## 注意事项
- 确保MongoDB服务已启动，并且配置文件中的数据库连接信息正确。
- 管理员公钥需要在 `config/config.js` 中配置，所有权限操作需要管理员签名验证。
- 客户端和服务器使用相同的哈希算法和签名算法（SHA256和椭圆曲线签名），确保数据的一致性和安全性。

## 如何使用最新 eventstore-tools
```
npm update eventstore-tools --force
```

## 初始化 admin用户

```
node tools/admin-key.js
```

会产生一个admin的 公钥和私钥，
将公钥配置到 config/config.js里
```
module.exports = {
  // 数据库连接配置
  database: {
    uri: 'mongodb://localhost:27017',
    dbName: 'eventstore',
    // 连接池配置
    collections:{
      events:'events',
      users:'users',
      permissions: 'permissions' // 权限
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }
  },
  admin:{
    pubkey:"2bc5xxxxxx",
    email:"admin@xxxxx.com"
  },//pubkey
};

```

再次执行
```
node tools/admin-key.js
```

