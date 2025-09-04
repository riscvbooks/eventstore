const { getClient } = require('./client');
const config = require('../../config/config');
const { PERMISSIONS } = require("eventstore-tools/src/common");
const { verifyEvent } = require("eventstore-tools/src/key");

class CommentService {
  constructor() {
    this.collections = config.database.collections;
    this.adminPubkey = config.admin.pubkey; // 从配置文件读取管理员公钥
  }

  // 获取数据库实例（使用共享客户端）
  async getDb() {
    const client = await getClient();
    return client.db(config.database.dbName);
  }

  /**
   * 创建评论（支持嵌套回复）
   * @param {Object} comment - 评论对象
   * @returns {Object} 操作结果
   */
  async createComment(comment) {
    const db = await this.getDb();
    const commentsCollection = db.collection(this.collections.comments);
    const permissionsCollection = db.collection(this.collections.permissions);

    // 时间校验（5分钟容忍度）
    const clientTime = new Date(comment.created_at);
    const timeDiff = Math.abs(Date.now() - clientTime.getTime());
    if (timeDiff > 5 * 60 * 1000) {
      return { code: 500, message: '时间与服务器差距过大' };
    }

    // 用户权限校验
    const user = await permissionsCollection.findOne({ pubkey: comment.user });
    if (!user) {
      return { code: 500, message: '无效用户' };
    }

    // 检查评论权限
    /*
    if (comment.user !== this.adminPubkey && !(user.permissions & PERMISSIONS.CREATE_COMMENTS)) {
      return { code: 403, message: '无评论创建权限' };
    }*/

    // 签名验证
    const isValid = verifyEvent(comment, comment.user);
    if (!isValid) {
      return { code: 500, message: '签名验证失败' };
    }


    // 基础校验：评论内容不能为空
    if (!comment.data || comment.data.trim() === '') {
      return { code: 400, message: '评论内容不能为空' };
    }

    // 构建评论文档
    const commentDoc = {
      ...comment,
      servertimestamp: new Date(), 
    };


    // 保存评论
    await commentsCollection.insertOne(commentDoc);
    return { code: 200, message: '评论创建成功', commentId: comment.id };
  }

  /**
   * 查询评论列表（支持分页、排序、嵌套结构）
   * @param {Object} queryParams - 查询参数
   * @returns {Array} 评论列表
   */
  async readComments(queryParams) {
    const db = await this.getDb();
    const commentsCollection = db.collection(this.collections.comments);
    const query = {  };
 
    if (queryParams.tags) query["tags"] = { $all: queryParams.tags };
    if (queryParams.eventuser) query['user'] = queryParams.eventuser;

    // 处理分页参数
    let  limit = 100;
    let  offset =  0;

    if (queryParams.limit) limit = queryParams.limit;
    // 处理偏移量，确保是正数
    if (queryParams.offset) offset = Math.max(0, parseInt(queryParams.offset, 10) || 0);

    // 处理排序（默认按创建时间倒序）
    let sortOption = { created_at: -1 };
    if (queryParams.sortBy === 'likeCount') {
      sortOption = { likeCount: -1 };
    }

    // 执行查询
    const comments = await commentsCollection
      .find(query)
      .sort(sortOption)
      .skip(offset)
      .limit(limit)
      .toArray();

    // 如果需要嵌套结构，组装子评论
    /*if (queryParams.nested === true) {
      return this.buildNestedComments(comments);
    }*/

    return comments;
  }

  /**
   * 更新评论内容
   * @param {Object} updateData - 更新数据
   * @returns {Object} 操作结果
   */
  async updateComment(updateData) {
    const db = await this.getDb();
    const commentsCollection = db.collection(this.collections.comments);

    // 查找评论
    const comment = await commentsCollection.findOne({
      id: updateData.commentId,
      isDeleted: false
    });

    if (!comment) {
      return { code: 404, message: '评论不存在或已被删除' };
    }

    // 权限校验（只能修改自己的评论或管理员操作）
    if (updateData.user !== comment.user && updateData.user !== this.adminPubkey) {
      return { code: 403, message: '无评论修改权限' };
    }

    // 签名验证
    const isValid = verifyEvent(updateData, updateData.user);
    if (!isValid) {
      return { code: 500, message: '签名验证失败' };
    }

    // 内容校验
    if (!updateData.content || updateData.content.trim() === '') {
      return { code: 400, message: '评论内容不能为空' };
    }

    // 执行更新
    await commentsCollection.updateOne(
      { id: updateData.commentId },
      {
        $set: {
          content: updateData.content,
          updateTime: new Date(),
          updated_at: updateData.updated_at // 客户端更新时间
        }
      }
    );

    return { code: 200, message: '评论更新成功' };
  }

  /**
   * 删除评论（逻辑删除）
   * @param {Object} deleteData - 删除操作数据
   * @returns {Object} 操作结果
   */
  async deleteComment(deleteData) {
    const db = await this.getDb();
    const commentsCollection = db.collection(this.collections.comments);

    // 查找评论
    const comment = await commentsCollection.findOne({
      id: deleteData.commentId,
      isDeleted: false
    });

    if (!comment) {
      return { code: 404, message: '评论不存在或已被删除' };
    }

    // 权限校验
    if (deleteData.user !== comment.user && deleteData.user !== this.adminPubkey) {
      return { code: 403, message: '无评论删除权限' };
    }

    // 签名验证
    const isValid = verifyEvent(deleteData, deleteData.user);
    if (!isValid) {
      return { code: 500, message: '签名验证失败' };
    }

    // 执行逻辑删除
    await commentsCollection.updateOne(
      { id: deleteData.commentId },
      {
        $set: {
          isDeleted: true,
          deleteTime: new Date()
        }
      }
    );

    // 如果是管理员操作，级联标记子评论
    if (deleteData.user === this.adminPubkey && deleteData.cascade === true) {
      await commentsCollection.updateMany(
        { parentId: deleteData.commentId, isDeleted: false },
        { $set: { isDeleted: true, deleteTime: new Date() } }
      );
    }

    return { code: 200, message: '评论删除成功' };
  }

  /**
   * 更新评论点赞数
   * @param {Object} likeData - 点赞数据
   * @returns {Object} 操作结果
   */
  async updateLikeCount(likeData) {
    const db = await this.getDb();
    const commentsCollection = db.collection(this.collections.comments);

    // 查找评论
    const comment = await commentsCollection.findOne({
      id: likeData.commentId,
      isDeleted: false
    });

    if (!comment) {
      return { code: 404, message: '评论不存在或已被删除' };
    }

    // 执行点赞数更新（+1或-1）
    const update = likeData.isLiked 
      ? { $inc: { likeCount: 1 } } 
      : { $inc: { likeCount: -1 } };

    await commentsCollection.updateOne(
      { id: likeData.commentId },
      update
    );

    // 返回更新后的点赞数
    const updatedComment = await commentsCollection.findOne({ id: likeData.commentId });
    return { 
      code: 200, 
      message: likeData.isLiked ? '评论点赞成功' : '评论取消点赞成功',
      likeCount: updatedComment.likeCount
    };
  }

  /**
   * 统计评论数量
   * @param {Object} filter - 过滤条件
   * @returns {Object} 统计结果
   */
  async counts(event){
    const db = await this.getDb();
    let filter = {};
    if (event.eventuser) filter.user = event.eventuser;
    if (event.tags) filter.tags = { $all: event.tags };
  
    const total = await db.collection(this.collections.comments).countDocuments(filter);
    return { code: 200, message: '成功', counts:total };
  }

  /**
   * 构建嵌套评论结构
   * @param {Array} comments - 平级评论列表
   * @returns {Array} 嵌套结构评论列表
   */
  async buildNestedComments(comments) {
    const commentMap = new Map();
    const rootComments = [];

    // 先将所有评论按ID映射
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // 构建嵌套关系
    comments.forEach(comment => {
      if (comment.parentId && commentMap.has(comment.parentId)) {
        // 子评论添加到父评论的replies中
        commentMap.get(comment.parentId).replies.push(commentMap.get(comment.id));
      } else {
        // 根评论直接加入结果集
        rootComments.push(commentMap.get(comment.id));
      }
    });

    return rootComments;
  }
}

// 导出服务类
module.exports = CommentService;
    