#!/usr/bin/env node

/**
 * 多服务启动脚本
 * 同时启动Next.js应用和WebSocket服务器
 */

// const { spawn } = require('child_process');
import {spawn} from 'child_process';

// 环境变量配置
const WS_PORT = process.env.WS_PORT || 8080;
const WS_HOST = process.env.WS_HOST || '0.0.0.0';
const NEXT_PORT = process.env.PORT || 3000;

// 日志函数
function log(service, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${service}] ${message}`);
}

// 启动Next.js应用
function startNextJS() {
  log('NEXT', '正在启动Next.js应用...');
  
  const nextProcess = spawn('node', ['server.cjs'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: NEXT_PORT,
      HOSTNAME: '0.0.0.0'
    }
  });

  nextProcess.stdout.on('data', (data) => {
    log('NEXT', data.toString().trim());
  });

  nextProcess.stderr.on('data', (data) => {
    log('NEXT', `ERROR: ${data.toString().trim()}`);
  });

  nextProcess.on('close', (code) => {
    log('NEXT', `进程退出，代码: ${code}`);
    if (code !== 0) {
      process.exit(code);
    }
  });

  return nextProcess;
}

// 启动WebSocket服务器
function startWebSocketServer() {
  log('WEBSOCKET', '正在启动WebSocket服务器...');
  
  const wsProcess = spawn('node', ['websocket-server/server.js'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      WS_PORT: WS_PORT,
      WS_HOST: WS_HOST
    }
  });

  wsProcess.stdout.on('data', (data) => {
    log('WEBSOCKET', data.toString().trim());
  });

  wsProcess.stderr.on('data', (data) => {
    log('WEBSOCKET', `ERROR: ${data.toString().trim()}`);
  });

  wsProcess.on('close', (code) => {
    log('WEBSOCKET', `进程退出，代码: ${code}`);
    if (code !== 0) {
      process.exit(code);
    }
  });

  return wsProcess;
}

// 优雅关闭处理
function setupGracefulShutdown(processes) {
  const gracefulShutdown = (signal) => {
    log('MAIN', `接收到信号 ${signal}，正在优雅关闭服务...`);
    
    processes.forEach(proc => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    });

    // 如果5秒内没有正常关闭，强制退出
    setTimeout(() => {
      log('MAIN', '强制退出所有进程');
      processes.forEach(proc => {
        if (proc && !proc.killed) {
          proc.kill('SIGKILL');
        }
      });
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGHUP', gracefulShutdown);
}

// 主启动函数
function main() {
  log('MAIN', '=== 启动多服务容器 ===');
  log('MAIN', `Next.js 端口: ${NEXT_PORT}`);
  log('MAIN', `WebSocket 服务器: ${WS_HOST}:${WS_PORT}`);

  const processes = [];

  // 启动服务
  try {
    const nextProcess = startNextJS();
    const wsProcess = startWebSocketServer();
    
    processes.push(nextProcess, wsProcess);
    
    // 设置优雅关闭
    setupGracefulShutdown(processes);
    
    log('MAIN', '所有服务已启动');
    
  } catch (error) {
    log('MAIN', `启动失败: ${error.message}`);
    process.exit(1);
  }
}

// 启动应用
main(); 