/**
 * 搜索模块 - 项目 ID 获取
 */

// 获取项目 ID
export function getProjectId() {
  const match = window.location.pathname.match(/\/project\/([a-f0-9]+)/);
  if (match) {
    return match[1];
  }
  // 尝试从 meta 标签获取
  const metaTag = document.querySelector('meta[name="ol-project_id"]');
  if (metaTag) {
    return metaTag.getAttribute('content');
  }
  throw new Error('无法获取项目 ID');
}
