const { LocalStorage } = require('node-localstorage');
const { 
    generateSecretKey, 
    getPublicKey, 
    epubEncode,
    esecEncode,
} = require('../src/utils/key');
const logger = require('../src/utils/logger');

const { bytesToHex, hexToBytes } = require('@noble/hashes/utils');

const localStorage = new LocalStorage('.data');


let Keypub;
let Keypriv = localStorage.getItem('Keypriv');
if (Keypriv === null){
    Keypriv = generateSecretKey() // `sk` is a Uint8Array
    Keypub = getPublicKey(Keypriv) // `pk` is a hex string
    localStorage.setItem('Keypriv', Keypriv);
} else {
    const numArray = Keypriv.split(',').map(Number);
    Keypriv = new Uint8Array(numArray)
    Keypub = getPublicKey(Keypriv) // `pk` is a hex string
}

logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
logger.warn('⚠️ 安全提示：');
logger.warn('  • 秘钥存放在 .data 目录');
logger.warn('  • 请确保该目录不被版本控制系统跟踪（添加到 .gitignore）');
logger.warn('  • 敏感环境下建议手动管理秘钥文件');
logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
logger.info("Admin pub:" + Keypub + "\n\t\t\t" + epubEncode(Keypub))
logger.info("Admin priv:" + bytesToHex(Keypriv) + "\n\t\t\t" +esecEncode(Keypriv))
