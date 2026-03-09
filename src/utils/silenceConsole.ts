import { isAgentDebugEnabled } from './logger';

/**
 * 默认静默：未开启 debug 时，禁用本上下文中的 console 输出。
 *
 * 说明：
 * - 这只影响扩展自身的执行上下文（content/popup/options 等）
 * - 页面主世界（注入脚本）由 OverleafBridgeClient 另行注入补丁处理
 * - 如需查看日志：localStorage.setItem('OVERLEAF_AGENT_DEBUG', '1') 后刷新
 */
function silenceConsole(): void {
  if (isAgentDebugEnabled()) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = console as any;
  const noop = () => {};

  const methods = [
    'log',
    'debug',
    'info',
    'warn',
    'error',
    'trace',
    'group',
    'groupCollapsed',
    'groupEnd'
  ];

  for (const m of methods) {
    if (typeof c[m] === 'function') {
      c[m] = noop;
    }
  }
}

// side-effect: run once on import
silenceConsole();


