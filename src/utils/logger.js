// src/utils/logger.js
const winston = require('winston');

// 配置日志记录
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    //new winston.transports.File({ filename: 'eventstore.log' })
  ]
});

module.exports = logger;
