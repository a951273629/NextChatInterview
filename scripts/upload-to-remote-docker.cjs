// scripts/upload-to-remote-docker.cjs
// 从本地上传文件到远程服务器的脚本（覆盖上传）

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
  
  // 本地源路径（数据库目录）
  localSource: path.join(process.cwd(), 'database'),
  
  // 远程目标数据库目录
  remotePath: envVars.REMOTE_DATA_PATH || '/root/nextchat-data'
};

class RemoteFileUpload {
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

  // 通过SFTP上传文件到远程服务器
  async uploadFiles() {
    return new Promise((resolve, reject) => {
      console.log('⬆️ 开始上传文件到远程服务器...');
      
      this.ssh.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        // 检查本地源目录是否存在
        if (!fs.existsSync(config.localSource)) {
          reject(new Error(`本地源目录不存在: ${config.localSource}`));
          return;
        }

        this.uploadDirectory(sftp, config.localSource, config.remotePath)
          .then(() => {
            console.log('✅ 文件上传完成');
            resolve();
          })
          .catch(reject);
      });
    });
  }

  // 创建远程目录
  async createRemoteDirectory(sftp, remotePath) {
    const mkdir = promisify(sftp.mkdir.bind(sftp));
    const stat = promisify(sftp.stat.bind(sftp));

    try {
      // 检查目录是否已存在
      await stat(remotePath);
      return; // 目录已存在
    } catch (error) {
      // 目录不存在，创建它
      try {
        // 递归创建父目录
        const parentDir = path.posix.dirname(remotePath);
        if (parentDir !== '/' && parentDir !== remotePath) {
          await this.createRemoteDirectory(sftp, parentDir);
        }
        
        await mkdir(remotePath);
        console.log(`📁 创建远程目录: ${remotePath}`);
      } catch (mkdirError) {
        // 如果是目录已存在的错误，忽略它
        if (mkdirError.code !== 4) { // SSH2_FX_FAILURE
          throw mkdirError;
        }
      }
    }
  }

  // 递归上传目录
  async uploadDirectory(sftp, localPath, remotePath) {
    const stat = promisify(sftp.stat.bind(sftp));
    const fastPut = promisify(sftp.fastPut.bind(sftp));

    try {
      // 确保远程目录存在
      await this.createRemoteDirectory(sftp, remotePath);

      // 读取本地目录内容
      const localFiles = fs.readdirSync(localPath);
      
      for (const fileName of localFiles) {
        const localFilePath = path.join(localPath, fileName);
        const remoteFilePath = path.posix.join(remotePath, fileName);
        
        const localStats = fs.statSync(localFilePath);
        
        if (localStats.isDirectory()) {
          // 递归上传子目录
          await this.uploadDirectory(sftp, localFilePath, remoteFilePath);
        } else {
          // 上传文件（覆盖模式）
          console.log(`📄 上传: ${fileName}`);
          await fastPut(localFilePath, remoteFilePath);
        }
      }
    } catch (error) {
      throw new Error(`上传目录失败: ${error.message}`);
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
      console.log('🚀 开始上传文件到远程服务器...');
      console.log(`📍 远程服务器: ${config.remote.host}`);
      console.log(`📂 本地源路径: ${config.localSource}`);
      console.log(`💾 远程目标路径: ${config.remotePath}`);
      
      await this.connect();
      await this.uploadFiles();
      
      console.log('🎉 文件上传完成！');
    } catch (error) {
      console.error('❌ 上传过程中出现错误:', error.message);
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
使用方法: node upload-to-remote-docker.cjs [选项]

选项:
  --username <用户名>     SSH用户名 (默认: root)
  --password <密码>       SSH密码
  --key <私钥路径>        SSH私钥文件路径
  --host <服务器地址>     远程服务器地址
  --port <端口>           SSH端口 (默认: 22)
  --local-path <路径>     本地数据源路径 (默认: ./database)
  --remote-path <路径>    远程目标路径
  --help                  显示帮助信息

环境变量 (.env.local):
  REMOTE_HOST            远程服务器地址
  REMOTE_PORT            SSH端口
  REMOTE_USERNAME        SSH用户名
  REMOTE_PASSWORD        SSH密码
  REMOTE_PRIVATE_KEY     SSH私钥文件路径
  REMOTE_DATA_PATH       远程数据目录路径

示例:
  node upload-to-remote-docker.cjs --username myuser --password mypass
  node upload-to-remote-docker.cjs --username myuser --key ~/.ssh/id_rsa
  node upload-to-remote-docker.cjs --local-path ./my-database --remote-path /data/backup
  
注意: 
  - 建议在 .env.local 文件中配置敏感信息（如密码），该文件不会被提交到版本控制
  - 此脚本会覆盖远程服务器上的同名文件，请谨慎使用
  - 确保本地数据库目录存在且包含要上传的文件
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
      case '--local-path':
        config.localSource = value;
        break;
      case '--remote-path':
        config.remotePath = value;
        break;
    }
  }

  // 验证配置
  if (!config.remote.host) {
    console.error('❌ 请提供远程服务器地址');
    console.log('💡 提示: 可以在 .env.local 文件中设置 REMOTE_HOST 环境变量');
    console.log('💡 或者使用命令行参数: --host <服务器地址>');
    console.log('使用 --help 查看详细使用方法');
    process.exit(1);
  }

  if (!config.remote.password && !config.remote.privateKey) {
    console.error('❌ 请提供SSH密码或私钥路径');
    console.log('💡 提示: 可以在 .env.local 文件中设置 REMOTE_PASSWORD 环境变量');
    console.log('💡 或者使用命令行参数: --password <密码> 或 --key <私钥路径>');
    console.log('使用 --help 查看详细使用方法');
    process.exit(1);
  }

  // 执行上传
  const uploader = new RemoteFileUpload();
  uploader.run().catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = RemoteFileUpload; 