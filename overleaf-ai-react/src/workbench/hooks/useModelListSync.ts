/**
 * useModelListSync - 同步模型列表到 OverleafBridge
 * 
 * 这个 hook 负责：
 * 1. 监听来自 bridge 的模型列表请求
 * 2. 将 ModelRegistryService 中的模型列表推送到 bridge
 */

import { useEffect, useCallback } from 'react';
import { useService } from './useService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';

/**
 * 将模型列表推送到 OverleafBridge
 */
function pushModelListToBridge(modelRegistry: IModelRegistryService): void {
  const modelInfos = modelRegistry.listModelInfos();
  
  // 转换为 bridge 需要的简化格式
  const models = modelInfos.map(info => ({
    id: info.id,
    name: info.name,
    provider: info.provider
  }));
  
  // 发送消息到 bridge
  window.postMessage({
    type: 'OVERLEAF_UPDATE_MODEL_LIST',
    data: { models }
  }, '*');
  
  console.log('[useModelListSync] Pushed', models.length, 'models to bridge');
}

/**
 * Hook: 同步模型列表到 OverleafBridge
 * 
 * 在组件挂载时自动推送模型列表，并监听来自 bridge 的请求
 */
export function useModelListSync(): void {
  const modelRegistry = useService<IModelRegistryService>(IModelRegistryServiceId);
  
  // 处理来自 bridge 的模型列表请求
  const handleModelListRequest = useCallback((event: MessageEvent) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.type !== 'OVERLEAF_REQUEST_MODEL_LIST') return;
    
    console.log('[useModelListSync] Received model list request from bridge');
    
    if (modelRegistry) {
      pushModelListToBridge(modelRegistry);
    }
  }, [modelRegistry]);
  
  useEffect(() => {
    if (!modelRegistry) return;
    
    // 添加消息监听器
    window.addEventListener('message', handleModelListRequest);
    
    // 组件挂载时立即推送模型列表
    pushModelListToBridge(modelRegistry);
    
    return () => {
      window.removeEventListener('message', handleModelListRequest);
    };
  }, [modelRegistry, handleModelListRequest]);
}

export default useModelListSync;

