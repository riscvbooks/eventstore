// src/utils/logger.js
const winston = require('winston');

// 配置日志记录
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(), // 启用颜色
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // 增加时间戳
    winston.format.printf(({ timestamp, level, message }) => {
      // 自定义输出格式：[时间] [级别] 消息
      return `[${timestamp}] [${level}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    //new winston.transports.File({ filename: 'eventstore.log' })
  ]
});

module.exports = logger;
