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
import { logger } from '../../../../utils/logger';

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
 * 支持一次性对多个文件执行多组搜索替换操作
 */
export class SearchReplaceTool extends BaseTool {
  private readonly MAX_PREVIEW_CHARS = 150;

  protected metadata: ToolMetadata = {
    name: 'search_replace',
    description: `Replace text in one or more files by matching specific strings. Supports batch operations across multiple files in a single call.

**Batch multi-file mode (recommended):** Provide an \`operations\` array, each item contains: target_file, old_string, new_string, and optional replace_all.
**Single mode (backward compatible):** Provide target_file, old_string, new_string directly.

**CRITICAL RULES:**
1. \`old_string\` MUST be a non-empty string. Empty strings are NOT allowed — this tool cannot insert content into empty files. Use \`replace_lines\` for that.
2. Use a COMPLETE sentence as \`old_string\` to ensure unique matching.
3. Do NOT use fragments that might match multiple places (e.g., "the" or "is").
4. Set \`replace_all=true\` to replace ALL occurrences (useful for renaming variables, updating citations).
5. Changes are applied immediately to the document and are compilable right away. Users can undo individual changes if needed, but this does not block you.
6. When you have multiple search-replace operations (even across different files), batch them in ONE call using the \`operations\` array.

Examples:
- Single: target_file="main.tex", old_string="old text", new_string="new text"
- Multi-file batch: operations=[{target_file:"main.tex", old_string:"old1", new_string:"new1"}, {target_file:"intro.tex", old_string:"old2", new_string:"new2"}]

⚠️ For larger changes (replacing entire paragraphs), use \`replace_lines\` instead.`,

    parameters: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of search-replace operations. Each item specifies a target file and the replacement. Use this for batch editing.',
          items: {
            type: 'object',
            properties: {
              target_file: { type: 'string', description: 'The target file to modify.' },
              old_string: { type: 'string', description: 'The text to be replaced. MUST be non-empty.' },
              new_string: { type: 'string', description: 'The new text to replace with.' },
              replace_all: { type: 'boolean', description: 'If true, replace ALL occurrences.' }
            },
            required: ['target_file', 'old_string', 'new_string']
          }
        },
        target_file: {
          type: 'string',
          description: '(Single mode) The target file to modify.'
        },
        old_string: {
          type: 'string',
          description: '(Single mode) The text to be replaced. MUST be non-empty.'
        },
        new_string: {
          type: 'string',
          description: '(Single mode) The new text to replace with.'
        },
        replace_all: {
          type: 'boolean',
          description: '(Single mode) If true, replace ALL occurrences.'
        },
        explanation: {
          type: 'string',
          description: 'Brief one-sentence summary of the change.'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
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
   * 标准化参数为 operations 数组
   */
  private normalizeToOperations(args: any): Array<{
    target_file: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }> {
    if (Array.isArray(args.operations) && args.operations.length > 0) {
      return args.operations;
    }
    if (args.target_file && args.old_string != null && args.new_string != null) {
      return [{
        target_file: args.target_file,
        old_string: args.old_string,
        new_string: args.new_string,
        replace_all: args.replace_all
      }];
    }
    return [];
  }

  /**
   * 对单个文件执行搜索替换
   */
  private async executeForFile(
    op: { target_file: string; old_string: string; new_string: string; replace_all?: boolean },
    toolCallId: string
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    const replaceAll = op.replace_all ?? false;

    const oldString = op.old_string.trim();
    const newString = op.new_string.trim();

    if (!oldString) {
      return { success: false, error: `[${op.target_file}] old_string cannot be empty` };
    }

    // 1. 切换到目标文件
    const currentFileName = await this.getCurrentFileName();
    const targetBaseName = op.target_file.split('/').pop() || op.target_file;
    const isCurrentFile = currentFileName !== null && (
      currentFileName === targetBaseName ||
      currentFileName === op.target_file ||
      op.target_file.endsWith(currentFileName)
    );

    if (!isCurrentFile) {
      let preSwitchContent: string | null = null;
      try { preSwitchContent = await overleafEditor.document.getText(); } catch { /* ignore */ }

      const switchResult = await overleafEditor.file.switchFile(op.target_file);
      if (!switchResult.success) {
        return { success: false, error: `[${op.target_file}] 无法切换到文件: ${switchResult.error}` };
      }

      const switchSuccess = await this.waitForFileSwitch(targetBaseName, 5000, preSwitchContent);
      if (!switchSuccess) {
        return { success: false, error: `[${op.target_file}] 文件切换超时` };
      }
    }

    // 2. 获取当前文件内容
    const originalContent = await overleafEditor.document.getText();

    // 3. 查找匹配
    let matches = this.findAllMatchesWithInfo(originalContent, oldString);

    if (matches.length === 0) {
      const normalizedContent = originalContent.replace(/\r\n/g, '\n');
      const normalizedOld = oldString.replace(/\r\n/g, '\n');
      matches = this.findAllMatchesWithInfo(normalizedContent, normalizedOld);

      if (matches.length === 0) {
        return {
          success: false,
          error: `[${op.target_file}] Could not find exact match for old_string.`,
          data: { file: op.target_file, found: false }
        };
      }
    }

    if (!replaceAll && matches.length > 1) {
      const lineNumbers = matches.map(m => m.startLine);
      return {
        success: false,
        error: `[${op.target_file}] Found ${matches.length} matches at lines: ${lineNumbers.join(', ')}. Use replace_all=true or more unique text.`,
        data: { file: op.target_file, matchCount: matches.length, matchLines: lineNumbers }
      };
    }

    if (oldString === newString) {
      return { success: true, data: { file: op.target_file, applied: false, message: 'No change needed (same content)' } };
    }

    // 4. 执行替换
    const matchesToProcess = replaceAll ? matches : [matches[0]];

    const previewLines: string[] = [];
    for (const match of matchesToProcess) {
      previewLines.push(`Line ${match.startLine}: "${this.truncatePreview(oldString)}" → "${this.truncatePreview(newString)}"`);
    }
    const lineNumbers = matchesToProcess.map(m => m.startLine);

    let useDiffService = true;
    {
      const ready = await diffSuggestionService.waitForReady(targetBaseName, 8000);
      if (!ready) { useDiffService = false; }
    }

    if (!useDiffService) {
      let newContent = originalContent;
      const sortedMatches = [...matchesToProcess].sort((a, b) => b.index - a.index);
      for (const match of sortedMatches) {
        newContent = newContent.slice(0, match.index) + newString + newContent.slice(match.index + match.oldContent.length);
      }

      const setResult = await overleafEditor.editor.setDocContent(newContent);
      if (!setResult.success) {
        return { success: false, error: `[${op.target_file}] setDocContent 失败` };
      }

      return {
        success: true,
        data: {
          file: op.target_file,
          applied: true,
          replacedCount: matchesToProcess.length,
          lineNumbers,
          message: `SUCCESS: ${matchesToProcess.length} replacement(s) applied to ${op.target_file}.`,
          preview: previewLines.join('\n')
        }
      };
    } else {
      const suggestionInputs: CreateSegmentSuggestionInput[] = [];
      for (const match of matchesToProcess) {
        suggestionInputs.push({
          toolCallId,
          toolName: 'search_replace',
          targetFile: targetBaseName,
          startOffset: match.index,
          endOffset: match.index + match.oldContent.length,
          oldContent: match.oldContent,
          newContent: newString
        });
      }

      const suggestionIds = await diffSuggestionService.createBatchSegmentSuggestions(suggestionInputs);

      return {
        success: true,
        data: {
          file: op.target_file,
          applied: true,
          suggestionIds,
          replacedCount: matchesToProcess.length,
          lineNumbers,
          message: `SUCCESS: ${suggestionIds.length} replacement(s) applied to ${op.target_file}.`,
          preview: previewLines.join('\n')
        }
      };
    }
  }

  /**
   * 执行搜索替换（支持多文件批量）
   */
  async execute(args: {
    operations?: Array<{
      target_file: string;
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    }>;
    target_file?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
    explanation: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolCallId = `search_replace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const operations = this.normalizeToOperations(args);

      if (operations.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "operations" array or "target_file" with "old_string" and "new_string".',
          duration: Date.now() - startTime
        };
      }

      // 验证
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (!op.target_file) {
          return {
            success: false,
            error: `Operation ${i + 1}: target_file is required.`,
            duration: Date.now() - startTime
          };
        }
        if (!op.old_string || op.old_string.trim() === '') {
          return {
            success: false,
            error: `Operation ${i + 1}: old_string cannot be empty. search_replace requires a non-empty old_string to locate the text to replace. To insert content into an empty file or replace entire lines, use the replace_lines tool instead.`,
            duration: Date.now() - startTime
          };
        }
        if (op.new_string == null) {
          return {
            success: false,
            error: `Operation ${i + 1}: new_string is required (can be empty string to delete text).`,
            duration: Date.now() - startTime
          };
        }
      }

      logger.debug('[SearchReplaceTool] execute called:', {
        operationsCount: operations.length,
        explanation: args.explanation
      });

      // 依次执行每个操作
      const fileResults: Array<{ success: boolean; data?: any; error?: string }> = [];

      for (let i = 0; i < operations.length; i++) {
        logger.debug(`[SearchReplaceTool] Processing operation ${i + 1}/${operations.length}: ${operations[i].target_file}`);
        const result = await this.executeForFile(operations[i], toolCallId);
        fileResults.push(result);
      }

      const successResults = fileResults.filter(r => r.success);
      const errorResults = fileResults.filter(r => !r.success);

      // 单操作时保持原有返回格式
      if (operations.length === 1) {
        const r = fileResults[0];
        return {
          success: r.success,
          data: r.data,
          error: r.error,
          duration: Date.now() - startTime
        };
      }

      // 多操作：汇总结果
      const totalReplaced = successResults.reduce((sum, r) => sum + (r.data?.replacedCount || 0), 0);

      return {
        success: successResults.length > 0,
        data: {
          batchMode: true,
          totalOperations: operations.length,
          successCount: successResults.length,
          errorCount: errorResults.length,
          totalReplaced,
          status: errorResults.length === 0 ? 'SUCCESS_ALL' : 'PARTIAL_SUCCESS',
          message: `${successResults.length}/${operations.length} operation(s) succeeded (${totalReplaced} total replacements).${errorResults.length > 0 ? ` ${errorResults.length} failed.` : ''}`,
          fileResults: fileResults.map(r => r.data || { error: r.error }),
          errors: errorResults.length > 0 ? errorResults.map(r => r.error) : undefined
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
  getSummary(args: any): string {
    const operations = this.normalizeToOperations(args);
    if (operations.length === 0) return '搜索替换';
    if (operations.length === 1) {
      const op = operations[0];
      const mode = op.replace_all ? '(全部替换)' : '';
      return `搜索替换 ${op.target_file} ${mode}: ${args.explanation || ''}`;
    }
    const files = [...new Set(operations.map(o => o.target_file))];
    return `批量搜索替换 ${operations.length} 个操作 (${files.length} 个文件): ${args.explanation || ''}`;
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
   * Wait for file switch to fully complete (bridge + CodeMirror + DiffAPI).
   * See ReplaceLinesTool.waitForFileSwitch for detailed rationale.
   */
  private async waitForFileSwitch(
    targetFileName: string,
    timeoutMs = 5000,
    preSwitchContent: string | null = null
  ): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const current = await this.getCurrentFileName();
      if (current === targetFileName || (current && targetFileName.endsWith(current))) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (preSwitchContent !== null && preSwitchContent.trim().length > 0) {
      const contentDeadline = Date.now() + 3000;
      while (Date.now() < contentDeadline) {
        try {
          const currentContent = await overleafEditor.document.getText();
          if (currentContent !== preSwitchContent) {
            break;
          }
        } catch { /* ignore */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 600));

    const finalName = await this.getCurrentFileName();
    return finalName === targetFileName ||
      (finalName !== null && targetFileName.endsWith(finalName));
  }
}
