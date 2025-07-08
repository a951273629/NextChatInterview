// config.js - 小程序环境配置
module.exports = {
  // 开发环境配置
  development: {
    // 开发者工具使用localhost
    baseUrl: 'http://localhost:3000',
    // 真机调试时取消注释下面一行，替换为你的电脑局域网IP
    // baseUrl: 'http://192.168.1.100:3000',
  },
  
  // 生产环境配置  
  production: {
    baseUrl: 'https://www.mianshiyang.cn',
  },
  
  // 当前使用的环境
  current: 'development',
  
  // 获取当前环境的API基础地址
  getBaseUrl() {
    return this[this.current].baseUrl;
  },
  
  // 获取完整的API地址
  getApiUrl(path) {
    return `${this.getBaseUrl()}${path}`;
  }
}; 