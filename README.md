# eventstore  
CRUD 操作说明
```
["REQ", "b1", {
  "ops": ["C"],
  "cmd":  1,
  "sha256": sha256(serialized),
  "user": publickey,
  "content": "{\"title\":\"新书\"}",
  "tags": [["d", "book_001"]],
  "create_at":1750915446,
  "sig":xxxx,
}]
```

ops 是CRUD中的一种， cmd 代码是 短文本，长文本等。

服务器返回:

```
["RESP","b1","OK"]
```

### 客户端编程例子
```
// 1. 构造核心事件数据（不含id和sig）
const eventData = {
  ops: "C",                     // 操作类型: C/R/U/D
  cmd: 1,                       // 命令类型: 1=短文本, 2=长文本等
  user: "公钥",                  // 用户公钥
  content: "{\"title\":\"新书\"}", // 实际内容
  tags: [["d", "book_001"]],    // 标签
  created_at: 1680000000        // 创建时间戳
};

// 2. 序列化事件（按固定顺序）
const serialized = JSON.stringify([
  eventData.ops,
  eventData.cmd,
  eventData.user,
  eventData.created_at,
  eventData.tags,
  eventData.content
]);

// 3. 生成事件ID (SHA256哈希)
const eventId = sha256(serialized);

// 4. 对事件ID进行签名
const sig = sign(eventId, privateKey);

// 5. 构造完整事件
const event = {
  ...eventData,
  sha256: eventId,  // 包含哈希值
  sig: sig          // 签名
};
```


服务器例子:

```
async function validateEvent(event) {
  // 1. 时间校验（允许±5分钟误差）
  const now = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
  const timeDiff = Math.abs(now - event.created_at);
  const MAX_TIME_DIFF = 300; // 5分钟（300秒）
  
  if (timeDiff > MAX_TIME_DIFF) {
    return {
      valid: false,
      code: "INVALID_TIME",
      message: `时间误差过大（${timeDiff}秒），最大允许±${MAX_TIME_DIFF}秒`
    };
  }

  // 2. 构造序列化数据
  const serializedData = [
    event.ops,
    event.cmd,
    event.user,
    event.created_at,
    event.tags,
    event.content
  ];
  
  // 3. 序列化并计算哈希
  const serialized = JSON.stringify(serializedData);
  const calculatedHash = sha256(serialized);
  
  // 4. 验证哈希
  if (calculatedHash !== event.sha256) {
    return {
      valid: false,
      code: "INVALID_HASH",
      message: "事件哈希不匹配"
    };
  }
  
  // 5. 验证签名
  const isSigValid = verifySignature(
    event.user,   // 公钥
    event.sig,    // 签名
    event.sha256  // 消息
  );
  
  if (!isSigValid) {
    return {
      valid: false,
      code: "INVALID_SIG",
      message: "签名验证失败"
    };
  }
  
  // 6. 检查用户存在性
  const user = await db.collection('users').findOne({
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
    event.cmd,
    event.tags
  );
  
  if (!hasPermission) {
    return {
      valid: false,
      code: "PERMISSION_DENIED",
      message: `用户无权执行 ${event.ops} 操作`
    };
  }
  
  // 9. 检查事件ID唯一性
  if (await db.collection('events').findOne({ sha256: event.sha256 })) {
    return {
      valid: false,
      code: "DUPLICATE_EVENT",
      message: "事件ID已存在"
    };
  }
  
  return { valid: true };
}

// 权限检查函数
async function checkPermission(pubkey, ops, cmd, tags) {
  // 1. 获取用户角色
  const user = await db.collection('users').findOne({ pubkey });
  if (!user) return false;
  
  // 2. 获取权限规则
  const permissions = await db.collection('permissions').findOne({
    role: user.role
  });
  
  // 3. 检查操作权限
  if (!permissions.ops.includes(ops)) {
    return false;
  }
  
  // 4. 检查命令类型权限
  if (!permissions.cmds.includes(cmd)) {
    return false;
  }
  
  // 5. 检查特定资源权限（例如书籍ID）
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

// 辅助函数：从标签中获取值
function getTagValue(tags, tagName) {
  const tag = tags.find(t => t[0] === tagName);
  return tag ? tag[1] : null;
}
```
