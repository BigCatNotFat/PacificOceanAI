/**
 * 选区工具提示 - 模型选择器
 * 负责模型选择和管理
 */

var TEXT_ACTION_MODEL_KEY = 'ol-ai-text-action-model';

/**
 * 获取当前选择的文本操作模型
 */
function getSelectedTextActionModel(getAvailableModels) {
  try {
    var models = getAvailableModels();
    return localStorage.getItem(TEXT_ACTION_MODEL_KEY) || models[0].id;
  } catch (e) {
    var models = getAvailableModels();
    return models[0].id;
  }
}

/**
 * 保存选择的文本操作模型
 */
function setSelectedTextActionModel(modelId) {
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
 * 创建模型选择器
 */
function createModelSelector(getAvailableModels) {
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
  var currentModel = getSelectedTextActionModel(getAvailableModels);
  var models = getAvailableModels();
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
  
  // 阻止事件冒泡，防止选择模型时隐藏菜单
  select.onclick = function(e) {
    e.stopPropagation();
  };
  
  container.appendChild(select);
  
  return container;
}

/**
 * 更新模型选择器的选项
 */
function updateModelSelectorOptions(getAvailableModels, getSelectedTextActionModel) {
  var select = document.getElementById('ol-ai-model-select');
  if (!select) return;
  
  var currentModel = getSelectedTextActionModel(getAvailableModels);
  var models = getAvailableModels();
  
  // 清空现有选项
  select.innerHTML = '';
  
  // 添加新选项
  models.forEach(function(model) {
    var option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    if (model.id === currentModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    getSelectedTextActionModel,
    setSelectedTextActionModel,
    createModelSelector,
    updateModelSelectorOptions,
    TEXT_ACTION_MODEL_KEY
  };
}

