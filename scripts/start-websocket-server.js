#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取项目根目录和WebSocket服务器目录
const projectRoot = join(__dirname, '..');
const serverDir = join(projectRoot, 'websocket-server');
const serverScript = join(serverDir, 'server.js');

/**
 * 启动WebSocket服务器的脚本
 */
class WebSocketServerStarter {
  constructor() {
    this.serverProcess = null;
  }

  /**
   * 检查服务器文件是否存在
   */
  checkServerFiles() {
    const requiredFiles = [
      join(serverDir, 'package.json'),
      join(serverDir, 'server.js'),
      join(serverDir, 'roomManager.js'),
      join(serverDir, 'messageHandler.js'),
      join(serverDir, 'utils.js')
    ];

    const missingFiles = requiredFiles.filter(file => !existsSync(file));
    
    if (missingFiles.length > 0) {
      console.error('❌ 缺少必要的服务器文件:');
      missingFiles.forEach(file => {
        console.error(`   - ${file}`);
      });
      return false;
    }

    return true;
  }

  /**
   * 安装服务器依赖
   */
  async installDependencies() {
    return new Promise((resolve, reject) => {
      console.log('📦 正在安装WebSocket服务器依赖...');
      
      const npmInstall = spawn('npm', ['install'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });

      npmInstall.on('close', (code) => {
        if (code === 0) {
          console.log('✅ 依赖安装成功');
          resolve();
        } else {
          console.error('❌ 依赖安装失败');
          reject(new Error(`npm install退出码: ${code}`));
        }
      });

      npmInstall.on('error', (error) => {
        console.error('❌ 启动npm install失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 启动WebSocket服务器
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      console.log('🚀 正在启动WebSocket服务器...');
      
      // 设置环境变量
      const env = {
        ...process.env,
        WS_PORT: process.env.WS_PORT || '8080',
        WS_HOST: process.env.WS_HOST || 'localhost',
        NODE_ENV: process.env.NODE_ENV || 'development'
      };

      // 启动服务器进程
      this.serverProcess = spawn('node', ['server.js'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env
      });

      this.serverProcess.on('spawn', () => {
        console.log('✅ WebSocket服务器已启动');
        console.log(`🌐 服务器地址: ws://${env.WS_HOST}:${env.WS_PORT}`);
        console.log('💡 提示: 按 Ctrl+C 停止服务器');
        resolve();
      });

      this.serverProcess.on('error', (error) => {
        console.error('❌ 启动WebSocket服务器失败:', error);
        reject(error);
      });

      this.serverProcess.on('close', (code, signal) => {
        if (signal) {
          console.log(`\n📡 WebSocket服务器已停止 (信号: ${signal})`);
        } else {
          console.log(`\n📡 WebSocket服务器已停止 (退出码: ${code})`);
        }
      });
    });
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    const shutdown = () => {
      if (this.serverProcess) {
        console.log('\n🛑 正在停止WebSocket服务器...');
        this.serverProcess.kill('SIGTERM');
        
        // 如果5秒后还没有关闭，强制杀死进程
        setTimeout(() => {
          if (this.serverProcess && !this.serverProcess.killed) {
            console.log('⚠️ 强制停止WebSocket服务器');
            this.serverProcess.kill('SIGKILL');
          }
        }, 5000);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);
  }

  /**
   * 运行启动器
   */
  async run() {
    try {
      console.log('🔧 WebSocket服务器启动器');
      console.log('=====================================');

      // 检查文件
      if (!this.checkServerFiles()) {
        process.exit(1);
      }

      // 检查是否需要安装依赖
      const nodeModulesPath = join(serverDir, 'node_modules');
      if (!existsSync(nodeModulesPath)) {
        await this.installDependencies();
      }

      // 设置优雅关闭
      this.setupGracefulShutdown();

      // 启动服务器
      await this.startServer();

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }
}

// 直接运行启动器
const starter = new WebSocketServerStarter();
starter.run().catch(console.error);

export default WebSocketServerStarter; 