/**
 * 模型管理 - 模型列表与选择
 */

// 默认备用模型列表
const FALLBACK_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' }
];

// 文本操作选择的模型 Storage Key
const TEXT_ACTION_MODEL_KEY = 'ol-ai-text-action-model';

// 动态模型列表
let availableModels = [];

/**
 * 获取当前可用的模型列表
 */
export function getAvailableModels() {
  return availableModels.length > 0 ? availableModels : FALLBACK_MODELS;
}

/**
 * 获取当前选择的文本操作模型
 */
export function getSelectedTextActionModel() {
  try {
    const models = getAvailableModels();
    return localStorage.getItem(TEXT_ACTION_MODEL_KEY) || models[0].id;
  } catch (e) {
    const models = getAvailableModels();
    return models[0].id;
  }
}

/**
 * 保存选择的文本操作模型
 */
export function setSelectedTextActionModel(modelId) {
  try {
    localStorage.setItem(TEXT_ACTION_MODEL_KEY, modelId);
    // 通知 React 应用模型变更
    window.postMessage({
      type: 'OVERLEAF_TEXT_ACTION_MODEL_CHANGED',
      data: { modelId: modelId }
    }, '*');
    console.log('[OverleafBridge] Text action model changed to:', modelId);
  } catch (e) {
    console.error('[OverleafBridge] Failed to save model selection:', e);
  }
}

/**
 * 更新模型选择器的选项
 */
export function updateModelSelectorOptions() {
  const select = document.getElementById('ol-ai-model-select');
  if (!select) return;
  
  const currentModel = getSelectedTextActionModel();
  const models = getAvailableModels();
  
  // 清空现有选项
  select.innerHTML = '';
  
  // 添加新选项
  models.forEach(function(model) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // 如果当前选择的模型不在列表中，选择第一个
  if (!models.find(function(m) { return m.id === currentModel; })) {
    select.value = models[0]?.id || '';
  }
  
  console.log('[OverleafBridge] Model selector updated with', models.length, 'models');
}

/**
 * 请求模型列表
 */
export function requestModelList() {
  window.postMessage({
    type: 'OVERLEAF_REQUEST_MODEL_LIST',
    data: {}
  }, '*');
  console.log('[OverleafBridge] Requesting model list from React app');
}

/**
 * 初始化模型监听
 */
export function initModelListeners() {
  // 监听模型列表更新消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    var data = event.data;
    if (!data || data.type !== 'OVERLEAF_UPDATE_MODEL_LIST') return;
    
    var models = data.data?.models;
    if (!Array.isArray(models)) {
      console.warn('[OverleafBridge] Invalid model list received');
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
    
    console.log('[OverleafBridge] Model list updated:', availableModels.length, 'models');
    
    // 更新模型选择器
    updateModelSelectorOptions();
  });

  // 在脚本加载后请求模型列表
  setTimeout(requestModelList, 100);
}

/**
 * 创建模型选择器 DOM
 */
export function createModelSelector() {
  const container = document.createElement('div');
  container.id = 'ol-ai-model-selector';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.marginTop = '8px';
  container.style.paddingTop = '8px';
  container.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  
  // 标签
  const label = document.createElement('span');
  label.textContent = '🤖 模型:';
  label.style.fontSize = '11px';
  label.style.color = '#9ca3af';
  label.style.flexShrink = '0';
  container.appendChild(label);
  
  // 下拉选择框
  const select = document.createElement('select');
  select.id = 'ol-ai-model-select';
  select.style.flex = '1';
  select.style.padding = '4px 8px';
  select.style.fontSize = '11px';
  select.style.borderRadius = '4px';
  select.style.border = '1px solid rgba(255,255,255,0.2)';
  select.style.background = 'rgba(15, 23, 42, 0.8)';
  select.style.color = '#e5e7eb';
  select.style.cursor = 'pointer';
  select.style.outline = 'none';
  select.style.minWidth = '120px';
  
  // 添加选项
  const currentModel = getSelectedTextActionModel();
  const models = getAvailableModels();
  models.forEach(function(model) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // 监听变化
  select.onchange = function() {
    setSelectedTextActionModel(this.value);
  };
  
  // 阻止事件冒泡
  select.onclick = function(e) {
    e.stopPropagation();
  };
  
  container.appendChild(select);
  
  return container;
}

