/**
 * 方法处理器 - 统一导出
 * 组合所有方法处理器为完整的 methodHandlers 对象
 */

import { createDocumentHandlers } from './document.js';
import { createEditorHandlers } from './editor.js';
import { createFileHandlers } from './file.js';
import { createProjectHandlers } from './project.js';

// 创建完整的方法处理器对象
export function createMethodHandlers(dependencies) {
  const { 
    getEditorView, 
    searchInternal, 
    getProjectId, 
    getAllDocsWithContent 
  } = dependencies;
  
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
