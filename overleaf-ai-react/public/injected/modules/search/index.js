/**
 * 搜索模块 - 统一导出
 */

// 导出所有搜索相关功能
if (typeof module !== 'undefined' && module.exports) {
  const { getProjectId } = require('./projectId.js');
  const { fetchEntities, fetchFileHashes, fetchBlobContent, getAllDocsWithContent } = require('./fetchers.js');
  const { createSearchRegex, searchInFile, searchInternal } = require('./searchEngine.js');

  module.exports = {
    getProjectId,
    fetchEntities,
    fetchFileHashes,
    fetchBlobContent,
    getAllDocsWithContent,
    createSearchRegex,
    searchInFile,
    searchInternal
  };
}

