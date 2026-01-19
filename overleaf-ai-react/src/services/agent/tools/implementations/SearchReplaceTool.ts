/**
 * search_replace - 字符串搜索替换工具
 * 
 * 功能：通过字符串匹配来替换文件内容
 * 类型：write（写操作）
 * 
 * 适用场景：
 * - 修改某个词或短语
 * - 修复拼写错误
 * - 替换引用 \cite{xxx}
 * - 小范围文本调整
 * - 批量替换变量名、引用等
 * 
 * 审批模式：
 * - 创建 diff 建议而不是直接修改
 * - 用户可以逐个或批量接受/拒绝
 * - 不阻塞 AI 的运行
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { diffSuggestionService } from '../../../editor/DiffSuggestionService';
import type { CreateSegmentSuggestionInput } from '../../../../platform/editor/IDiffSuggestionService';

/**
 * 匹配位置信息（片段级）
 */
interface MatchInfo {
  /** 字符偏移位置 */
  index: number;
  /** 所在行号（用于显示） */
  startLine: number;
  /** 结束行号（用于显示） */
  endLine: number;
  /** 原始内容 */
  oldContent: string;
}

/**
 * 字符串搜索替换工具
 * 
 * 通过精确匹配 old_string 来替换为 new_string，支持替换所有匹配项
 * 修改会以 diff 建议的形式显示，用户可以选择接受或拒绝
 */
export class SearchReplaceTool extends BaseTool {
  // 预览配置
  private readonly MAX_PREVIEW_CHARS = 150;

  protected metadata: ToolMetadata = {
    name: 'search_replace',
    description: `Replace text in a file by matching a specific string. Supports replacing single or all occurrences.

**CRITICAL RULES:**
1. Use a COMPLETE sentence as \`old_string\` to ensure unique matching.
2. Do NOT use fragments that might match multiple places (e.g., "the" or "is").
3. Set \`replace_all=true\` to replace ALL occurrences (useful for renaming variables, updating citations).
4. Changes will be shown as diff suggestions. Users can accept or reject each change individually.

Good examples:
- old_string: "This is the first sentence of this paragraph."
- old_string: "\\cite{smith2020}" with replace_all=true (to update all citations)

⚠️ For larger changes (replacing entire paragraphs), use \`replace_lines\` instead.`,

    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The target file to modify.'
        },
        old_string: {
          type: 'string',
          description: 'The text to be replaced. Must be unique in the file unless replace_all is true.'
        },
        new_string: {
          type: 'string',
          description: 'The new text to replace with.'
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace ALL occurrences. If false (default), replace only the first occurrence and error if multiple matches found.'
        },
        explanation: {
          type: 'string',
          description: 'Brief one-sentence summary of the change.'
        }
      },
      required: ['target_file', 'old_string', 'new_string', 'explanation']
    },
    needApproval: false, // 使用新的 diff 建议机制，不使用旧的审批流程
    modes: ['agent']
  };

  /**
   * 截断预览内容
   */
  private truncatePreview(text: string): string {
    if (text.length <= this.MAX_PREVIEW_CHARS) {
      return text;
    }
    return text.slice(0, 80) + ' ... ' + text.slice(-50);
  }

  /**
   * 获取文本所在的行号（1-indexed）
   */
  private getLineNumber(content: string, index: number): number {
    const beforeText = content.substring(0, index);
    return (beforeText.match(/\n/g) || []).length + 1;
  }

  /**
   * 获取匹配文本的行范围
   */
  private getLineRange(content: string, matchIndex: number, matchText: string): { startLine: number; endLine: number } {
    const startLine = this.getLineNumber(content, matchIndex);
    const endIndex = matchIndex + matchText.length;
    const endLine = this.getLineNumber(content, endIndex - 1); // -1 因为我们要包含最后一个字符所在的行
    return { startLine, endLine };
  }

  /**
   * 获取所有匹配位置及其行号信息
   */
  private findAllMatchesWithInfo(content: string, searchStr: string): MatchInfo[] {
    const matches: MatchInfo[] = [];
    let currentIndex = 0;
    
    while (true) {
      const index = content.indexOf(searchStr, currentIndex);
      if (index === -1) break;
      
      const { startLine, endLine } = this.getLineRange(content, index, searchStr);
      
      matches.push({
        index,
        startLine,
        endLine,
        oldContent: searchStr
      });
      
      currentIndex = index + 1;
    }
    
    return matches;
  }

  /**
   * 执行搜索替换
   * 
   * 创建 diff 建议而不是直接修改，用户可以选择接受或拒绝
   */
  async execute(args: {
    target_file: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
    explanation: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    // 生成一个工具调用 ID
    const toolCallId = `search_replace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const replaceAll = args.replace_all ?? false;
      
      console.log('[SearchReplaceTool] execute called with:', {
        target_file: args.target_file,
        old_string_len: args.old_string?.length,
        new_string_len: args.new_string?.length,
        replace_all: replaceAll,
        explanation: args.explanation
      });

      // 参数验证
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters',
          duration: Date.now() - startTime
        };
      }

      // Trim 前后空格
      const oldString = args.old_string.trim();
      const newString = args.new_string.trim();

      if (!oldString) {
        return {
          success: false,
          error: 'old_string cannot be empty after trimming',
          duration: Date.now() - startTime
        };
      }

      // 1. 检查并切换到目标文件
      const currentFileName = await this.getCurrentFileName();
      const targetBaseName = args.target_file.split('/').pop() || args.target_file;
      const isCurrentFile = currentFileName === targetBaseName ||
        currentFileName === args.target_file ||
        args.target_file.endsWith(currentFileName || '');

      console.log('[SearchReplaceTool] Current file:', currentFileName, 'Target:', targetBaseName, 'Is current:', isCurrentFile);

      if (!isCurrentFile) {
        console.log(`[SearchReplaceTool] Switching to file "${targetBaseName}"...`);
        const switchResult = await overleafEditor.file.switchFile(targetBaseName);

        if (!switchResult.success) {
          return {
            success: false,
            error: `无法切换到文件 "${args.target_file}": ${switchResult.error}`,
            duration: Date.now() - startTime
          };
        }

        // 等待文件切换完成
        const switchSuccess = await this.waitForFileSwitch(targetBaseName);
        if (!switchSuccess) {
          return {
            success: false,
            error: `文件 "${args.target_file}" 切换超时`,
            duration: Date.now() - startTime
          };
        }
      }

      // 2. 获取当前文件内容
      const originalContent = await overleafEditor.document.getText();

      // 3. 查找所有匹配及其位置信息
      let matches = this.findAllMatchesWithInfo(originalContent, oldString);

      if (matches.length === 0) {
        // 尝试标准化换行符后匹配
        const normalizedContent = originalContent.replace(/\r\n/g, '\n');
        const normalizedOld = oldString.replace(/\r\n/g, '\n');
        matches = this.findAllMatchesWithInfo(normalizedContent, normalizedOld);

        if (matches.length === 0) {
          return {
            success: false,
            error: `Could not find exact match for old_string in file.`,
            duration: Date.now() - startTime,
            data: {
              file: args.target_file,
              found: false,
              hint: 'Make sure the text matches exactly, including whitespace.'
            }
          };
        }
      }

      // 4. 如果不是 replace_all 且有多个匹配，返回错误
      if (!replaceAll && matches.length > 1) {
        const lineNumbers = matches.map(m => m.startLine);
        return {
          success: false,
          error: `Found ${matches.length} matches for old_string at lines: ${lineNumbers.join(', ')}. Use replace_all=true to replace all, or use a more unique text.`,
          duration: Date.now() - startTime,
          data: {
            file: args.target_file,
            found: true,
            matchCount: matches.length,
            matchLines: lineNumbers,
            hint: 'Set replace_all=true or include more context to make old_string unique.'
          }
        };
      }

      // 5. 检查内容是否有变化
      if (oldString === newString) {
        return {
          success: true,
          data: {
            file: args.target_file,
            applied: false,
            message: '替换内容与原文相同，无需修改'
          },
          duration: Date.now() - startTime
        };
      }

      // 6. 准备创建片段级 diff 建议
      // 如果不是 replace_all，只处理第一个匹配
      const matchesToProcess = replaceAll ? matches : [matches[0]];
      
      const suggestionInputs: CreateSegmentSuggestionInput[] = [];
      const previewLines: string[] = [];

      for (const match of matchesToProcess) {
        suggestionInputs.push({
          toolCallId,
          toolName: 'search_replace', // 添加工具名，用于统计
          targetFile: targetBaseName,
          startOffset: match.index,
          endOffset: match.index + match.oldContent.length,
          oldContent: match.oldContent,
          newContent: newString
        });

        const truncatedOld = this.truncatePreview(oldString);
        const truncatedNew = this.truncatePreview(newString);
        previewLines.push(`第 ${match.startLine} 行: "${truncatedOld}" → "${truncatedNew}"`);
      }

      // 7. 批量创建片段级 diff 建议
      console.log('[SearchReplaceTool] Creating segment diff suggestions...');
      const suggestionIds = await diffSuggestionService.createBatchSegmentSuggestions(suggestionInputs);

      console.log(`[SearchReplaceTool] Created ${suggestionIds.length} segment diff suggestions:`, suggestionIds);

      // 8. 生成预览
      const lineNumbers = matchesToProcess.map(m => m.startLine);
      let preview: string;
      if (replaceAll && matchesToProcess.length > 1) {
        const shownLines = lineNumbers.slice(0, 5).join(', ');
        const moreLines = matchesToProcess.length > 5 ? ` ... 等 ${matchesToProcess.length} 处` : '';
        preview = `📝 已创建 ${matchesToProcess.length} 个修改建议 (第 ${shownLines}${moreLines} 行)\n` + previewLines.slice(0, 5).join('\n');
        if (previewLines.length > 5) {
          preview += `\n... 还有 ${previewLines.length - 5} 处`;
        }
      } else {
        preview = `📝 已创建修改建议:\n${previewLines[0]}`;
      }

      return {
        success: true,
        data: {
          file: args.target_file,
          applied: false, // 未直接应用，而是创建了建议
          pending_approval: true,
          message: `已创建 ${suggestionIds.length} 个修改建议，等待用户确认。用户可以逐个或批量接受/拒绝修改。`,
          suggestionIds,
          replacedCount: matchesToProcess.length,
          lineNumbers,
          preview
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error('[SearchReplaceTool] Error:', error);
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 生成摘要
   */
  getSummary(args: {
    target_file: string;
    replace_all?: boolean;
    explanation: string;
  }): string {
    const mode = args.replace_all ? '(全部替换)' : '';
    return `搜索替换 ${args.target_file} ${mode}: ${args.explanation}`;
  }

  /**
   * 获取当前打开的文件名
   */
  private async getCurrentFileName(): Promise<string | null> {
    try {
      const fileInfo = await overleafEditor.file.getInfo();
      return fileInfo.fileName;
    } catch (error) {
      console.error('[SearchReplaceTool] Failed to get current file name:', error);
      return null;
    }
  }

  /**
   * 等待文件切换完成
   */
  private async waitForFileSwitch(targetFileName: string, timeoutMs = 3000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = await this.getCurrentFileName();
      if (current === targetFileName || (current && targetFileName.endsWith(current))) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }
}
