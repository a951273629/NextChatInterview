// pages/login/login.js
const config = require('../config.js');

Page({
  data: {
    scene: '',
    loginStatus: 'waiting', // waiting, logging, success, error
    userInfo: null,
    errorMessage: '',
    canIUseGetUserProfile: false,
    loginData: {},
    decryptedUserData: null
  },
  
  onLoad(options) {
    console.log('页面加载参数:', options);
    
    // 获取scene参数
    let scene = '12345678';
    if (options.scene) {
      // scene需要使用decodeURIComponent才能获取到生成二维码时传入的scene
      scene = decodeURIComponent(options.scene);
      console.log('获取到scene参数:', scene);
    }
    
    this.setData({
      scene: scene
    });

    // 如果有scene参数，自动开始登录流程
    // if (scene) {
    //   this.startLogin();
    // }
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      })
    }
  },

  // 开始登录流程
  startLogin() {
    this.setData({
      loginStatus: 'logging',
      errorMessage: ''
    });

    console.log('开始微信登录流程');
    
    // 1. 调用wx.login获取code
    wx.login({
      success: (res) => {
        console.log('wx.login成功:', res);
        if (res.code) {

       // 2. 发送登录信息到服务器
        this.sendLoginData(res.code, res.userInfo);
        } else {
          console.error('wx.login失败:', res.errMsg);
          this.setData({
            loginStatus: 'error',
            errorMessage: '登录失败，请重试'
          });
        }
      },
      fail: (err) => {
        console.error('wx.login失败:', err);
        this.setData({
          loginStatus: 'error',
          errorMessage: '登录失败，请重试'
        });
      }
    });
  },

  // 获取用户信息
  getUserProfile(code) {
    console.log('开始登录流程');
    this.startLogin();
    wx.getUserProfile({
      desc: '用于完成登录',
      success: (res) => {
        console.log('getUserProfile成功:', res);
        this.setData({
          userInfo: res.userInfo
        });
        
        // 调用解密API解密encryptedData
        this.decryptUserData(res.encryptedData, res.iv);
      },
      fail: (err) => {
        console.error('getUserProfile失败:', err);
        this.setData({
          loginStatus: 'error',
          errorMessage: '获取用户信息失败，请重试'
        });
      }
    });
  },

  // 解密用户数据
  decryptUserData(encryptedData, iv) {
    console.log('开始解密用户数据');
    
    const { loginData } = this.data;
    console.log('loginData',loginData);
    const sessionKey = loginData.data.session_key;
    
    if (!sessionKey) {
      console.error('sessionKey不存在');
      this.setData({
        loginStatus: 'error',
        errorMessage: 'sessionKey不存在，请重新登录'
      });
      return;
    }
    
    wx.request({
      url: config.getApiUrl('/api/wechat/decrypt'),
      method: 'POST',
      data: {
        sessionKey: sessionKey,
        encryptedData: encryptedData,
        iv: iv
      },
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        console.log('解密响应:', res);
        if (res.data && res.data.success) {
          console.log('解密成功，用户完整信息:', res.data.data);
          
          // 将解密后的数据存储
          this.setData({
            decryptedUserData: res.data.data
          });
          
          wx.showToast({
            title: '获取用户信息成功',
            icon: 'success'
          });
        } else {
          console.error('解密失败:', res.data?.message);
          this.setData({
            loginStatus: 'error',
            errorMessage: res.data?.message || '解密失败'
          });
        }
      },
      fail: (err) => {
        console.error('解密请求失败:', err);
        this.setData({
          loginStatus: 'error',
          errorMessage: '解密请求失败，请重试'
        });
      }
    });
  },

  // 发送登录数据到服务器
  sendLoginData(code, userInfo) {
    const { scene } = this.data;
    
    console.log('发送登录数据到服务器:', { code, userInfo, scene });
    
    wx.request({
      url: config.getApiUrl('/api/wechat/login'),
      method: 'POST',
      data: {
        code: code,
        userInfo: userInfo,
        scene: scene
      },
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        console.log('服务器登录响应:', res);
        if (res.data && res.data.success) {
          this.setData({
            loginStatus: 'success',
            loginData:res.data
          });
          
          // 登录成功，可以跳转到其他页面或执行其他操作
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          
          // 可选：关闭小程序或跳转到主页
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          
        } else {
          this.setData({
            loginStatus: 'error',
            errorMessage: res.data?.message || '登录失败'
          });
        }
      },
      fail: (err) => {
        console.error('请求服务器失败:', err);
        this.setData({
          loginStatus: 'error',
          errorMessage: '网络错误，请重试'
        });
      }
    });
  },

  // 重试登录
  retryLogin() {
    this.startLogin();
  }
});
