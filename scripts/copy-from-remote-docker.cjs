// scripts/copy-from-remote.cjs
// 从远程服务器复制文件到本地的脚本

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// 手动读取 .env.local 文件
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = {};
  
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // 跳过空行和注释
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            // 支持值中包含 = 号的情况
            const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // 移除引号
            env[key.trim()] = value;
          }
        }
      }
      console.log('✅ 已加载 .env.local 配置文件');
    } else {
      console.warn('⚠️ 未找到 .env.local 文件，将使用默认配置或命令行参数');
    }
  } catch (error) {
    console.warn('⚠️ 读取 .env.local 文件失败:', error.message);
  }
  
  return env;
}

// 加载环境变量
const envVars = loadEnvLocal();

// 配置参数
const config = {
  // 远程服务器配置
  remote: {
    host: envVars.REMOTE_HOST || '',
    port: parseInt(envVars.REMOTE_PORT) || 22,
    username: envVars.REMOTE_USERNAME || 'root',
    password: envVars.REMOTE_PASSWORD || null, // 从 .env.local 读取
    privateKey: envVars.REMOTE_PRIVATE_KEY || null, // 或使用私钥路径
  },
  
  // 本地目标路径
  localTarget: path.join(process.cwd(), 'database'),
  
  // 远程数据库目录
  remotePath: envVars.REMOTE_DATA_PATH || '/root/nextchat-data'
};

class RemoteFileCopy {
  constructor() {
    this.ssh = new Client();
  }

  // 连接到远程服务器
  async connect() {
    return new Promise((resolve, reject) => {
      this.ssh.on('ready', () => {
        console.log('✅ SSH连接成功');
        resolve();
      });

      this.ssh.on('error', (err) => {
        console.error('❌ SSH连接失败:', err.message);
        reject(err);
      });

      // 根据配置连接
      if (config.remote.privateKey && fs.existsSync(config.remote.privateKey)) {
        this.ssh.connect({
          ...config.remote,
          privateKey: fs.readFileSync(config.remote.privateKey)
        });
      } else if (config.remote.password) {
        this.ssh.connect(config.remote);
      } else {
        reject(new Error('请提供SSH密码或私钥路径'));
      }
    });
  }

  // 执行远程命令
  async execCommand(command) {
    return new Promise((resolve, reject) => {
      this.ssh.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code) => {
            if (code === 0) {
              resolve(stdout);
            } else {
              reject(new Error(`命令执行失败 (退出码: ${code}): ${stderr}`));
            }
          })
          .on('data', (data) => {
            stdout += data;
          })
          .stderr.on('data', (data) => {
            stderr += data;
          });
      });
    });
  }

  // 通过SFTP下载文件到本地
  async downloadFiles() {
    return new Promise((resolve, reject) => {
      console.log('⬇️ 开始下载文件到本地...');
      
      this.ssh.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        // 确保本地目标目录存在
        if (!fs.existsSync(config.localTarget)) {
          fs.mkdirSync(config.localTarget, { recursive: true });
        }

        this.downloadDirectory(sftp, config.remotePath, config.localTarget)
          .then(() => {
            console.log('✅ 文件下载完成');
            resolve();
          })
          .catch(reject);
      });
    });
  }

  // 递归下载目录
  async downloadDirectory(sftp, remotePath, localPath) {
    const readdir = promisify(sftp.readdir.bind(sftp));
    const stat = promisify(sftp.stat.bind(sftp));
    const fastGet = promisify(sftp.fastGet.bind(sftp));

    try {
      const files = await readdir(remotePath);
      
      for (const file of files) {
        const remoteFilePath = path.posix.join(remotePath, file.filename);
        const localFilePath = path.join(localPath, file.filename);
        
        const stats = await stat(remoteFilePath);
        
        if (stats.isDirectory()) {
          // 创建本地目录并递归下载
          if (!fs.existsSync(localFilePath)) {
            fs.mkdirSync(localFilePath, { recursive: true });
          }
          await this.downloadDirectory(sftp, remoteFilePath, localFilePath);
        } else {
          // 下载文件
          console.log(`📄 下载: ${file.filename}`);
          await fastGet(remoteFilePath, localFilePath);
        }
      }
    } catch (error) {
      throw new Error(`下载目录失败: ${error.message}`);
    }
  }

  // 断开连接
  disconnect() {
    this.ssh.end();
    console.log('🔌 SSH连接已断开');
  }

  // 主执行函数
  async run() {
    try {
      console.log('🚀 开始从远程服务器复制文件...');
      console.log(`📍 远程服务器: ${config.remote.host}`);
      console.log(`📂 远程路径: ${config.remotePath}`);
      console.log(`💾 本地目标路径: ${config.localTarget}`);
      
      await this.connect();
      await this.downloadFiles();
      
      console.log('🎉 文件复制完成！');
    } catch (error) {
      console.error('❌ 复制过程中出现错误:', error.message);
      throw error;
    } finally {
      this.disconnect();
    }
  }
}

// 如果直接运行脚本
if (require.main === module) {
  // 检查命令行参数
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
使用方法: node copy-from-remote.cjs [选项]

选项:
  --username <用户名>     SSH用户名 (默认: root)
  --password <密码>       SSH密码
  --key <私钥路径>        SSH私钥文件路径
  --host <服务器地址>     远程服务器地址
  --port <端口>           SSH端口 (默认: 22)
  --remote-path <路径>    远程数据路径
  --help                  显示帮助信息

环境变量 (.env.local):
  REMOTE_HOST            远程服务器地址
  REMOTE_PORT            SSH端口
  REMOTE_USERNAME        SSH用户名
  REMOTE_PASSWORD        SSH密码
  REMOTE_PRIVATE_KEY     SSH私钥文件路径
  REMOTE_DATA_PATH       远程数据目录路径

示例:
  node copy-from-remote.cjs --username myuser --password mypass
  node copy-from-remote.cjs --username myuser --key ~/.ssh/id_rsa
  
注意: 建议在 .env.local 文件中配置敏感信息（如密码），该文件不会被提交到版本控制。
    `);
    process.exit(0);
  }

  // 解析命令行参数（命令行参数优先级高于环境变量）
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--username':
        config.remote.username = value;
        break;
      case '--password':
        config.remote.password = value;
        break;
      case '--key':
        config.remote.privateKey = value;
        break;
      case '--host':
        config.remote.host = value;
        break;
      case '--port':
        config.remote.port = parseInt(value);
        break;
      case '--remote-path':
        config.remotePath = value;
        break;
    }
  }

  // 验证认证方式
  if (!config.remote.password && !config.remote.privateKey) {
    console.error('❌ 请提供SSH密码或私钥路径');
    console.log('💡 提示: 可以在 .env.local 文件中设置 REMOTE_PASSWORD 环境变量');
    console.log('💡 或者使用命令行参数: --password <密码> 或 --key <私钥路径>');
    console.log('使用 --help 查看详细使用方法');
    process.exit(1);
  }

  // 执行复制
  const copier = new RemoteFileCopy();
  copier.run().catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = RemoteFileCopy;