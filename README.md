# eventstore

`eventstore` 是一个基于WebSocket和MongoDB的事件存储系统，支持CRUD操作，并提供了权限管理和签名验证机制，以确保数据的安全性和完整性。

## 项目结构
```
eventstore/
├── config/
│   └── config.js           # 配置文件，包含数据库连接信息和管理员公钥
├── src/
│   ├── db/
│   │   ├── client.js       # MongoDB客户端连接和初始化
│   │   ├── events.js       # 事件相关的数据库操作
│   │   ├── permissions.js  # 权限管理相关的数据库操作
│   │   └── users.js        # 用户相关的数据库操作
│   └── server.js           # WebSocket服务器
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
      events: 'events',
      users: 'users'
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }
  },
  admin: {
    pubkey: "" // 管理员公钥
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
  "sha256": "sha256(serialized)", // 事件ID，由序列化数据的SHA256哈希生成
  "user": "publickey", // 用户公钥
  "content": "{\"title\":\"新书\"}", // 实际内容
  "tags": [["d", "book_001"]], // 标签
  "created_at": 1750915446, // 创建时间戳
  "sig": "xxxx" // 签名
}]
```

### 响应格式
```javascript
["RESP", "b1", "OK"]
```

## 客户端编程例子
```javascript
// 假设 sha256 和 sign 函数已经正确引入
const sha256 = require('crypto-js/sha256');
const { ec } = require('elliptic');
const ecInstance = new ec('secp256k1');

function sign(message, privateKey) {
    const key = ecInstance.keyFromPrivate(privateKey);
    const signature = key.sign(message);
    return signature.toDER('hex');
}

// 1. 构造核心事件数据（不含id和sig）
const eventData = {
    ops: "C",                     // 操作类型: C/R/U/D
    code: 1,                      // 命令类型: 1=短文本, 2=长文本等
    user: "公钥",                 // 用户公钥
    content: "{\"title\":\"新书\"}", // 实际内容
    tags: [["d", "book_001"]],    // 标签
    created_at: 1680000000        // 创建时间戳
};

// 2. 序列化事件（按固定顺序）
const serialized = JSON.stringify([
    eventData.ops,
    eventData.code,
    eventData.user,
    eventData.created_at,
    eventData.tags,
    eventData.content
]);

// 3. 生成事件 ID (SHA256 哈希)
const eventId = sha256(serialized).toString();

// 4. 对事件 ID 进行签名
const privateKey = 'your_private_key'; // 替换为实际的私钥
const sig = sign(eventId, privateKey);

// 5. 构造完整事件
const event = {
    ...eventData,
    sha256: eventId,  // 包含哈希值
    sig: sig          // 签名
};
```

## 服务器验证例子
```javascript
const { getClient } = require('./src/db/client.js');
const config = require('./config/config');
const sha256 = require('crypto-js/sha256');
const { ec } = require('elliptic');
const ecInstance = new ec('secp256k1');

// 辅助函数：从标签中获取值
function getTagValue(tags, tagName) {
    const tag = tags.find(t => t[0] === tagName);
    return tag ? tag[1] : null;
}

// 权限检查函数
async function checkPermission(pubkey, ops, code, tags) {
    const client = await getClient();
    const db = client.db(config.database.dbName);
    // 1. 获取用户角色
    const user = await db.collection(config.database.collections.users).findOne({ pubkey });
    if (!user) return false;

    // 2. 获取权限规则
    const permissions = await db.collection('permissions').findOne({
        role: user.role
    });

    if (!permissions) return false;

    // 3. 检查操作权限
    if (!permissions.ops.includes(ops)) {
        return false;
    }

    // 4. 检查命令类型权限
    if (!permissions.cmds.includes(code)) {
        return false;
    }

    // 5. 检查特定资源权限（例如书籍 ID）
    if (ops === 'C' || ops === 'U' || ops === 'D') {
        const bookId = getTagValue(tags, 'd');
        if (bookId) {
            // 检查用户是否有该书籍的权限
            const book = await db.collection('books').findOne({
                book_id: bookId,
                collaborators: pubkey
            });

            if (!book) {
                return false;
            }

            // 检查协作权限级别
            const collab = book.collaborators.find(c => c.pubkey === pubkey);
            if (ops === 'D' && collab.permission !== 'owner') {
                return false; // 只有所有者可以删除
            }
        }
    }

    return true;
}

async function validateEvent(event) {
    const client = await getClient();
    const db = client.db(config.database.dbName);
    // 1. 时间校验（允许±5 分钟误差）
    const now = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
    const timeDiff = Math.abs(now - event.created_at);
    const MAX_TIME_DIFF = 300; // 5 分钟（300 秒）

    if (timeDiff > MAX_TIME_DIFF) {
        return {
            valid: false,
            code: "INVALID_TIME",
            message: `时间误差过大（${timeDiff} 秒），最大允许±${MAX_TIME_DIFF} 秒`
        };
    }

    // 2. 构造序列化数据
    const serializedData = [
        event.ops,
        event.code,
        event.user,
        event.created_at,
        event.tags,
        event.content
    ];

    // 3. 序列化并计算哈希
    const serialized = JSON.stringify(serializedData);
    const calculatedHash = sha256(serialized).toString();

    // 4. 验证哈希
    if (calculatedHash !== event.sha256) {
        return {
            valid: false,
            code: "INVALID_HASH",
            message: "事件哈希不匹配"
        };
    }

    // 5. 验证签名
    const isSigValid = ecInstance.keyFromPublic(event.user, 'hex')
      .verify(
            event.sha256,
            event.sig
        );

    if (!isSigValid) {
        return {
            valid: false,
            code: "INVALID_SIG",
            message: "签名验证失败"
        };
    }

    // 6. 检查用户存在性
    const user = await db.collection(config.database.collections.users).findOne({
        pubkey: event.user
    });

    if (!user) {
        return {
            valid: false,
            code: "USER_NOT_FOUND",
            message: "用户不存在"
        };
    }

    // 7. 检查用户状态
    if (user.status !== 'active') {
        return {
            valid: false,
            code: "USER_INACTIVE",
            message: `用户状态为: ${user.status}`
        };
    }

    // 8. 权限验证
    const hasPermission = await checkPermission(
        event.user,
        event.ops,
        event.code,
        event.tags
    );

    if (!hasPermission) {
        return {
            valid: false,
            code: "PERMISSION_DENIED",
            message: `用户无权执行 ${event.ops} 操作`
        };
    }

    // 9. 检查事件 ID 唯一性
    if (await db.collection(config.database.collections.events).findOne({ sha256: event.sha256 })) {
        return {
            valid: false,
            code: "DUPLICATE_EVENT",
            message: "事件 ID 已存在"
        };
    }

    return { valid: true };
}
```

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

