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

  const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const isProjectLike = (v) => isObject(v) && v._id && Array.isArray(v.rootFolder);
  const extractProject = (v) => {
    if (!isObject(v)) return null;
    if (isProjectLike(v)) return v;
    if (isProjectLike(v.project)) return v.project;
    return null;
  };

  const candidates = [];
  const seen = new WeakSet();
  const collect = (node) => {
    if (!node) return;

    let hook = node.memoizedState;
    while (hook) {
      for (const v of [hook.memoizedState, hook.queue?.lastRenderedState]) {
        const project = extractProject(v);
        if (project && !seen.has(project)) {
          seen.add(project);
          candidates.push(project);
        }
      }
      hook = hook.next;
    }

    let c = node.child;
    while (c) {
      collect(c);
      c = c.sibling;
    }
  };

  const scanFolder = (folder, openDocId, openDocName) => {
    if (!folder || typeof folder !== 'object') return { idMatch: false, nameMatch: false, count: 0 };

    const docs = Array.isArray(folder.docs) ? folder.docs : [];
    const fileRefs = Array.isArray(folder.fileRefs) ? folder.fileRefs : [];
    const folders = Array.isArray(folder.folders) ? folder.folders : [];

    let idMatch = false;
    let nameMatch = false;
    let count = docs.length + fileRefs.length + folders.length;

    for (const d of docs) {
      if (openDocId && d?._id === openDocId) idMatch = true;
      if (openDocName && d?.name === openDocName) nameMatch = true;
    }

    for (const f of folders) {
      const sub = scanFolder(f, openDocId, openDocName);
      idMatch = idMatch || sub.idMatch;
      nameMatch = nameMatch || sub.nameMatch;
      count += sub.count;
    }

    return { idMatch, nameMatch, count };
  };

  const scoreProject = (project, openDocId, openDocName) => {
    const root = Array.isArray(project.rootFolder) ? project.rootFolder[0] : null;
    const { idMatch, nameMatch, count } = scanFolder(root, openDocId, openDocName);

    let score = 0;
    if (project.compiler) score += 1;
    if (root) score += 2;
    if (idMatch) score += 100;
    else if (nameMatch) score += 50;

    // Prefer richer trees when multiple stale snapshots exist.
    score += Math.min(count, 1000) / 1000;
    return score;
  };

  collect(fiber);
  if (candidates.length === 0) return null;

  let openDocId = null;
  let openDocName = null;
  try {
    const store = window.overleaf?.unstable?.store;
    if (store) {
      openDocId = store.get('editor.open_doc_id');
      openDocName = store.get('editor.open_doc_name');
    }
  } catch (_) {
  }

  let best = candidates[0];
  let bestScore = scoreProject(best, openDocId, openDocName);

  for (let i = 1; i < candidates.length; i++) {
    const score = scoreProject(candidates[i], openDocId, openDocName);
    if (score > bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }

  return best;
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
