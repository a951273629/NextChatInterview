import * as tf from "@tensorflow/tfjs";

// 常量定义
export const DB_NAME = "voiceprint-db";
export const DB_VERSION = 1;
export const MODEL_CACHE_VERSION = "1.0";

// IndexedDB存储键名
export const STORES = {
  META: "meta", // 元数据存储
  VOICEPRINT: "voiceprint", // 声纹数据存储
  TRAINING_SAMPLES: "trainingSamples", // 训练样本存储
};

// 元数据键名
export const META_KEYS = {
  MODEL_VERSION: "modelVersion", // 模型版本信息
};

/**
 * 声纹数据存储服务
 * 使用 IndexedDB 统一管理声纹模型、训练样本和元数据
 */
class VoiceprintStorage {
  private db: IDBDatabase | null = null;

  /**
   * 初始化数据库连接
   * @returns Promise<boolean> 连接是否成功
   */
  async initDB(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // 如果已经初始化，直接返回成功
      if (this.db) {
        resolve(true);
        return;
      }

      // 打开数据库
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // 处理数据库升级事件
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建元数据存储
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META);
        }

        // 创建声纹数据存储
        if (!db.objectStoreNames.contains(STORES.VOICEPRINT)) {
          db.createObjectStore(STORES.VOICEPRINT);
        }

        // 创建训练样本存储
        if (!db.objectStoreNames.contains(STORES.TRAINING_SAMPLES)) {
          db.createObjectStore(STORES.TRAINING_SAMPLES);
        }
      };

      // 处理成功事件
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log("声纹数据库连接成功");
        resolve(true);
      };

      // 处理错误事件
      request.onerror = (event) => {
        console.error("声纹数据库连接失败:", event);
        reject(new Error("声纹数据库连接失败"));
      };
    });
  }

  /**
   * 保存元数据
   * @param key 元数据键名
   * @param value 元数据值
   * @returns Promise<boolean> 是否保存成功
   */
  async saveMeta(key: string, value: any): Promise<boolean> {
    try {
      await this.initDB();
      return this.saveData(STORES.META, key, value);
    } catch (error) {
      console.error(`保存元数据[${key}]失败:`, error);
      return false;
    }
  }

  /**
   * 获取元数据
   * @param key 元数据键名
   * @returns Promise<any> 元数据值，如果不存在返回null
   */
  async getMeta(key: string): Promise<any> {
    try {
      await this.initDB();
      return this.getData(STORES.META, key);
    } catch (error) {
      console.error(`获取元数据[${key}]失败:`, error);
      return null;
    }
  }

  /**
   * 保存声纹数据
   * @param voiceprint 声纹数据(Float32Array)
   * @returns Promise<boolean> 是否保存成功
   */
  async saveVoiceprint(voiceprint: Float32Array): Promise<boolean> {
    try {
      await this.initDB();
      // 转换为普通数组以便存储
      const voiceprintArray = Array.from(voiceprint);
      return this.saveData(
        STORES.VOICEPRINT,
        "currentVoiceprint",
        voiceprintArray,
      );
    } catch (error) {
      console.error("保存声纹数据失败:", error);
      return false;
    }
  }

  /**
   * 获取声纹数据
   * @returns Promise<Float32Array | null> 声纹数据，如果不存在返回null
   */
  async getVoiceprint(): Promise<Float32Array | null> {
    try {
      await this.initDB();
      const voiceprintArray = await this.getData(
        STORES.VOICEPRINT,
        "currentVoiceprint",
      );
      return voiceprintArray ? new Float32Array(voiceprintArray) : null;
    } catch (error) {
      console.error("获取声纹数据失败:", error);
      return null;
    }
  }

  /**
   * 保存训练样本
   * @param samples 训练音频样本数组
   * @returns Promise<boolean> 是否保存成功
   */
  async saveTrainingSamples(samples: Float32Array[]): Promise<boolean> {
    try {
      await this.initDB();

      // 限制样本数量，防止存储过大
      const maxSamples = 3; // 最多保存3个样本
      const samplesArray = [];

      for (let i = 0; i < Math.min(samples.length, maxSamples); i++) {
        samplesArray.push(Array.from(samples[i]));
      }

      return this.saveData(
        STORES.TRAINING_SAMPLES,
        "currentSamples",
        samplesArray,
      );
    } catch (error) {
      console.error("保存训练样本失败:", error);
      return false;
    }
  }

  /**
   * 获取训练样本
   * @returns Promise<Float32Array[] | null> 训练样本，如果不存在返回null
   */
  async getTrainingSamples(): Promise<Float32Array[] | null> {
    try {
      await this.initDB();
      const samplesArray = await this.getData(
        STORES.TRAINING_SAMPLES,
        "currentSamples",
      );

      return samplesArray
        ? samplesArray.map((sample: number[]) => new Float32Array(sample))
        : null;
    } catch (error) {
      console.error("获取训练样本失败:", error);
      return null;
    }
  }

  /**
   * 保存TensorFlow模型到IndexedDB
   * @param model 要保存的模型
   * @returns Promise<boolean> 是否保存成功
   */
  async saveModel(model: tf.LayersModel): Promise<boolean> {
    try {
      await model.save(`indexeddb://voiceprint-model`);
      await this.saveMeta(META_KEYS.MODEL_VERSION, MODEL_CACHE_VERSION);
      console.log("声纹识别模型已保存到IndexedDB");
      return true;
    } catch (error) {
      console.error("保存模型失败:", error);
      return false;
    }
  }

  /**
   * 从IndexedDB加载TensorFlow模型
   * @returns Promise<tf.LayersModel | null> 模型，如果不存在或版本不匹配返回null
   */
  async loadModel(): Promise<tf.LayersModel | null> {
    try {
      // 检查模型版本是否匹配
      const savedVersion = await this.getMeta(META_KEYS.MODEL_VERSION);
      if (!savedVersion || savedVersion !== MODEL_CACHE_VERSION) {
        console.log("未找到匹配版本的模型或版本不兼容");
        return null;
      }

      // 加载模型
      const model = await tf.loadLayersModel("indexeddb://voiceprint-model");

      // 确保模型已编译
      model.compile({
        optimizer: "adam",
        loss: "meanSquaredError",
      });

      console.log("从IndexedDB加载模型成功");
      return model;
    } catch (error) {
      console.error("从IndexedDB加载模型失败:", error);
      return null;
    }
  }

  /**
   * 清除所有数据
   * @returns Promise<boolean> 是否清除成功
   */
  async clearAll(): Promise<boolean> {
    try {
      // 删除模型
      await tf.io.removeModel("indexeddb://voiceprint-model");

      // 确保数据库已初始化
      await this.initDB();

      // 清除声纹数据
      await this.deleteData(STORES.VOICEPRINT, "currentVoiceprint");

      // 清除训练样本
      await this.deleteData(STORES.TRAINING_SAMPLES, "currentSamples");

      // 清除元数据
      await this.deleteData(STORES.META, META_KEYS.MODEL_VERSION);

      console.log("已清除所有声纹相关数据");
      return true;
    } catch (error) {
      console.error("清除数据失败:", error);
      return false;
    }
  }

  /**
   * 通用数据保存方法
   * @param storeName 存储名称
   * @param key 键名
   * @param value 数据值
   * @returns Promise<boolean> 是否保存成功
   */
  private saveData(
    storeName: string,
    key: string,
    value: any,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("数据库未初始化"));
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          console.error(`保存数据到[${storeName}/${key}]失败:`, event);
          reject(new Error(`保存数据失败: ${event}`));
        };
      } catch (error) {
        console.error(`保存数据到[${storeName}/${key}]时发生异常:`, error);
        reject(error);
      }
    });
  }

  /**
   * 通用数据获取方法
   * @param storeName 存储名称
   * @param key 键名
   * @returns Promise<any> 数据值，如果不存在返回null
   */
  private getData(storeName: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("数据库未初始化"));
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (event) => {
          console.error(`获取数据[${storeName}/${key}]失败:`, event);
          reject(new Error(`获取数据失败: ${event}`));
        };
      } catch (error) {
        console.error(`获取数据[${storeName}/${key}]时发生异常:`, error);
        reject(error);
      }
    });
  }

  /**
   * 通用数据删除方法
   * @param storeName 存储名称
   * @param key 键名
   * @returns Promise<boolean> 是否删除成功
   */
  private deleteData(storeName: string, key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("数据库未初始化"));
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          console.error(`删除数据[${storeName}/${key}]失败:`, event);
          reject(new Error(`删除数据失败: ${event}`));
        };
      } catch (error) {
        console.error(`删除数据[${storeName}/${key}]时发生异常:`, error);
        reject(error);
      }
    });
  }
}

// 导出单例实例
export const voiceprintStorage = new VoiceprintStorage();
