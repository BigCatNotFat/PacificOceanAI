/**
 * useModelListSync - 同步模型列表到 OverleafBridge
 * 
 * 这个 hook 负责：
 * 1. 监听来自 bridge 的模型列表请求
 * 2. 将 ConfigurationService 中用户实际启用的模型列表推送到 bridge
 * 3. 监听配置变化事件，实时同步模型列表
 */

import { useEffect, useCallback, useRef } from 'react';
import { useService } from './useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService } from '../../platform/configuration/configuration';

/**
 * 从 ConfigurationService 获取启用的模型并推送到 OverleafBridge
 */
async function pushModelListToBridge(configService: IConfigurationService): Promise<void> {
  try {
    const models = await configService.getModels();
    const enabledModels = models.filter(m => m.enabled);
    
    // 转换为 bridge 需要的简化格式
    const bridgeModels = enabledModels.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider || 'openai'
    }));
    
    // 发送消息到 bridge
    window.postMessage({
      type: 'OVERLEAF_UPDATE_MODEL_LIST',
      data: { models: bridgeModels }
    }, '*');
    
    console.log('[useModelListSync] Pushed', bridgeModels.length, 'enabled models to bridge');
  } catch (error) {
    console.error('[useModelListSync] Failed to push model list:', error);
  }
}

/**
 * Hook: 同步模型列表到 OverleafBridge
 * 
 * 在组件挂载时自动推送模型列表，并监听来自 bridge 的请求。
 * 同时监听 ConfigurationService 的配置变化事件，确保模型列表变更时实时同步。
 */
export function useModelListSync(): void {
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  const configServiceRef = useRef(configService);
  configServiceRef.current = configService;
  
  // 处理来自 bridge 的模型列表请求
  const handleModelListRequest = useCallback((event: MessageEvent) => {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data || data.type !== 'OVERLEAF_REQUEST_MODEL_LIST') return;
    
    console.log('[useModelListSync] Received model list request from bridge');
    
    if (configServiceRef.current) {
      pushModelListToBridge(configServiceRef.current);
    }
  }, []);
  
  useEffect(() => {
    if (!configService) return;
    
    // 添加消息监听器
    window.addEventListener('message', handleModelListRequest);
    
    // 组件挂载时立即推送模型列表
    pushModelListToBridge(configService);
    
    // 监听配置变化事件，模型列表变更时实时同步到 bridge
    const disposable = configService.onDidChangeConfiguration((event) => {
      if (event.key === 'apiConfig') {
        console.log('[useModelListSync] Config changed, re-pushing model list to bridge');
        pushModelListToBridge(configService);
      }
    });
    
    return () => {
      window.removeEventListener('message', handleModelListRequest);
      disposable.dispose();
    };
  }, [configService, handleModelListRequest]);
}

export default useModelListSync;
