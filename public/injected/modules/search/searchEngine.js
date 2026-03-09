/**
 * 搜索模块 - 搜索引擎
 * 负责搜索逻辑和正则表达式处理
 */

import { getProjectId } from './projectId.js';
import { getAllDocsWithContent } from './fetchers.js';
import { debug, warn } from '../core/logger.js';

// 创建正则表达式
export function createSearchRegex(pattern, options = {}) {
  const { caseSensitive = false, wholeWord = false, regexp = false } = options;
  
  let regexPattern;
  
  if (regexp) {
    // 使用用户提供的正则表达式
    regexPattern = pattern;
  } else {
    // 转义特殊字符
    regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 如果是全字匹配，添加单词边界
  if (wholeWord) {
    regexPattern = `\\b${regexPattern}\\b`;
  }

  const flags = caseSensitive ? 'g' : 'gi';
  
  try {
    return new RegExp(regexPattern, flags);
  } catch (error) {
    throw new Error(`无效的正则表达式: ${error.message}`);
  }
}

// 搜索单个文件
export function searchInFile(file, regex) {
  const lines = file.content.split('\n');
  const matches = [];

  lines.forEach((line, lineIndex) => {
    let match;
    // 重置 lastIndex
    regex.lastIndex = 0;
    
    const matchesInLine = [];
    while ((match = regex.exec(line)) !== null) {
      matchesInLine.push({
        lineNumber: lineIndex + 1,
        columnStart: match.index + 1,
        columnEnd: match.index + match[0].length + 1,
        matchedText: match[0],
        lineContent: line,
      });
      
      // 防止无限循环（空匹配）
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
    
    matches.push(...matchesInLine);
  });

  return matches;
}

// 主搜索函数
export async function searchInternal(pattern, options = {}) {
  const startTime = Date.now();
  
  debug(`[OverleafBridge] 🔍 正在搜索: "${pattern}"`);
  debug('[OverleafBridge] 搜索选项:', options);
  
  try {
    const projectId = getProjectId();
    debug(`[OverleafBridge] 📂 项目 ID: ${projectId}`);
    
    // 获取所有文档及其内容
    debug('[OverleafBridge] 📥 正在获取项目文档...');
    const files = await getAllDocsWithContent(projectId);
    debug(`[OverleafBridge] ✅ 已加载 ${files.length} 个文档`);
    
    if (files.length === 0) {
      warn('[OverleafBridge] ⚠️ 未找到任何文档，搜索将返回空结果');
      return {
        results: [],
        totalMatches: 0,
        fileCount: 0,
        duration: ((Date.now() - startTime) / 1000).toFixed(2),
        error: '未找到任何文档'
      };
    }
    
    // 创建搜索正则表达式
    const regex = createSearchRegex(pattern, options);
    
    // 搜索所有文件
    debug('[OverleafBridge] 🔎 正在搜索...');
    const results = [];
    let totalMatches = 0;
    
    for (const file of files) {
      const matches = searchInFile(file, regex);
      if (matches.length > 0) {
        results.push({
          path: file.path,
          matchCount: matches.length,
          matches: matches,
        });
        totalMatches += matches.length;
      }
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    debug(`[OverleafBridge] ✨ 搜索完成！用时: ${duration}秒, 找到 ${totalMatches} 个匹配项`);
    
    return {
      results,
      totalMatches,
      fileCount: results.length,
      duration
    };
    
  } catch (error) {
    console.error('[OverleafBridge] ❌ 搜索失败:', error);
    throw error;
  }
}
