/**
 * 统一日志工具（默认静默）
 *
 * 目标：
 * - 默认不在 console 打印 debug/info，避免刷屏影响使用与性能
 * - 需要排查问题时可手动开启
 *
 * 开启方式（任一即可）：
 * - 在浏览器控制台执行：localStorage.setItem('OVERLEAF_AGENT_DEBUG', '1') 然后刷新页面
 * - 或设置 Vite 环境变量：VITE_AGENT_DEBUG=true
 */
export function isAgentDebugEnabled(): boolean {
  // 1) env 开关（打包时可控）
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env;
    if (env?.VITE_AGENT_DEBUG === 'true') return true;
  } catch {
    // ignore
  }

  // 2) localStorage 开关（运行时可控；默认关闭）
  try {
    return localStorage.getItem('OVERLEAF_AGENT_DEBUG') === '1';
  } catch {
    return false;
  }
}

export const logger = {
  debug: (...args: any[]) => {
    if (isAgentDebugEnabled()) console.log(...args);
  },
  info: (...args: any[]) => {
    if (isAgentDebugEnabled()) console.info(...args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  }
};


