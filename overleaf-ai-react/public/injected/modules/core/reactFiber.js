/**
 * 核心模块 - React Fiber 遍历
 * 从 Overleaf 的 React 内部状态中提取项目信息
 */

export function getFiberRoot() {
  const root = document.getElementById('ide-root');
  if (!root) return null;

  let fiber = null;
  for (const key of Object.keys(root)) {
    if (key.startsWith('__reactContainer') || key.startsWith('__reactFiber')) {
      fiber = root[key];
      break;
    }
  }

  if (!fiber) {
    const child = root.querySelector('*');
    if (child) {
      for (const key of Object.keys(child)) {
        if (key.startsWith('__reactFiber')) {
          fiber = child[key];
          while (fiber.return) fiber = fiber.return;
          break;
        }
      }
    }
  }

  return fiber;
}

export function findProjectState(fiber) {
  if (!fiber) return null;

  function search(node) {
    if (!node) return null;
    let hook = node.memoizedState;
    while (hook) {
      for (const v of [hook.memoizedState, hook.queue?.lastRenderedState]) {
        if (v && typeof v === 'object' && !Array.isArray(v) && v._id && v.compiler) {
          return v;
        }
      }
      hook = hook.next;
    }
    let c = node.child;
    while (c) {
      const r = search(c);
      if (r) return r;
      c = c.sibling;
    }
    return null;
  }

  return search(fiber);
}

export function getCsrfToken() {
  const meta = document.querySelector('meta[name="ol-csrfToken"]');
  return meta ? meta.getAttribute('content') : null;
}

export function getJsonHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
  };
}
