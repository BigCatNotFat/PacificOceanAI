/**
 * replace_lines - 行号替换工具
 * 
 * 功能：根据行号范围替换文件内容，支持批量替换多个不连续的区域
 * 类型：write（写操作）
 * 
 * 适用场景：
 * - 替换整段/整节内容
 * - 翻译大段文字
 * - 重写某个 section
 * - 删除多行内容
 * - 一次性修改文件中的多个位置
 * 
 * 应用模式：
 * - 修改直接写入文档，立即可编译
 * - 以 diff 视觉效果展示变更（用户可撤销）
 * - 不阻塞 AI 的后续操作
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { diffSuggestionService } from '../../../editor/DiffSuggestionService';
import type { CreateSuggestionInput } from '../../../../platform/editor/IDiffSuggestionService';

/**
 * 单个替换操作的接口
 */
interface Replacement {
  start_line: number;
  end_line: number;
  new_content: string;
}

/**
 * 行号替换工具
 * 
 * 通过指定起始行号和结束行号来替换内容，支持批量替换多个文件的多个区域
 * 修改直接写入文档（可编译），同时以 diff 视觉效果展示，用户可撤销
 */
export class ReplaceLinesTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'replace_lines',
    description: `Replace content in one or more files by specifying line numbers. Supports batch replacement across multiple files in a single call.

**Batch multi-file mode (recommended):** Provide an \`operations\` array, each item contains: target_file and its replacements array.
**Single file mode (backward compatible):** Provide target_file and replacements directly.

Usage:
1. Use the line numbers from \`read_file\` output (1-indexed).
2. Each replacement contains: start_line, end_line, new_content.
3. To replace a single line, set start_line and end_line to the same value.
4. Multiple replacements will be applied automatically from bottom to top to avoid line number shifts. You do NOT need to worry about shifting line numbers.
5. Changes are applied immediately to the document and are compilable right away. Users can undo individual changes if needed, but this does not block you.

Examples:
- Single file: target_file="main.tex", replacements=[{start_line:207, end_line:218, new_content:"..."}]
- Multi-file batch: operations=[{target_file:"main.tex", replacements:[{start_line:10, end_line:15, new_content:"..."}]}, {target_file:"intro.tex", replacements:[{start_line:1, end_line:5, new_content:"..."}]}]
- Delete lines: replacements=[{start_line:50, end_line:60, new_content:""}]`,

    parameters: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of per-file operations. Each item has target_file and its replacements. Use this for multi-file batch editing.',
          items: {
            type: 'object',
            properties: {
              target_file: {
                type: 'string',
                description: 'The target file to modify.'
              },
              replacements: {
                type: 'array',
                description: 'Array of replacement operations for this file.',
                items: {
                  type: 'object',
                  properties: {
                    start_line: { type: 'number', description: 'Start line number (1-indexed, inclusive).' },
                    end_line: { type: 'number', description: 'End line number (1-indexed, inclusive).' },
                    new_content: { type: 'string', description: 'The new content to replace the specified lines.' }
                  },
                  required: ['start_line', 'end_line', 'new_content']
                }
              }
            },
            required: ['target_file', 'replacements']
          }
        },
        target_file: {
          type: 'string',
          description: '(Single file mode) The target file to modify.'
        },
        replacements: {
          type: 'array',
          description: '(Single file mode) Array of replacement operations.',
          items: {
            type: 'object',
            properties: {
              start_line: { type: 'number', description: 'Start line number (1-indexed, inclusive).' },
              end_line: { type: 'number', description: 'End line number (1-indexed, inclusive).' },
              new_content: { type: 'string', description: 'The new content to replace the specified lines.' }
            },
            required: ['start_line', 'end_line', 'new_content']
          }
        },
        explanation: {
          type: 'string',
          description: 'Brief one-sentence summary of the changes.'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
    modes: ['agent']
  };

  // 预览配置常量
  private readonly MAX_LINES_PREVIEW = 5;   // 每个替换区域最多显示 5 行
  private readonly MAX_LINE_CHARS = 100;    // 每行最多显示 100 字符

  /**
   * 截断单行内容
   */
  private truncateLine(line: string): string {
    if (line.length <= this.MAX_LINE_CHARS) {
      return line;
    }
    return line.slice(0, 50) + '...' + line.slice(-40);
  }

  /**
   * 生成单个替换区域的 Diff 预览（用于日志）
   */
  private generateDiffPreview(
    fileName: string,
    startLine: number,
    endLine: number,
    originalLines: string[],
    newLines: string[]
  ): string {
    const previewLines: string[] = [];
    
    // 1. 使用标签包裹，属性中包含元数据，方便 AI 解析
    previewLines.push(`<diff_chunk file="${fileName}" range="${startLine}-${endLine}">`);

    // Helper to add lines with limit
    const addLines = (lines: string[], prefix: string, startNum: number) => {
        const count = Math.min(lines.length, this.MAX_LINES_PREVIEW);
        for (let i = 0; i < count; i++) {
            const currentLineNum = startNum + i;
            // 2. 使用 [Line N] 格式，让 AI 明确这是行号
            const lineMarker = `[Line ${currentLineNum}]`.padEnd(12);
            const truncated = this.truncateLine(lines[i]);
            previewLines.push(`${prefix} ${lineMarker} ${truncated}`);
        }
        if (lines.length > this.MAX_LINES_PREVIEW) {
            const remaining = lines.length - this.MAX_LINES_PREVIEW;
            previewLines.push(`${prefix} [Line ...]   ... (skipping ${remaining} lines)`);
        }
    };

    // Old content (Red/Minus)
    addLines(originalLines, '-', startLine);

    // New content (Green/Plus)
    addLines(newLines, '+', startLine);

    previewLines.push(`</diff_chunk>`);

    // Summary/Warning
    const deletedCount = originalLines.length;
    const addedCount = newLines.length;
    previewLines.push(`✅ Status: Applied (Deleted: ${deletedCount}, Added: ${addedCount})`);

    return previewLines.join('\n');
  }

  /**
   * 预处理 LaTeX 内容，修正过度转义的反斜杠
   */
  private preprocessLatex(content: string): string {
    const latexCommands = [
      'begin', 'end', 'cite', 'ref', 'label', 'section', 'subsection', 'subsubsection',
      'item', 'textbf', 'textit', 'emph', 'frac', 'sqrt', 'sum', 'int', 'prod',
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'omega',
      'usepackage', 'documentclass', 'title', 'author', 'date', 'maketitle',
      'tableofcontents', 'chapter', 'paragraph', 'newcommand', 'renewcommand',
      'input', 'include', 'bibliography', 'bibliographystyle', 'caption', 'centering',
      'hline', 'toprule', 'midrule', 'bottomrule', 'multicolumn', 'multirow',
      'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'text', 'mathbf', 'mathrm',
      'newline', 'linebreak', 'pagebreak', 'newpage', 'clearpage',
      'footnote', 'marginpar', 'thanks', 'abstract'
    ];
    const latexPattern = new RegExp(`\\\\\\\\(${latexCommands.join('|')})`, 'g');
    return content.replace(latexPattern, '\\$1');
  }

  /**
   * 单个文件操作定义
   */
  private normalizeToOperations(args: any): Array<{ target_file: string; replacements: Replacement[] }> {
    if (Array.isArray(args.operations) && args.operations.length > 0) {
      return args.operations;
    }
    if (args.target_file && Array.isArray(args.replacements)) {
      return [{ target_file: args.target_file, replacements: args.replacements }];
    }
    return [];
  }

  /**
   * 对单个文件执行行号替换
   */
  private async executeForFile(
    targetFile: string,
    replacements: Replacement[],
    toolCallId: string
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    // 验证每个替换操作的行号
    for (let i = 0; i < replacements.length; i++) {
      const r = replacements[i];
      if (r.start_line < 1) {
        return { success: false, error: `[${targetFile}] Replacement ${i + 1}: start_line must be >= 1` };
      }
      if (r.end_line < r.start_line) {
        return { success: false, error: `[${targetFile}] Replacement ${i + 1}: end_line must be >= start_line` };
      }
    }

    // 1. 检查并切换到目标文件
    const currentFileName = await this.getCurrentFileName();
    const targetBaseName = targetFile.split('/').pop() || targetFile;
    const isCurrentFile = currentFileName !== null && (
      currentFileName === targetBaseName ||
      currentFileName === targetFile ||
      targetFile.endsWith(currentFileName)
    );

    if (!isCurrentFile) {

      let preSwitchContent: string | null = null;
      try { preSwitchContent = await overleafEditor.document.getText(); } catch { /* ignore */ }

      const switchResult = await overleafEditor.file.switchFile(targetFile);
      if (!switchResult.success) {
        return { success: false, error: `[${targetFile}] 无法切换到文件: ${switchResult.error}` };
      }

      const switchSuccess = await this.waitForFileSwitch(targetBaseName, 5000, preSwitchContent);
      if (!switchSuccess) {
        return { success: false, error: `[${targetFile}] 文件切换超时` };
      }
    }

    // 2. 获取当前文件内容
    const originalContent = await overleafEditor.document.getText();
    const lines = originalContent.split('\n');
    const totalLines = lines.length;

    // 3. 验证所有行号范围
    for (let i = 0; i < replacements.length; i++) {
      const r = replacements[i];
      if (r.end_line > totalLines) {
        return { success: false, error: `[${targetFile}] Replacement ${i + 1}: Invalid line range ${r.start_line}-${r.end_line}. File has only ${totalLines} lines.` };
      }
    }

    // 4. 准备替换内容并生成预览
    const previewBlocks: string[] = [];
    const processedReplacements: Array<{
      start_line: number;
      end_line: number;
      processedContent: string;
      originalSegment: string[];
    }> = [];

    for (const replacement of replacements) {
      const { start_line, end_line, new_content } = replacement;
      const processedContent = this.preprocessLatex(new_content);
      const startIdx = start_line - 1;
      const endIdx = end_line;
      const originalSegment = lines.slice(startIdx, endIdx);
      const newContentLines = processedContent ? processedContent.split('\n') : [];

      const previewBlock = this.generateDiffPreview(
        targetBaseName, start_line, end_line, originalSegment, newContentLines
      );
      previewBlocks.push(previewBlock);
      processedReplacements.push({ start_line, end_line, processedContent, originalSegment });
    }

    // 5. Choose write strategy
    let useDiffService = true;
    {
      const ready = await diffSuggestionService.waitForReady(targetBaseName, 8000);
      if (!ready) {
        useDiffService = false;
      }
    }

    if (!useDiffService) {
      const newLines = [...lines];
      const sorted = [...processedReplacements].sort((a, b) => b.start_line - a.start_line);
      for (const r of sorted) {
        const newContentLines = r.processedContent ? r.processedContent.split('\n') : [];
        newLines.splice(r.start_line - 1, r.end_line - r.start_line + 1, ...newContentLines);
      }

      const newFullContent = newLines.join('\n');
      const setResult = await overleafEditor.editor.setDocContent(newFullContent);
      if (!setResult.success) {
        return { success: false, error: `[${targetFile}] setDocContent 失败` };
      }

      return {
        success: true,
        data: {
          file: targetFile,
          applied: true,
          status: 'SUCCESS_APPLIED',
          replacementsCount: replacements.length,
          message: `SUCCESS: ${replacements.length} modification(s) applied to ${targetFile}.`,
          preview: previewBlocks.join('\n\n')
        }
      };
    } else {
      const suggestionInputs: CreateSuggestionInput[] = [];
      for (const r of processedReplacements) {
        suggestionInputs.push({
          toolCallId,
          toolName: 'replace_lines',
          targetFile: targetBaseName,
          startLine: r.start_line,
          endLine: r.end_line,
          oldContent: r.originalSegment.join('\n'),
          newContent: r.processedContent
        });
      }

      const suggestionIds = await diffSuggestionService.createBatchSuggestions(suggestionInputs);

      return {
        success: true,
        data: {
          file: targetFile,
          applied: true,
          status: 'SUCCESS_APPLIED',
          suggestionIds,
          replacementsCount: replacements.length,
          message: `SUCCESS: ${suggestionIds.length} modification(s) applied to ${targetFile}.`,
          preview: previewBlocks.join('\n\n')
        }
      };
    }
  }

  /**
   * 执行行号替换（支持多文件批量）
   */
  async execute(args: {
    operations?: Array<{ target_file: string; replacements: Replacement[] }>;
    target_file?: string;
    replacements?: Replacement[];
    explanation: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolCallId = `replace_lines_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const operations = this.normalizeToOperations(args);

      if (operations.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "operations" array or "target_file" with "replacements".',
          duration: Date.now() - startTime
        };
      }

      // 验证所有操作
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (!op.target_file || !Array.isArray(op.replacements) || op.replacements.length === 0) {
          return {
            success: false,
            error: `Operation ${i + 1}: target_file and non-empty replacements array are required.`,
            duration: Date.now() - startTime
          };
        }
      }


      // 依次执行每个文件的操作
      const fileResults: Array<{ success: boolean; data?: any; error?: string }> = [];

      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const result = await this.executeForFile(op.target_file, op.replacements, toolCallId);
        fileResults.push(result);
      }

      const successResults = fileResults.filter(r => r.success);
      const errorResults = fileResults.filter(r => !r.success);

      // 单文件时保持原有返回格式
      if (operations.length === 1) {
        const r = fileResults[0];
        return {
          success: r.success,
          data: r.data,
          error: r.error,
          duration: Date.now() - startTime
        };
      }

      // 多文件：汇总结果
      const totalReplacements = successResults.reduce((sum, r) => sum + (r.data?.replacementsCount || 0), 0);
      const allPreviews = successResults.map(r => r.data?.preview).filter(Boolean).join('\n\n');

      return {
        success: successResults.length > 0,
        data: {
          batchMode: true,
          totalOperations: operations.length,
          successCount: successResults.length,
          errorCount: errorResults.length,
          totalReplacements,
          status: errorResults.length === 0 ? 'SUCCESS_ALL' : 'PARTIAL_SUCCESS',
          message: `${successResults.length}/${operations.length} file(s) modified successfully (${totalReplacements} total replacements).${errorResults.length > 0 ? ` ${errorResults.length} file(s) failed.` : ''}`,
          fileResults: fileResults.map(r => r.data || { error: r.error }),
          errors: errorResults.length > 0 ? errorResults.map(r => r.error) : undefined,
          preview: allPreviews
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
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
    if (operations.length === 0) return '替换文件内容';
    if (operations.length === 1) {
      const op = operations[0];
      const count = op.replacements?.length || 0;
      return `替换 ${op.target_file} 中的 ${count} 处内容: ${args.explanation || ''}`;
    }
    const files = operations.map(o => o.target_file);
    const totalCount = operations.reduce((sum, o) => sum + (o.replacements?.length || 0), 0);
    return `批量替换 ${files.length} 个文件共 ${totalCount} 处内容: ${args.explanation || ''}`;
  }

  /**
   * 获取当前打开的文件名
   */
  private async getCurrentFileName(): Promise<string | null> {
    try {
      const fileInfo = await overleafEditor.file.getInfo();
      return fileInfo.fileName;
    } catch (error) {
      return null;
    }
  }

  /**
   * Wait for the file switch to fully complete.
   *
   * The bridge reports the file name change quickly, but the CodeMirror editor
   * (and thus the DiffAPI) may not have transitioned yet. We use a two-phase
   * approach:
   *   Phase 1 – wait for the bridge to report the correct file name
   *   Phase 2 – wait for the document content to change from the pre-switch
   *             snapshot, indicating that the CodeMirror editor has loaded the
   *             new file. Then add a small stabilisation delay so the DiffAPI
   *             can catch up.
   */
  private async waitForFileSwitch(
    targetFileName: string,
    timeoutMs = 5000,
    preSwitchContent: string | null = null
  ): Promise<boolean> {
    const start = Date.now();

    // Phase 1: wait for the bridge to report the correct file name
    while (Date.now() - start < timeoutMs) {
      const current = await this.getCurrentFileName();
      if (current === targetFileName || (current && targetFileName.endsWith(current))) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Phase 2: wait for the editor content to differ from the pre-switch content.
    // This ensures the CodeMirror view has actually loaded the new document.
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

    // Stabilisation delay: give the DiffAPI time to detect the file switch
    await new Promise(resolve => setTimeout(resolve, 600));

    // Final verification
    const finalName = await this.getCurrentFileName();
    return finalName === targetFileName ||
      (finalName !== null && targetFileName.endsWith(finalName));
  }
}
