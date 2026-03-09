/**
 * Background Service Worker
 *
 * 代理 Codex OAuth API 请求，绕过 CORS 限制。
 * Content script 运行在 Overleaf 页面上下文中，直接 fetch chatgpt.com 会被 CORS 拦截。
 * Background service worker 不受 CORS 限制，可自由发起跨域请求。
 */

// 流式请求：通过长连接 Port 逐块转发 SSE 数据
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'codex-fetch-stream') return;

  port.onMessage.addListener(async (msg) => {
    try {
      const response = await fetch(msg.url, {
        method: 'POST',
        headers: msg.headers,
        body: msg.body,
      });

      if (!response.ok) {
        const text = await response.text();
        port.postMessage({ type: 'error', status: response.status, body: text });
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          port.postMessage({ type: 'data', chunk: decoder.decode(value, { stream: true }) });
        }
        port.postMessage({ type: 'end' });
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      port.postMessage({ type: 'error', body: err instanceof Error ? err.message : String(err) });
    }
  });
});

// 非流式请求：通过一次性消息返回完整 JSON
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'codex-fetch-json') return false;

  (async () => {
    try {
      const response = await fetch(msg.url, {
        method: 'POST',
        headers: msg.headers,
        body: msg.body,
      });

      if (!response.ok) {
        const text = await response.text();
        sendResponse({ ok: false, status: response.status, body: text });
        return;
      }

      const data = await response.json();
      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, body: err instanceof Error ? err.message : String(err) });
    }
  })();

  return true;
});
