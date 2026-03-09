/**
 * 预览系统 - 入口
 * 
 * 支持多任务并行：每个预览通过 previewId 标识
 */

import { startStreamPreview, updateStreamPreview, completeStreamPreview, initStreamListeners } from './stream.js';
import { debug } from '../core/logger.js';

export function initPreview() {
  debug('[OverleafBridge] Initializing Preview System (multi-task parallel mode)...');
  
  initStreamListeners();
  
  // 监听预览相关消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data) return;
    
    if (data.type === 'OVERLEAF_STREAM_PREVIEW_START') {
      const previewId = data.data && data.data.previewId;
      debug('[OverleafBridge] Starting stream preview, previewId:', previewId || '(legacy)');
      startStreamPreview(data.data);
    }
    else if (data.type === 'OVERLEAF_STREAM_PREVIEW_UPDATE') {
      // 传递 previewId 和 delta
      const previewId = data.data && data.data.previewId;
      const delta = data.data && data.data.delta;
      updateStreamPreview(previewId, delta);
    }
    else if (data.type === 'OVERLEAF_STREAM_PREVIEW_COMPLETE') {
      const previewId = data.data && data.data.previewId;
      debug('[OverleafBridge] Stream preview complete, previewId:', previewId || '(legacy)');
      completeStreamPreview(data.data);
    }
  });
}
