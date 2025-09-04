const { getClient } = require('./client');
const config = require('../../config/config');
const { PERMISSIONS } = require("eventstore-tools/src/common");
const { verifyEvent } = require("eventstore-tools/src/key");

class LikeService {
  constructor() {
    this.collections = config.database.collections;
    this.adminPubkey = config.admin.pubkey;
    this.createLike = this.toggleLike.bind(this);
  }

  // 获取数据库实例（复用共享客户端，与其他服务保持一致）
  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

  /**
   * 切换内容点赞状态（适配前端like_book函数，code:600）
   * @param {Object} likeEvent - 点赞事件（含tags标签：t/bid/liked）
   * @returns {Object} 操作结果
   */
  async toggleLike(likeEvent) {
    const db = await this.getDb();
    const likesCollection = db.collection(this.collections.likes);
    const permissionsCollection = db.collection(this.collections.permissions);
    let query = {};

    // 1. 校验点赞专属code码
    if (likeEvent.code !== 600) {
      return { code: 400, message: '无效点赞code码，仅支持600' };
    }

    // 2. 时间校验（5分钟容忍度）
    const clientTime = new Date(likeEvent.created_at);
    const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - clientTime);
    if (timeDiff > 5 * 60 * 1000) { // 5分钟容忍度
      return {code:500,message:'时间和服务器差距太大'}
    }

    // 3. 用户与权限校验
    const user = await permissionsCollection.findOne({ pubkey: likeEvent.user });
    if (!user) return { code: 500, message: '无效用户' };
 
    // 4. 签名验证
    const isValid = verifyEvent(likeEvent, likeEvent.user);
    if (!isValid) return { code: 500, message: '签名验证失败' };

    // 5. 解析前端tags标签
    const getTagValue = (tags,tagKey) => {
      const tag =  tags?.find(item => Array.isArray(item) && item[0] === tagKey);
      return tag ? tag[1] : '';
    };

    function setTagsValue  (tags,tagKey ,value) {
        // 遍历数组查找liked标签
        for (let i = 0; i < tags.length; i++) {
            if (tags[i][0] === tagKey) {
                // 找到后设置值并返回
                tags[i][1] = value;
                return tags;
            }
        }
    }
 
    if (likeEvent.tags) query["tags"] = { $all: likeEvent.tags };
    query['user'] = likeEvent.user;

    
    // 7. 处理点赞/取消点赞
    const existingLike = await likesCollection.findOne(query);

    
    if (existingLike) {
        let liked = getTagValue(existingLike.tags,'liked');
    
        if (liked == 0) {
            liked = 1
        } else {
            liked = 0;
        }
      let tags = setTagsValue(existingLike.tags,'liked',liked);
      // 更新现有点赞状态
      await likesCollection.updateOne(
        { _id: existingLike._id },
        { $set: { tags, updateTime: new Date() } }
      );
      return { 
        code: 200, 
        message: liked ? '点赞成功' : '取消点赞成功',
        liked,
 
      };
    } else {
      // 创建新点赞记录
      likeEvent.tags.push(['liked',1])
      await likesCollection.insertOne(
        likeEvent);
      return { 
        code: 200, 
        message: '点赞成功',
        liked: 1,
      };
    }
  }

  /**
   * 查询用户对指定内容的点赞记录（适配前端get_book_like函数，code:603）
   * @param {Object} queryEvent - 查询事件（含eventuser、tags.bid）
   * @returns {Array} 点赞记录列表
   */
  async readLikes(queryEvent) {
    const db = await this.getDb();
    const likesCollection = db.collection(this.collections.likes);
    const query = { };

    // 1. 校验查询专属code码
    if (queryEvent.code !== 603) {
      return { code: 400, message: '无效点赞查询code码，仅支持603' };
    }

    // 2. 解析查询条件
    if (queryEvent.eventuser) query.user = queryEvent.eventuser;
   
    if (queryEvent.tags) query["tags"] = { $all: queryEvent.tags };

    // 4. 执行查询并格式化结果
    const likeRecords = await likesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return likeRecords ;
  }

  /**
   * 查询指定内容的点赞总数（适配前端get_book_like_counts函数，code:604）
   * @param {Object} countEvent - 统计事件（含tags.bid）
   * @returns {Object} 点赞统计结果
   */
  async counts(event){
    const db = await this.getDb();
    let filter = {};
    if (event.eventuser) filter.user = event.eventuser;
    if (event.tags) filter.tags = { $all: event.tags };
  
    const total = await db.collection(this.collections.likes).countDocuments(filter);
    return { code: 200, message: '成功', counts:total };
  }

}

module.exports = LikeService;