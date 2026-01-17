/**
 * overleafBridge.js - 主入口文件
 * 整合所有模块，提供完整的桥接功能
 * 
 * 此文件将被 esbuild 打包为单文件版本
 */

import { getEditorView } from './core/editorView.js';
import { createMethodHandlers } from './methodHandlers/index.js';
import { registerMethods } from './core/registry.js';
import { 
  searchInternal, 
  getProjectId, 
  getAllDocsWithContent 
} from './search/index.js';
import { initModelManagement } from './modelManagement/index.js';
import { initSelectionTooltip } from './selectionTooltip/index.js';
import { initPreview } from './preview/index.js';
import { initDiffSystem } from './diff/index.js';

// 初始化各个模块
initModelManagement();
initSelectionTooltip();
initPreview();
initDiffSystem();

// 创建方法处理器
const methodHandlers = createMethodHandlers({
  getEditorView,
  searchInternal,
  getProjectId,
  getAllDocsWithContent
});

// 注册到全局注册表，供其他模块（如 Diff 系统）使用
registerMethods(methodHandlers);

// 注册额外的 UI 相关处理器
import { hideSelectionTooltip, showSelectionTooltipForCurrentSelection } from './selectionTooltip/ui.js';
// import { handlePreviewDecision } from './preview/stream.js';
// 注意：stream.js 中没有导出 handlePreviewDecision，需要添加导出或在这里重新实现
// 实际上 legacy.js 中的 handlePreviewDecision 逻辑比较简单，我们可以在 preview/index.js 中暴露一个包装器

// 这里我们需要补充注册 replaceSelection, showTextActionPreview, handlePreviewDecision
// 由于 createMethodHandlers 返回的是一个新对象，我们需要扩展它

// 补充处理器：替换选区
methodHandlers.replaceSelection = function(from, to, text) {
    const view = getEditorView();
    if (!view) {
      throw new Error('EditorView not available');
    }
  
  console.log('[OverleafBridge] replaceSelection called:', {
      from: from,
      to: to,
    textLength: text.length
  });
  
    view.dispatch({
      changes: { from: from, to: to, insert: text }
    });
  
  return { success: true };
};

// 补充处理器：显示预览
// 注意：现在 preview 模块使用流式预览，showTextActionPreview 是旧接口，我们桥接到 startStreamPreview
import { startStreamPreview } from './preview/stream.js';
methodHandlers.showTextActionPreview = function(previewData) {
  startStreamPreview(previewData);
      return { success: true };
};

// 补充处理器：处理预览决策
// 注意：流式预览通常自带 UI 处理决策，但也可能通过消息触发
// 我们在 preview/stream.js 中目前没有导出 handlePreviewDecision，
// 但 preview/stream.js 内部有逻辑处理 UI 点击。
// 如果 Content Script 发送 OVERLEAF_PREVIEW_DECISION_RESULT 消息，我们需要处理吗？
// legacy.js 中 handlePreviewDecision 是处理 UI 上的接受/拒绝点击，并发送消息给 Content Script。
// methodHandlers.handlePreviewDecision 是供外部调用的？
// 在 legacy.js 中，methodHandlers.handlePreviewDecision 调用了内部的 handlePreviewDecision 函数。
// 那个函数负责应用更改并发送消息。
// 我们在 preview/stream.js 中应该实现类似逻辑。

// 监听消息
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  
  const data = event.data;
  if (!data || data.type !== 'OVERLEAF_BRIDGE_REQUEST') return;

  const requestId = data.requestId;
  const method = data.method;
  const args = data.args || [];

  const response = {
    type: 'OVERLEAF_BRIDGE_RESPONSE',
    requestId: requestId,
    success: false
  };

  try {
    const handler = methodHandlers[method];
    if (!handler) {
      throw new Error('Unknown method: ' + method);
    }

    const result = handler.apply(null, args);
    
    if (result && typeof result.then === 'function') {
      result.then(function(res) {
        response.success = true;
        response.result = res;
        window.postMessage(response, '*');
      }).catch(function(err) {
        response.success = false;
        response.error = err instanceof Error ? err.message : String(err);
        window.postMessage(response, '*');
      });
      return;
    }

    response.success = true;
    response.result = result;
  } catch (error) {
    response.success = false;
    response.error = error instanceof Error ? error.message : String(error);
  }

  window.postMessage(response, '*');
});

console.log('[OverleafBridge] Modular architecture initialized (ESM)');
