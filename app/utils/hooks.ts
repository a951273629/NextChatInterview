import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { DEFAULT_MODELS } from "../constant";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();

  const models = useMemo(() => {
    // 获取所有模型
    const allModels = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );

    // 创建当前DEFAULT_MODELS中模型的集合，用于快速查找
    const currentModelSet = new Set();
    DEFAULT_MODELS.forEach((model) => {
      currentModelSet.add(`${model.name}@${model.provider?.id}`);
    });

    // 只保留当前DEFAULT_MODELS中存在的模型
    const filteredModels = allModels.filter((model) => {
      return currentModelSet.has(`${model.name}@${model.provider?.id}`);
    });

    return filteredModels;
  }, [
    accessStore.customModels,
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
  ]);

  return models;
}
