/**
 * Diff 系统 - 状态存储
 * 管理跨文件的建议和状态
 */

import { getCurrentFileName } from '../core/utils.js';

// Diff 建议存储 - Map<fileName, Map<id, suggestion>>
export const diffSuggestionsByFile = new Map();

// 内联状态存储 - Map<fileName, Map<id, inlineStatus>>
export const inlineStatusByFile = new Map();

// 全局索引（跨所有文件）
export let diffCurrentIndex = 0;

// 当前文件名
export let diffCurrentFileName = null;

// 当前编辑器视图
export let diffCurrentView = null;

// 文件切换检测定时器
export let diffFileCheckInterval = null;

export function setDiffCurrentIndex(index) {
  diffCurrentIndex = index;
}

export function setDiffCurrentFileName(fileName) {
  diffCurrentFileName = fileName;
}

export function setDiffCurrentView(view) {
  diffCurrentView = view;
}

export function setDiffFileCheckInterval(interval) {
  diffFileCheckInterval = interval;
}

// 暴露到 window (兼容旧代码或调试)
window._inlineStatusByFile = inlineStatusByFile;

/**
 * 获取当前文件的内联状态 Map
 */
export function getCurrentFileInlineStatus(fileName) {
  const currentFile = fileName || diffCurrentFileName || getCurrentFileName();
  if (!currentFile || currentFile === 'unknown') return new Map();
  
  if (!inlineStatusByFile.has(currentFile)) {
    inlineStatusByFile.set(currentFile, new Map());
  }
  return inlineStatusByFile.get(currentFile);
}

/**
 * 获取当前文件的建议 Map
 */
export function getCurrentFileSuggestions(fileName) {
  const currentFile = fileName || diffCurrentFileName || getCurrentFileName();
  if (!currentFile || currentFile === 'unknown') return new Map();
  
  if (!diffSuggestionsByFile.has(currentFile)) {
    diffSuggestionsByFile.set(currentFile, new Map());
  }
  return diffSuggestionsByFile.get(currentFile);
}

/**
 * 获取所有建议的总数
 */
export function getTotalSuggestionsCount() {
  let count = 0;
  for (const entry of diffSuggestionsByFile) {
    count += entry[1].size;
  }
  return count;
}

/**
 * 获取所有有建议的文件列表（不包括当前文件）
 */
export function getFilesWithSuggestions(currentFileName) {
  const current = currentFileName || diffCurrentFileName;
  const filesWithSuggestions = [];
  let totalChanges = 0;
  
  for (const entry of diffSuggestionsByFile) {
    const fileName = entry[0];
    const suggestions = entry[1];
    
    if (suggestions.size > 0 && fileName !== current) {
      filesWithSuggestions.push({
        fileName: fileName,
        count: suggestions.size
      });
      totalChanges += suggestions.size;
    }
  }
  
  // 按文件名排序
  filesWithSuggestions.sort((a, b) => a.fileName.localeCompare(b.fileName));
  
  return {
    files: filesWithSuggestions,
    totalFiles: filesWithSuggestions.length,
    totalChanges: totalChanges,
    nextFile: filesWithSuggestions.length > 0 ? filesWithSuggestions[0] : null
  };
}
