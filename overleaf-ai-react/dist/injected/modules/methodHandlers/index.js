/**
 * 方法处理器 - 统一导出
 * 组合所有方法处理器为完整的 methodHandlers 对象
 */

// 创建完整的方法处理器对象
function createMethodHandlers(dependencies) {
  const { 
    getEditorView, 
    searchInternal, 
    getProjectId, 
    getAllDocsWithContent 
  } = dependencies;
  
  // 导入各个模块的处理器
  const { createDocumentHandlers } = require('./document.js');
  const { createEditorHandlers } = require('./editor.js');
  const { createFileHandlers } = require('./file.js');
  const { createProjectHandlers } = require('./project.js');
  
  // 创建一个空对象来存储所有方法
  const methodHandlers = {};
  
  // 添加文档相关方法
  Object.assign(methodHandlers, createDocumentHandlers(getEditorView));
  
  // 添加编辑器相关方法
  Object.assign(methodHandlers, createEditorHandlers(getEditorView));
  
  // 添加文件相关方法
  Object.assign(methodHandlers, createFileHandlers(getEditorView, methodHandlers));
  
  // 添加项目相关方法
  Object.assign(methodHandlers, createProjectHandlers(
    searchInternal, 
    getProjectId, 
    getAllDocsWithContent
  ));
  
  return methodHandlers;
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMethodHandlers };
}

