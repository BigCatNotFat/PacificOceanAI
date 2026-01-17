/**
 * 预览系统 - 入口
 */

import { startStreamPreview, updateStreamPreview, completeStreamPreview, initStreamListeners } from './stream.js';

export function initPreview() {
  console.log('[OverleafBridge] Initializing Preview System...');
  
  initStreamListeners();
  
  // 监听预览相关消息
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    const data = event.data;
    if (!data) return;
    
    if (data.type === 'OVERLEAF_STREAM_PREVIEW_START') {
      console.log('[OverleafBridge] Starting stream preview');
      startStreamPreview(data.data);
    }
    else if (data.type === 'OVERLEAF_STREAM_PREVIEW_UPDATE') {
      updateStreamPreview(data.data.delta);
    }
    else if (data.type === 'OVERLEAF_STREAM_PREVIEW_COMPLETE') {
      console.log('[OverleafBridge] Stream preview complete');
      completeStreamPreview(data.data);
    }
  });
}
