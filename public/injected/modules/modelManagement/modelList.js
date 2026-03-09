/**
 * 模型管理模块 - 模型列表管理
 * 负责管理和同步模型列表
 */

import { debug, warn } from '../core/logger.js';

// 动态模型列表（从 ModelRegistryService 获取）
var availableModels = [];

// 默认备用模型列表（在模型列表加载前使用）
var FALLBACK_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' }
];

/**
 * 获取当前可用的模型列表
 * 优先使用从 React 应用推送的模型列表，否则使用备用列表
 */
function getAvailableModels() {
  return availableModels.length > 0 ? availableModels : FALLBACK_MODELS;
}

/**
 * 请求模型列表（在脚本加载时发送）
 */
function requestModelList() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_MODEL_LIST',
    data: {}
  }, '*');
  debug('[OverleafBridge] Requesting model list from React app');
}

/**
 * 监听模型列表更新消息
 * React 应用会在初始化时推送模型列表
 * @param {Function} updateModelSelectorOptions - 更新模型选择器的回调函数
 */
function setupModelListListener(updateModelSelectorOptions) {
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data || data.type !== 'OVERLEAF_UPDATE_MODEL_LIST') return;
    
    var models = data.data?.models;
    if (!Array.isArray(models)) {
      warn('[OverleafBridge] Invalid model list received');
      return;
    }
    
    // 更新模型列表
    availableModels = models.map(function(model) {
      return {
        id: model.id,
        name: model.name,
        provider: model.provider
      };
    });
    
    debug('[OverleafBridge] Model list updated:', availableModels.length, 'models');
    
    // 更新模型选择器
    if (updateModelSelectorOptions) {
      updateModelSelectorOptions();
    }
  });
}

/**
 * 初始化模型管理
 * @param {Function} updateModelSelectorOptions - 更新模型选择器的回调函数
 */
function initializeModelManagement(updateModelSelectorOptions) {
  setupModelListListener(updateModelSelectorOptions);
  setTimeout(requestModelList, 100);
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    getAvailableModels,
    requestModelList,
    setupModelListListener,
    initializeModelManagement,
    FALLBACK_MODELS
  };
}

