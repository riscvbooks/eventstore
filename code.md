# `code` 码规则文档

## 一、概述
本 `code` 码规则用于对系统中的不同操作进行分类和标识，将 `code` 码划分为不同的类别，每个类别下包含具体的子类型，方便系统开发、维护和管理。

## 二、`code` 码分类及子类型

### （一）用户相关操作（`100 - 199`）
| `code` 码 | 操作描述 |
| ---- | ---- |
| 100 | 创建用户 |
| 101 | 更新用户信息 |
| 102 | 删除用户 |
| 103 | 查询用户信息 |
| 104 | 获取用户总数 |

#### 详细说明
- **创建用户（100）**：当客户端发起创建新用户的请求时，使用此 `code` 码。系统会验证用户提供的信息（如公钥、邮箱、签名等），若信息合法且唯一，则将用户信息存储到数据库中。
- **更新用户信息（101）**：用于更新已存在用户的信息，但禁止修改用户的公钥和邮箱，以确保公钥和邮箱的关联关系不可变。系统会验证更新请求的合法性，并更新相应的用户信息。
- **删除用户（102）**：执行逻辑删除操作，将用户的状态标记为 `deleted`，而不是从数据库中物理删除用户信息。
- **查询用户信息（103）**：根据用户的公钥或邮箱查询用户的详细信息。
- **获取用户总数（104）**：用于查询系统中的用户总数量，包括正常状态和已删除状态的用户（可通过参数指定是否区分状态）。系统会验证请求者权限，返回相应的统计结果。


### （二）事件相关操作（`200 - 299`）
| `code` 码 | 操作描述 |
| ---- | ---- |
| 200 | 创建事件 |
| 201 | 更新事件信息 |
| 202 | 删除事件 |
| 203 | 查询事件信息 |
| 204 | 获取事件总数 |

#### 详细说明
- **创建事件（200）**：客户端发起创建新事件的请求时使用此 `code` 码。系统会对事件的字段进行校验，包括时间、用户、签名等，若校验通过，则将事件信息存储到数据库中。
- **更新事件信息（201）**：用于更新已存在事件的信息。系统会验证更新请求的合法性，并更新相应的事件信息。
- **删除事件（202）**：从数据库中删除指定的事件信息。
- **查询事件信息（203）**：根据指定的条件（如用户、标签等）查询事件的详细信息。
- **获取事件总数（204）**：用于查询系统中的事件总数量，支持按时间范围、状态等条件进行统计。系统验证权限后返回符合条件的事件总数。


### （三）权限相关操作（`300 - 399`）
| `code` 码 | 操作描述 |
| ---- | ---- |
| 300 | 分配权限 |
| 301 | 撤销权限 |
| 303 | 查询权限信息 |
| 304 | 获取权限总数 |

#### 详细说明
- **分配权限（300）**：管理员发起为用户分配权限的请求时使用此 `code` 码。系统会验证权限的存在性和管理员的签名，若验证通过，则将权限分配给指定用户。
- **撤销权限（301）**：管理员发起撤销用户权限的请求时使用此 `code` 码。系统会验证权限的存在性和管理员的签名，若验证通过，则从用户的权限列表中移除指定权限。
- **查询权限信息（303）**：查询指定用户的所有权限信息。
- **获取权限总数（304）**：用于查询系统中定义的权限类型总数量，或查询指定用户拥有的权限数量。返回相应的统计数据。


### （四）文件操作（`400 - 499`）
| `code` 码 | 操作描述 |
| ---- | ---- |
| 400 | 上传文件 |
| 401 | 更新文件 |
| 402 | 删除文件 |
| 403 | 查询文件信息 |
| 404 | 获取文件总数 |

#### 详细说明
- **上传文件（400）**：用户发起上传文件的请求时使用此 `code` 码。系统会验证用户权限，接收文件数据并存储到服务器，返回文件访问URL。
- **更新文件 （401）**：用户发起更新文件 的请求时使用此 `code` 码。系统会验证用户权限，返回文件内容或访问URL。
- **删除文件（402）**：用户发起删除文件的请求时使用此 `code` 码。系统会验证用户权限，从服务器存储中删除文件。
- **查询文件信息（403）**：查询指定文件的元信息，如大小、类型、上传时间等。
- **获取文件总数（404）**：用于查询系统中存储的文件总数量，支持按文件类型、大小范围等条件进行统计。返回符合条件的文件总数。


## 三、使用示例
在客户端与服务器进行交互时，客户端发送的消息中应包含 `code` 码字段，服务器根据 `code` 码的不同进行相应的处理。

### 基础操作示例
创建用户请求示例：
```json
{
  "ops": "C",
  "code": 100,
  "user": "公钥",
  "data": {
    "email": "example@example.com"
  },
  "sig": "签名信息"
}
```

### 统计查询示例
获取用户总数请求示例：
```json
{
  "ops": "R",
  "code": 104,
  "user": "请求者公钥",
  "data": {
    "includeDeleted": false  // 是否包含已删除用户
  },
  "sig": "签名信息"
}
```

### 服务器处理逻辑示例
```javascript
// 处理客户端消息
async handleMessage(clientId, message) {
  try {
    const event = JSON.parse(message);
    let response;
    switch (event.code) {
      // 用户相关操作
      case 100:
        response = await this.userService.createUser(event.data);
        break;
      case 101:
        response = await this.userService.updateUser(event.user, event.data);
        break;
      case 102:
        response = await this.userService.deleteUser(event.user);
        break;
      case 103:
        response = await this.userService.queryUser(event.data);
        break;
      case 104:
        response = await this.userService.getUserCount(event.data);
        break;

      // 事件相关操作
      case 200:
        response = await this.eventService.createEvent(event);
        break;
      case 201:
        response = await this.eventService.updateEvent(event.data);
        break;
      case 202:
        response = await this.eventService.deleteEvent(event.data.id);
        break;
      case 203:
        response = await this.eventService.queryEvent(event.data);
        break;
      case 204:
        response = await this.eventService.getEventCount(event.data);
        break;

      // 权限相关操作
      case 300:
        response = await this.permissionService.assignPermission(event.user, event.data.permissionName, event.data.adminSig);
        break;
      case 301:
        response = await this.permissionService.revokePermission(event.user, event.data.permissionName, event.data.adminSig);
        break;
      case 303:
        response = await this.permissionService.queryPermission(event.user);
        break;
      case 304:
        response = await this.permissionService.getPermissionCount(event.user, event.data);
        break;

      // 文件相关操作
      case 400:
        response = await this.fileService.uploadFile(event.user, event.data);
        break;
      case 401:
        response = await this.fileService.updateFile(event.user, event.data);
        break;
      case 402:
        response = await this.fileService.deleteFile(event.user, event.data.fileId);
        break;
      case 403:
        response = await this.fileService.queryFile(event.data.fileId);
        break;
      case 404:
        response = await this.fileService.getFileCount(event.data);
        break;
    }
    // 发送响应给客户端
    this.sendResponse(clientId, {
      success: true,
      data: response
    });
  } catch (error) {
    // 处理错误
    this.sendResponse(clientId, {
      success: false,
      error: error.message
    });
  }
}
```