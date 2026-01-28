/**
 * Injected-side logger (default silent)
 *
 * 默认不输出任何 debug/info/warn 日志，避免在 Overleaf 页面刷屏。
 * 需要排查 injected 侧问题时，可在浏览器控制台开启：
 *   localStorage.setItem('OVERLEAF_BRIDGE_DEBUG', '1') 然后刷新页面
 *
 * 兼容：也支持复用主应用的开关 OVERLEAF_AGENT_DEBUG=1
 */
export function isBridgeDebugEnabled() {
  try {
    const v1 = localStorage.getItem('OVERLEAF_BRIDGE_DEBUG');
    const v2 = localStorage.getItem('OVERLEAF_AGENT_DEBUG');
    return v1 === '1' || v2 === '1';
  } catch (e) {
    return false;
  }
}

export function debug() {
  if (!isBridgeDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log.apply(console, arguments);
}

export function info() {
  if (!isBridgeDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info.apply(console, arguments);
}

export function warn() {
  if (!isBridgeDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn.apply(console, arguments);
}

export function error() {
  // error 永远输出，避免吞掉真正故障
  // eslint-disable-next-line no-console
  console.error.apply(console, arguments);
}


