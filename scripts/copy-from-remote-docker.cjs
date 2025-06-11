// scripts/copy-from-remote-docker.js
// 从远程Docker容器复制文件到本地的脚本

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// 配置参数
const config = {
  // 远程服务器配置
  remote: {
    host: '81.68.92.237',
    port: 22,
    username: 'root', // 根据实际情况修改
    password: 'Wangnan200401', // 或使用密码
    privateKey: null, // 或使用私钥路径
  },
  
  // Docker配置
  docker: {
    containerId: '480f3615860e',
    sourcePath: '/app/data/.',
    containerName: 'coderunxiaoming/nextchat_interview:latest',
  },
  
  // 本地目标路径
  localTarget: path.join(process.cwd(), 'database'),
  
  // 远程临时目录
  remoteTempDir: '/tmp/docker_copy_temp'
};

class RemoteDockerCopy {
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
      if (config.remote.privateKey) {
        this.ssh.connect({
          ...config.remote,
          privateKey: fs.readFileSync(config.remote.privateKey)
        });
      } else {
        this.ssh.connect(config.remote);
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

  // 从Docker容器复制文件到远程服务器临时目录
  async copyFromContainer() {
    console.log('📦 开始从Docker容器复制文件...');
    
    // 创建远程临时目录
    await this.execCommand(`mkdir -p ${config.remoteTempDir}`);
    
    // 使用docker cp命令复制文件
    const dockerCpCommand = `docker cp ${config.docker.containerId}:${config.docker.sourcePath} ${config.remoteTempDir}/`;
    
    try {
      await this.execCommand(dockerCpCommand);
      console.log('✅ 文件已复制到远程临时目录');
    } catch (error) {
      throw new Error(`Docker复制失败: ${error.message}`);
    }
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

        this.downloadDirectory(sftp, config.remoteTempDir, config.localTarget)
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

  // 清理远程临时文件
  async cleanup() {
    try {
      await this.execCommand(`rm -rf ${config.remoteTempDir}`);
      console.log('🧹 清理远程临时文件完成');
    } catch (error) {
      console.warn('⚠️ 清理临时文件失败:', error.message);
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
      console.log('🚀 开始从远程Docker容器复制文件...');
      console.log(`📍 远程服务器: ${config.remote.host}`);
      console.log(`📦 容器ID: ${config.docker.containerId}`);
      console.log(`📂 源路径: ${config.docker.sourcePath}`);
      console.log(`💾 目标路径: ${config.localTarget}`);
      
      await this.connect();
      await this.copyFromContainer();
      await this.downloadFiles();
      await this.cleanup();
      
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
使用方法: node copy-from-remote-docker.js [选项]

选项:
  --username <用户名>    SSH用户名 (默认: root)
  --password <密码>      SSH密码
  --key <私钥路径>       SSH私钥文件路径
  --container <容器ID>   Docker容器ID (默认: ${config.docker.containerId})
  --help                显示帮助信息

示例:
  node copy-from-remote-docker.js --username myuser --password mypass
  node copy-from-remote-docker.js --username myuser --key ~/.ssh/id_rsa
    `);
    process.exit(0);
  }

  // 解析命令行参数
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
      case '--container':
        config.docker.containerId = value;
        break;
    }
  }

  // 验证认证方式
  if (!config.remote.password && !config.remote.privateKey) {
    console.error('❌ 请提供SSH密码或私钥路径');
    console.log('使用 --help 查看使用方法');
    process.exit(1);
  }

  // 执行复制
  const copier = new RemoteDockerCopy();
  copier.run().catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = RemoteDockerCopy;