/**
 * 方法处理器 - 项目操作
 * 负责项目级别的方法
 */

// 创建项目相关的方法处理器
function createProjectHandlers(searchInternal, getProjectId, getAllDocsWithContent) {
  return {
    // 获取全局搜索
    searchProject: async function(pattern, options) {
      return await searchInternal(pattern, options, getProjectId, getAllDocsWithContent);
    },

    // 获取项目文件统计信息（行数、字符数）
    getProjectFileStats: async function() {
      try {
        const projectId = getProjectId();
        const files = await getAllDocsWithContent(projectId);
        return files.map(f => ({
          path: f.path,
          lines: f.content ? f.content.split('\n').length : 0,
          chars: f.content ? f.content.length : 0
        }));
      } catch (e) {
        console.error('[OverleafBridge] getProjectFileStats failed:', e);
        return [];
      }
    }
  };
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createProjectHandlers };
}

