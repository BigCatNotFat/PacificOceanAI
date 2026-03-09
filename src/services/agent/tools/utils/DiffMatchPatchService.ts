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
  
  // diff-match-patch 的 bitap 算法限制：模式长度不能超过 32
  private static readonly MAX_BITAP_PATTERN_LENGTH = 32;
  
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
    
    // 尝试使用规范化的文本进行精确匹配（处理空白字符差异）
    const normalizedResult = this.findMatchNormalized(originalText, searchText, startFrom);
    if (normalizedResult.found) {
      return normalizedResult;
    }
    
    // 如果精确匹配失败，使用模糊匹配
    // 注意：bitap 算法有长度限制，需要截断模式
    const safeSearchText = searchText.length > DiffMatchPatchService.MAX_BITAP_PATTERN_LENGTH
      ? searchText.substring(0, DiffMatchPatchService.MAX_BITAP_PATTERN_LENGTH)
      : searchText;
    
    try {
      const matchIndex = this.dmp.match_main(originalText, safeSearchText, startFrom);
      if (matchIndex !== -1) {
        // 如果使用了截断的模式，需要验证完整匹配
        if (searchText.length > DiffMatchPatchService.MAX_BITAP_PATTERN_LENGTH) {
          // 尝试从找到的位置扩展匹配
          const extendedResult = this.extendMatch(originalText, searchText, matchIndex);
          if (extendedResult.found) {
            return extendedResult;
          }
        } else {
          // 估算匹配结束位置
          const end = matchIndex + searchText.length;
          return {
            found: true,
            start: matchIndex,
            end: Math.min(end, originalText.length),
            matchedText: originalText.substring(matchIndex, Math.min(end, originalText.length))
          };
        }
      }
    } catch (error) {
      // 如果 bitap 算法失败，记录错误但继续尝试其他方法
      console.warn('[DiffMatchPatchService] match_main failed:', error);
    }
    
    // 最后尝试基于行的匹配
    const lineBasedResult = this.findMatchByLines(originalText, searchText, startFrom);
    if (lineBasedResult.found) {
      return lineBasedResult;
    }
    
    return {
      found: false,
      start: -1,
      end: -1,
      matchedText: ''
    };
  }
  
  /**
   * 使用规范化文本进行匹配（忽略空白字符差异）
   */
  private findMatchNormalized(originalText: string, searchText: string, startFrom: number): MatchResult {
    // 规范化：将多个空白字符替换为单个空格
    const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim();
    
    const normalizedSearch = normalizeWhitespace(searchText);
    const searchStartIndex = originalText.indexOf(searchText.trim().split('\n')[0], startFrom);
    
    if (searchStartIndex === -1) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    // 从找到的起始位置开始，尝试匹配整个搜索文本
    const searchEnd = Math.min(searchStartIndex + searchText.length * 2, originalText.length);
    const candidateText = originalText.substring(searchStartIndex, searchEnd);
    
    if (normalizeWhitespace(candidateText).startsWith(normalizedSearch)) {
      // 找到实际的结束位置
      const actualEnd = this.findActualEnd(originalText, searchStartIndex, searchText);
      return {
        found: true,
        start: searchStartIndex,
        end: actualEnd,
        matchedText: originalText.substring(searchStartIndex, actualEnd)
      };
    }
    
    return { found: false, start: -1, end: -1, matchedText: '' };
  }
  
  /**
   * 从模糊匹配的起始位置扩展，找到完整匹配
   */
  private extendMatch(originalText: string, searchText: string, startIndex: number): MatchResult {
    // 使用第一行和最后一行作为锚点来确定范围
    const searchLines = searchText.split('\n');
    const firstLine = searchLines[0].trim();
    const lastLine = searchLines[searchLines.length - 1].trim();
    
    // 确认起始位置正确
    const actualStart = originalText.indexOf(firstLine, Math.max(0, startIndex - 50));
    if (actualStart === -1) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    // 找到结束位置
    const actualEnd = originalText.indexOf(lastLine, actualStart);
    if (actualEnd === -1) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    const endPosition = actualEnd + lastLine.length;
    return {
      found: true,
      start: actualStart,
      end: endPosition,
      matchedText: originalText.substring(actualStart, endPosition)
    };
  }
  
  /**
   * 找到匹配的实际结束位置
   */
  private findActualEnd(originalText: string, startIndex: number, searchText: string): number {
    const searchLines = searchText.split('\n');
    const lastLine = searchLines[searchLines.length - 1].trim();
    
    // 从起始位置向后搜索最后一行
    const lastLineIndex = originalText.indexOf(lastLine, startIndex);
    if (lastLineIndex !== -1) {
      return lastLineIndex + lastLine.length;
    }
    
    // 如果找不到，估算结束位置
    return Math.min(startIndex + searchText.length, originalText.length);
  }
  
  /**
   * 基于行的匹配方法
   */
  private findMatchByLines(originalText: string, searchText: string, startFrom: number): MatchResult {
    const originalLines = originalText.split('\n');
    const searchLines = searchText.split('\n').filter(line => line.trim().length > 0);
    
    if (searchLines.length === 0) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    // 找到第一行
    const firstSearchLine = searchLines[0].trim();
    let lineOffset = 0;
    let foundLineIndex = -1;
    
    for (let i = 0; i < originalLines.length; i++) {
      lineOffset += (i > 0 ? originalLines[i - 1].length + 1 : 0);
      if (lineOffset >= startFrom && originalLines[i].trim() === firstSearchLine) {
        foundLineIndex = i;
        break;
      }
    }
    
    if (foundLineIndex === -1) {
      return { found: false, start: -1, end: -1, matchedText: '' };
    }
    
    // 计算起始位置
    let startPosition = 0;
    for (let i = 0; i < foundLineIndex; i++) {
      startPosition += originalLines[i].length + 1;
    }
    
    // 找到最后一行
    const lastSearchLine = searchLines[searchLines.length - 1].trim();
    let endLineIndex = foundLineIndex;
    
    for (let i = foundLineIndex; i < originalLines.length; i++) {
      if (originalLines[i].trim() === lastSearchLine) {
        endLineIndex = i;
        break;
      }
    }
    
    // 计算结束位置
    let endPosition = startPosition;
    for (let i = foundLineIndex; i <= endLineIndex; i++) {
      endPosition += originalLines[i].length + (i < endLineIndex ? 1 : 0);
    }
    
    return {
      found: true,
      start: startPosition,
      end: endPosition,
      matchedText: originalText.substring(startPosition, endPosition)
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
   * 算法：
   * 1. 从编辑内容中提取第一行作为起始锚点
   * 2. 在原文中找到起始锚点
   * 3. 尝试找到结束边界（可能是下一个占位符前的内容，或者下一个结构标记）
   * 4. 用编辑内容替换起始锚点到结束边界之间的内容
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
    let endMatch = this.findMatch(originalContent, anchorAfter, startMatch.start + 1);
    
    // 如果结束锚点找不到，尝试智能推断结束位置
    if (!endMatch.found) {
      console.log('[DiffMatchPatchService] End anchor not found, trying smart detection...');
      endMatch = this.findSmartEndPosition(originalContent, startMatch, firstBlock, contentBlocks);
    }
    
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
   * 智能推断结束位置
   * 当结束锚点在原文中找不到时（可能是新内容/翻译），尝试推断结束边界
   */
  private findSmartEndPosition(
    originalContent: string, 
    startMatch: MatchResult,
    firstBlock: EditBlock,
    contentBlocks: EditBlock[]
  ): MatchResult {
    const firstBlockLines = firstBlock.content.split('\n');
    
    // 策略1：查找编辑内容中最后一行能在原文中匹配的位置
    // 从第一个内容块的行中，从后往前找，找到第一个在原文中存在的行
    for (let i = firstBlockLines.length - 1; i >= 1; i--) {
      const line = firstBlockLines[i].trim();
      if (line.length > 10) { // 跳过太短的行
        const match = this.findMatch(originalContent, line, startMatch.start + 1);
        if (match.found) {
          console.log('[DiffMatchPatchService] Found matching line in original:', line.substring(0, 50));
          return match;
        }
      }
    }
    
    // 策略2：查找下一个 LaTeX 结构标记作为边界
    // 常见的 LaTeX 结构标记
    const structureMarkers = [
      '\\section{',
      '\\subsection{',
      '\\subsubsection{',
      '\\chapter{',
      '\\part{',
      '\\paragraph{',
      '\\begin{',
      '\\end{document}'
    ];
    
    // 从起始锚点开始的第一行提取结构类型
    const startLine = firstBlockLines[0];
    let currentMarker = '';
    for (const marker of structureMarkers) {
      if (startLine.includes(marker)) {
        currentMarker = marker;
        break;
      }
    }
    
    // 在原文中找到下一个相同类型的结构标记
    if (currentMarker) {
      const searchStart = startMatch.end;
      const nextMarkerIndex = originalContent.indexOf(currentMarker, searchStart);
      
      if (nextMarkerIndex !== -1) {
        // 找到下一个标记前的换行位置
        let endPos = nextMarkerIndex;
        // 向前回退到上一行的结尾（跳过空白行）
        while (endPos > searchStart && /\s/.test(originalContent[endPos - 1])) {
          endPos--;
        }
        
        console.log('[DiffMatchPatchService] Found next structure marker at:', nextMarkerIndex);
        return {
          found: true,
          start: endPos,
          end: endPos,
          matchedText: ''
        };
      }
    }
    
    // 策略3：如果有多个内容块，检查第二个内容块的第一行是否在原文中
    if (contentBlocks.length > 1) {
      const secondBlock = contentBlocks[1];
      const secondBlockFirstLine = secondBlock.content.split('\n')[0].trim();
      if (secondBlockFirstLine.length > 5) {
        const match = this.findMatch(originalContent, secondBlockFirstLine, startMatch.start + 1);
        if (match.found) {
          console.log('[DiffMatchPatchService] Found second block anchor:', secondBlockFirstLine.substring(0, 50));
          // 返回第二个块起始位置之前的位置作为第一个块的结束
          return {
            found: true,
            start: match.start,
            end: match.start,
            matchedText: ''
          };
        }
      }
    }
    
    // 策略4：使用行数估算
    // 找到原文中从起始锚点开始的、行数与编辑内容相近的位置
    const editLineCount = firstBlockLines.length;
    const originalLines = originalContent.substring(startMatch.start).split('\n');
    
    if (originalLines.length >= editLineCount) {
      // 估算结束位置
      let estimatedEnd = startMatch.start;
      for (let i = 0; i < Math.min(editLineCount + 2, originalLines.length); i++) {
        estimatedEnd += originalLines[i].length + 1;
      }
      
      // 找到最近的空行或段落结束
      const nearestBreak = originalContent.indexOf('\n\n', estimatedEnd - 50);
      if (nearestBreak !== -1 && nearestBreak < estimatedEnd + 100) {
        console.log('[DiffMatchPatchService] Using estimated end position with paragraph break');
        return {
          found: true,
          start: nearestBreak,
          end: nearestBreak,
          matchedText: ''
        };
      }
    }
    
    return { found: false, start: -1, end: -1, matchedText: '' };
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
