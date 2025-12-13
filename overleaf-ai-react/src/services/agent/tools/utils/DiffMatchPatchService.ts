/**
 * DiffMatchPatchService - 使用 Google 的 diff-match-patch 库处理编辑
 * 
 * 主要功能：
 * 1. 解析带有 `// ... existing latex ...` 标记的编辑指令
 * 2. 使用模糊匹配找到原文中对应的位置
 * 3. 计算差异并生成编辑操作
 */

import DiffMatchPatch from 'diff-match-patch';

/** 编辑块：解析后的编辑片段 */
export interface EditBlock {
  /** 是否是占位符（表示未改变的代码） */
  isPlaceholder: boolean;
  /** 内容（如果是占位符，则为空） */
  content: string;
  /** 原始行（用于调试） */
  rawLines: string[];
}

/** 匹配结果 */
export interface MatchResult {
  /** 是否找到匹配 */
  found: boolean;
  /** 匹配的起始位置 */
  start: number;
  /** 匹配的结束位置 */
  end: number;
  /** 匹配的原文内容 */
  matchedText: string;
}

/** 编辑应用结果 */
export interface ApplyEditResult {
  /** 是否成功 */
  success: boolean;
  /** 新的文档内容 */
  newContent: string;
  /** 错误信息 */
  error?: string;
  /** 应用的更改数量 */
  changesApplied: number;
  /** 调试信息 */
  debugInfo?: {
    blocks?: EditBlock[];
    matchResults?: MatchResult[];
    method?: string;
    anchorBefore?: string;
    anchorAfter?: string;
    oldSection?: string;
    newSection?: string;
  };
}

/**
 * DiffMatchPatchService
 * 
 * 处理大模型返回的编辑指令，应用到原始文档
 */
export class DiffMatchPatchService {
  private dmp: DiffMatchPatch;
  
  // 占位符正则表达式
  private static readonly PLACEHOLDER_PATTERNS = [
    /^\s*\/\/\s*\.\.\.\s*existing\s+latex\s*(codes?)?\s*\.{0,3}\s*$/i,
    /^\s*%\s*\.\.\.\s*existing\s+latex\s*(codes?)?\s*\.{0,3}\s*$/i,
    /^\s*\/\/\s*\.\.\.\s*existing\s+code\s*\.{0,3}\s*$/i,
    /^\s*%\s*\.\.\.\s*existing\s+code\s*\.{0,3}\s*$/i,
    /^\s*\/\/\s*\.{3,}\s*$/,
    /^\s*%\s*\.{3,}\s*$/,
  ];
  
  constructor() {
    this.dmp = new DiffMatchPatch();
    // 设置模糊匹配的阈值
    this.dmp.Match_Threshold = 0.5;
    this.dmp.Match_Distance = 1000;
  }
  
  /**
   * 解析编辑指令，提取编辑块
   * 
   * @param editContent 大模型返回的编辑内容
   * @returns 编辑块数组
   */
  parseEditBlocks(editContent: string): EditBlock[] {
    const lines = editContent.split('\n');
    const blocks: EditBlock[] = [];
    let currentBlock: EditBlock = {
      isPlaceholder: false,
      content: '',
      rawLines: []
    };
    
    for (const line of lines) {
      const isPlaceholder = this.isPlaceholderLine(line);
      
      if (isPlaceholder) {
        // 如果当前块有内容，保存它
        if (currentBlock.rawLines.length > 0) {
          currentBlock.content = currentBlock.rawLines.join('\n');
          blocks.push(currentBlock);
        }
        // 添加占位符块
        blocks.push({
          isPlaceholder: true,
          content: '',
          rawLines: [line]
        });
        // 开始新块
        currentBlock = {
          isPlaceholder: false,
          content: '',
          rawLines: []
        };
      } else {
        currentBlock.rawLines.push(line);
      }
    }
    
    // 保存最后一个块
    if (currentBlock.rawLines.length > 0) {
      currentBlock.content = currentBlock.rawLines.join('\n');
      blocks.push(currentBlock);
    }
    
    return blocks;
  }
  
  /**
   * 检查是否是占位符行
   */
  private isPlaceholderLine(line: string): boolean {
    return DiffMatchPatchService.PLACEHOLDER_PATTERNS.some(pattern => pattern.test(line));
  }
  
  /**
   * 在原文中查找匹配的文本位置
   * 
   * @param originalText 原始文档内容
   * @param searchText 要搜索的文本
   * @param startFrom 从哪个位置开始搜索
   * @returns 匹配结果
   */
  findMatch(originalText: string, searchText: string, startFrom: number = 0): MatchResult {
    if (!searchText || searchText.trim().length === 0) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    // 首先尝试精确匹配
    const exactIndex = originalText.indexOf(searchText, startFrom);
    if (exactIndex !== -1) {
      return {
        found: true,
        start: exactIndex,
        end: exactIndex + searchText.length,
        matchedText: searchText
      };
    }
    
    // 如果精确匹配失败，使用模糊匹配
    const matchIndex = this.dmp.match_main(originalText, searchText, startFrom);
    if (matchIndex !== -1) {
      // 估算匹配结束位置
      const end = matchIndex + searchText.length;
      return {
        found: true,
        start: matchIndex,
        end: Math.min(end, originalText.length),
        matchedText: originalText.substring(matchIndex, Math.min(end, originalText.length))
      };
    }
    
    return {
      found: false,
      start: -1,
      end: -1,
      matchedText: ''
    };
  }
  
  /**
   * 应用编辑到原始文档
   * 
   * 算法：
   * 1. 解析编辑内容为编辑块
   * 2. 对于非占位符块，在原文中找到对应位置
   * 3. 替换找到的内容
   * 
   * @param originalContent 原始文档内容
   * @param editContent 编辑指令内容
   * @returns 应用结果
   */
  applyEdit(originalContent: string, editContent: string): ApplyEditResult {
    try {
      console.log('[DiffMatchPatchService] applyEdit called');
      console.log('[DiffMatchPatchService] Original content length:', originalContent.length);
      console.log('[DiffMatchPatchService] Edit content:', editContent.substring(0, 500));
      
      const blocks = this.parseEditBlocks(editContent);
      console.log('[DiffMatchPatchService] Parsed blocks:', blocks.length);
      blocks.forEach((b, i) => {
        console.log(`[DiffMatchPatchService] Block ${i}: isPlaceholder=${b.isPlaceholder}, content="${b.content.substring(0, 100)}..."`);
      });
      
      // 如果没有编辑块，返回原内容
      if (blocks.length === 0) {
        return {
          success: true,
          newContent: originalContent,
          changesApplied: 0,
          debugInfo: { method: 'no-blocks' }
        };
      }
      
      // 如果只有一个非占位符块且没有占位符，可能是全量替换
      const hasPlaceholder = blocks.some(b => b.isPlaceholder);
      if (!hasPlaceholder && blocks.length === 1) {
        console.log('[DiffMatchPatchService] Using full diff method');
        return this.applyWithDiff(originalContent, blocks[0].content);
      }
      
      // 有占位符的情况，使用锚点匹配方法
      console.log('[DiffMatchPatchService] Using anchor-based method');
      return this.applyWithAnchors(originalContent, blocks);
    } catch (error) {
      console.error('[DiffMatchPatchService] Error:', error);
      return {
        success: false,
        newContent: originalContent,
        error: error instanceof Error ? error.message : String(error),
        changesApplied: 0
      };
    }
  }
  
  /**
   * 使用 diff-match-patch 计算差异并应用
   */
  private applyWithDiff(originalContent: string, newContent: string): ApplyEditResult {
    const diffs = this.dmp.diff_main(originalContent, newContent);
    this.dmp.diff_cleanupSemantic(diffs);
    
    const patches = this.dmp.patch_make(originalContent, diffs);
    const [patchedText, results] = this.dmp.patch_apply(patches, originalContent);
    
    const successCount = results.filter(r => r).length;
    
    return {
      success: true,
      newContent: patchedText,
      changesApplied: successCount,
      debugInfo: { method: 'full-diff' }
    };
  }
  
  /**
   * 使用锚点匹配方法处理带有占位符的编辑
   * 
   * 新算法：
   * 1. 从编辑内容中提取第一行和最后一行作为锚点
   * 2. 在原文中找到这两个锚点
   * 3. 用编辑内容替换锚点之间的内容
   */
  private applyWithAnchors(originalContent: string, blocks: EditBlock[]): ApplyEditResult {
    // 获取所有非占位符块的内容
    const contentBlocks = blocks.filter(b => !b.isPlaceholder && b.content.trim().length > 0);
    
    if (contentBlocks.length === 0) {
      return {
        success: true,
        newContent: originalContent,
        changesApplied: 0,
        debugInfo: { method: 'no-content-blocks', blocks }
      };
    }
    
    // 获取第一个内容块的第一行作为起始锚点
    const firstBlock = contentBlocks[0];
    const firstBlockLines = firstBlock.content.split('\n');
    const anchorBefore = firstBlockLines[0];
    
    // 获取最后一个内容块的最后一行作为结束锚点
    const lastBlock = contentBlocks[contentBlocks.length - 1];
    const lastBlockLines = lastBlock.content.split('\n');
    const anchorAfter = lastBlockLines[lastBlockLines.length - 1];
    
    console.log('[DiffMatchPatchService] Anchor before:', anchorBefore);
    console.log('[DiffMatchPatchService] Anchor after:', anchorAfter);
    
    // 在原文中找到起始锚点
    const startMatch = this.findMatch(originalContent, anchorBefore, 0);
    if (!startMatch.found) {
      return {
        success: false,
        newContent: originalContent,
        error: `无法在原文中找到起始锚点: "${anchorBefore.substring(0, 50)}..."`,
        changesApplied: 0,
        debugInfo: { method: 'anchor-not-found', anchorBefore }
      };
    }
    
    // 在原文中找到结束锚点（从起始锚点之后开始搜索）
    const endMatch = this.findMatch(originalContent, anchorAfter, startMatch.start + 1);
    if (!endMatch.found) {
      return {
        success: false,
        newContent: originalContent,
        error: `无法在原文中找到结束锚点: "${anchorAfter.substring(0, 50)}..."`,
        changesApplied: 0,
        debugInfo: { method: 'anchor-not-found', anchorAfter }
      };
    }
    
    console.log('[DiffMatchPatchService] Start match:', startMatch.start, '-', startMatch.end);
    console.log('[DiffMatchPatchService] End match:', endMatch.start, '-', endMatch.end);
    
    // 构建新的编辑区域内容（合并所有内容块，跳过占位符）
    const newSectionContent = contentBlocks.map(b => b.content).join('\n');
    
    // 获取原文中对应区域
    const oldSection = originalContent.substring(startMatch.start, endMatch.end);
    
    console.log('[DiffMatchPatchService] Old section length:', oldSection.length);
    console.log('[DiffMatchPatchService] New section length:', newSectionContent.length);
    
    // 执行替换
    const beforeSection = originalContent.substring(0, startMatch.start);
    const afterSection = originalContent.substring(endMatch.end);
    const newContent = beforeSection + newSectionContent + afterSection;
    
    return {
      success: true,
      newContent,
      changesApplied: 1,
      debugInfo: {
        method: 'anchor-based',
        anchorBefore,
        anchorAfter,
        oldSection: oldSection.substring(0, 200),
        newSection: newSectionContent.substring(0, 200)
      }
    };
  }
  
  /**
   * 简单的全量替换（当编辑内容没有占位符时使用）
   */
  applyFullReplace(originalContent: string, newContent: string): ApplyEditResult {
    return {
      success: true,
      newContent,
      changesApplied: 1
    };
  }
  
  /**
   * 使用 search-replace 模式应用编辑
   * 
   * @param originalContent 原始内容
   * @param oldString 要替换的旧字符串
   * @param newString 新字符串
   */
  applySearchReplace(originalContent: string, oldString: string, newString: string): ApplyEditResult {
    // 精确匹配
    const index = originalContent.indexOf(oldString);
    if (index !== -1) {
      const newContent = originalContent.substring(0, index) + newString + 
                        originalContent.substring(index + oldString.length);
      return {
        success: true,
        newContent,
        changesApplied: 1
      };
    }
    
    // 模糊匹配
    const matchIndex = this.dmp.match_main(originalContent, oldString, 0);
    if (matchIndex !== -1) {
      // 使用 diff 来确定精确的替换范围
      const diffs = this.dmp.diff_main(
        originalContent.substring(matchIndex, matchIndex + oldString.length * 2),
        newString
      );
      this.dmp.diff_cleanupSemantic(diffs);
      
      const patches = this.dmp.patch_make(originalContent, [{
        diffs,
        start1: matchIndex,
        start2: matchIndex,
        length1: oldString.length,
        length2: newString.length
      }]);
      
      const [patchedText, results] = this.dmp.patch_apply(patches, originalContent);
      
      if (results.some(r => r)) {
        return {
          success: true,
          newContent: patchedText,
          changesApplied: 1
        };
      }
    }
    
    return {
      success: false,
      newContent: originalContent,
      error: `无法在原文中找到匹配的内容：\n${oldString.substring(0, 100)}...`,
      changesApplied: 0
    };
  }
}

// 导出单例
export const diffMatchPatchService = new DiffMatchPatchService();
