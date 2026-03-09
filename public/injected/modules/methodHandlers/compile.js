/**
 * 方法处理器 - 编译操作
 * 提供编译器切换、编译触发、停止编译、清除缓存等操作
 */

import { debug, warn } from '../core/logger.js';
import { getFiberRoot, findProjectState, getCsrfToken, getJsonHeaders } from '../core/reactFiber.js';

const COMPILERS = ['pdflatex', 'xelatex', 'lualatex', 'latex'];

function parseLatexErrors(logText) {
  const errors = [];
  const warnings = [];

  const errorRegex = /^! (.+)$/gm;
  let m;
  while ((m = errorRegex.exec(logText)) !== null) {
    const message = m[1];
    let line = null;
    const afterMatch = logText.substring(m.index + m[0].length, m.index + m[0].length + 200);
    const lineMatch = afterMatch.match(/l\.(\d+)/);
    if (lineMatch) line = parseInt(lineMatch[1], 10);
    errors.push({ message, line });
  }

  const warnRegex = /^(?:LaTeX|Package|Class) .*Warning[:\s](.+?)$/gm;
  while ((m = warnRegex.exec(logText)) !== null) {
    warnings.push({ message: m[1].trim() });
  }

  return { errors, warnings };
}

async function fetchCompileLog(outputFiles) {
  const logFile = outputFiles.find(f => f.path === 'output.log');
  if (!logFile || !logFile.url) return null;

  try {
    const res = await fetch(logFile.url);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    warn('[Compile] 获取编译日志失败:', e);
    return null;
  }
}

export function createCompileHandlers(getProjectId) {
  return {
    getCompiler: function () {
      const proj = findProjectState(getFiberRoot());
      return proj?.compiler || null;
    },

    listCompilers: function () {
      const current = findProjectState(getFiberRoot())?.compiler || null;
      return COMPILERS.map((name, i) => ({
        index: i + 1,
        name,
        current: name === current,
      }));
    },

    switchCompiler: async function (compiler) {
      if (!COMPILERS.includes(compiler)) {
        throw new Error('不支持的编译器: ' + compiler + '，可选: ' + COMPILERS.join(', '));
      }

      const current = findProjectState(getFiberRoot())?.compiler;
      if (compiler === current) {
        return { success: true, compiler, changed: false };
      }

      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/settings`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify({ compiler }),
      });

      if (!res.ok) {
        throw new Error('切换编译器失败: ' + res.status);
      }

      debug('[Compile] 已切换编译器:', current, '->', compiler);
      return { success: true, compiler, changed: true, previous: current };
    },

    compile: async function (options) {
      const projectId = getProjectId();
      const opts = options || {};

      const body = {
        check: 'silent',
        draft: !!opts.draft,
        incrementalCompilesEnabled: true,
      };
      if (opts.rootDocId) {
        body.rootDoc_id = opts.rootDocId;
      }

      const res = await fetch(`/project/${projectId}/compile`, {
        method: 'POST',
        headers: getJsonHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('编译请求失败: ' + res.status);
      }

      const data = await res.json();
      debug('[Compile] 编译完成, status:', data.status);

      const result = {
        status: data.status,
        compileGroup: data.compileGroup || null,
        outputFiles: (data.outputFiles || []).map(f => ({
          path: f.path,
          url: f.url,
          type: f.type,
          build: f.build,
        })),
        errors: [],
        warnings: [],
        logSummary: null,
      };

      if (data.outputFiles && data.outputFiles.length > 0) {
        const logText = await fetchCompileLog(data.outputFiles);
        if (logText) {
          const parsed = parseLatexErrors(logText);
          result.errors = parsed.errors;
          result.warnings = parsed.warnings;
          const lines = logText.split('\n');
          result.logSummary = lines.slice(-30).join('\n');
        }
      }

      window.dispatchEvent(new CustomEvent('pdf:recompile'));

      return result;
    },

    stopCompile: async function () {
      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/compile/stop`, {
        method: 'POST',
        headers: getJsonHeaders(),
      });

      if (!res.ok) {
        throw new Error('停止编译失败: ' + res.status);
      }

      debug('[Compile] 已停止编译');
      return { success: true };
    },

    clearCache: async function () {
      const projectId = getProjectId();
      const res = await fetch(`/project/${projectId}/output`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });

      if (!res.ok) {
        throw new Error('清除缓存失败: ' + res.status);
      }

      debug('[Compile] 已清除编译缓存');
      return { success: true };
    },
  };
}
