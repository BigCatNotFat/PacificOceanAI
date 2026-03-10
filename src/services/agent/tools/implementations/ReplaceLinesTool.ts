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
import { logger } from '../../../../utils/logger';

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
 * 通过指定起始行号和结束行号来替换内容，支持批量替换多个区域
 * 修改直接写入文档（可编译），同时以 diff 视觉效果展示，用户可撤销
 */
export class ReplaceLinesTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'replace_lines',
    description: `Replace content in a file by specifying line numbers. Supports batch replacement of multiple non-contiguous regions in a single call.

Usage:
1. Use the line numbers from \`read_file\` output (1-indexed).
2. Provide a \`replacements\` array, each item contains: start_line, end_line, new_content.
3. To replace a single line, set start_line and end_line to the same value.
4. Multiple replacements will be applied automatically from bottom to top to avoid line number shifts.！！注意不用考虑行号的改变，因为该工具在实现时是从后往前替换的，所以你只需要考虑替换的内容。！！
5. Changes are applied immediately to the document and are compilable right away. Users can undo individual changes if needed, but this does not block you.
Examples:
- Single replacement: replacements=[{start_line:207, end_line:218, new_content:"..."}]
- Multiple replacements: replacements=[{start_line:10, end_line:15, new_content:"..."}, {start_line:50, end_line:55, new_content:"..."}]
- Delete lines: replacements=[{start_line:50, end_line:60, new_content:""}]`,

    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The target file to modify.'
        },
        replacements: {
          type: 'array',
          description: 'Array of replacement operations. Each item has start_line, end_line, and new_content.',
          items: {
            type: 'object',
            properties: {
              start_line: {
                type: 'number',
                description: 'Start line number (1-indexed, inclusive).'
              },
              end_line: {
                type: 'number',
                description: 'End line number (1-indexed, inclusive).'
              },
              new_content: {
                type: 'string',
                description: 'The new content to replace the specified lines. Can be multiple lines. Use empty string to delete lines.'
              }
            },
            required: ['start_line', 'end_line', 'new_content']
          }
        },
        explanation: {
          type: 'string',
          description: 'Brief one-sentence summary of the changes.'
        }
      },
      required: ['target_file', 'replacements', 'explanation']
    },
    needApproval: false, // 使用新的 diff 建议机制，不使用旧的审批流程
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
   * 执行行号替换（支持批量）
   * 
   * 创建 diff 建议而不是直接修改，用户可以选择接受或拒绝
   */
  async execute(args: {
    target_file: string;
    replacements: Replacement[];
    explanation: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    // 生成一个工具调用 ID
    const toolCallId = `replace_lines_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.debug('[ReplaceLinesTool] execute called with:', {
        target_file: args.target_file,
        replacements_count: args.replacements?.length,
        explanation: args.explanation
      });

      // 参数验证
      if (!args.target_file || !args.replacements || !args.explanation) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, replacements, or explanation',
          duration: Date.now() - startTime
        };
      }

      if (!Array.isArray(args.replacements) || args.replacements.length === 0) {
        return {
          success: false,
          error: 'replacements must be a non-empty array',
          duration: Date.now() - startTime
        };
      }

      // 验证每个替换操作的行号
      for (let i = 0; i < args.replacements.length; i++) {
        const r = args.replacements[i];
        if (r.start_line < 1) {
          return {
            success: false,
            error: `Replacement ${i + 1}: start_line must be >= 1`,
            duration: Date.now() - startTime
          };
        }
        if (r.end_line < r.start_line) {
          return {
            success: false,
            error: `Replacement ${i + 1}: end_line must be >= start_line`,
            duration: Date.now() - startTime
          };
        }
      }

      // 1. 检查并切换到目标文件
      const currentFileName = await this.getCurrentFileName();
      const targetBaseName = args.target_file.split('/').pop() || args.target_file;
      const isCurrentFile = currentFileName !== null && (
        currentFileName === targetBaseName ||
        currentFileName === args.target_file ||
        args.target_file.endsWith(currentFileName)
      );

      logger.debug('[ReplaceLinesTool] Current file:', currentFileName, 'Target:', targetBaseName, 'Is current:', isCurrentFile);

      if (!isCurrentFile) {
        logger.debug(`[ReplaceLinesTool] Switching to file "${targetBaseName}"...`);

        // Capture pre-switch content so we can detect when the editor has truly loaded the new file
        let preSwitchContent: string | null = null;
        try { preSwitchContent = await overleafEditor.document.getText(); } catch { /* ignore */ }

        const switchResult = await overleafEditor.file.switchFile(targetBaseName);

        if (!switchResult.success) {
          return {
            success: false,
            error: `无法切换到文件 "${args.target_file}": ${switchResult.error}`,
            duration: Date.now() - startTime
          };
        }

        // Wait for file switch to fully complete (including CodeMirror + DiffAPI)
        const switchSuccess = await this.waitForFileSwitch(targetBaseName, 5000, preSwitchContent);
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
      const lines = originalContent.split('\n');
      const totalLines = lines.length;

      // 3. 验证所有行号范围
      for (let i = 0; i < args.replacements.length; i++) {
        const r = args.replacements[i];
        if (r.end_line > totalLines) {
          return {
            success: false,
            error: `Replacement ${i + 1}: Invalid line range ${r.start_line}-${r.end_line}. File has only ${totalLines} lines.`,
            duration: Date.now() - startTime
          };
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

      for (const replacement of args.replacements) {
        const { start_line, end_line, new_content } = replacement;
        
        const processedContent = this.preprocessLatex(new_content);
        
        const startIdx = start_line - 1;
        const endIdx = end_line;
        const originalSegment = lines.slice(startIdx, endIdx);
        
        const newContentLines = processedContent ? processedContent.split('\n') : [];
        
        const previewBlock = this.generateDiffPreview(
            targetBaseName,
            start_line,
            end_line,
            originalSegment,
            newContentLines
        );
        previewBlocks.push(previewBlock);

        processedReplacements.push({
          start_line,
          end_line,
          processedContent,
          originalSegment
        });

        logger.debug(`[ReplaceLinesTool] Prepared replacement for lines ${start_line}-${end_line}`);
      }

      // 5. Choose write strategy.
      //
      // Always try to use DiffSuggestionService for the diff UI. But first
      // wait for the DiffAPI to be ready (it sends DIFF_READY / DIFF_PONG).
      // If it's not ready within the timeout, fall back to setDocContent.
      //
      // When we had to switch files we skip the wait entirely (the DiffAPI
      // is definitely not tracking the right file yet).

      let useDiffService = isCurrentFile;

      if (useDiffService) {
        const ready = await diffSuggestionService.waitForReady(targetBaseName, 8000);
        if (!ready) {
          logger.debug('[ReplaceLinesTool] DiffAPI not ready in time – falling back to setDocContent');
          useDiffService = false;
        }
      }

      let resultData: Record<string, any>;

      if (!useDiffService) {
        logger.debug(`[ReplaceLinesTool] Using direct setDocContent (switched=${!isCurrentFile})`);

        const newLines = [...lines];
        const sorted = [...processedReplacements].sort((a, b) => b.start_line - a.start_line);
        for (const r of sorted) {
          const newContentLines = r.processedContent ? r.processedContent.split('\n') : [];
          newLines.splice(r.start_line - 1, r.end_line - r.start_line + 1, ...newContentLines);
        }

        const newFullContent = newLines.join('\n');
        const setResult = await overleafEditor.editor.setDocContent(newFullContent);

        if (!setResult.success) {
          return {
            success: false,
            error: '无法将修改应用到编辑器（setDocContent 失败）',
            duration: Date.now() - startTime
          };
        }

        const finalPreview = "📝 修改已直接应用:\n" + previewBlocks.join('\n\n');
        resultData = {
          file: args.target_file,
          applied: true,
          status: 'SUCCESS_APPLIED',
          message: `SUCCESS: ${args.replacements.length} modification(s) applied to the document. The changes are now live and compilable. You may proceed with next steps.`,
          replacementsCount: args.replacements.length,
          preview: finalPreview
        };
      } else {
        // File is already open – use DiffSuggestionService for diff UI
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

        logger.debug('[ReplaceLinesTool] Creating diff suggestions...');
        const suggestionIds = await diffSuggestionService.createBatchSuggestions(suggestionInputs);
        logger.debug(`[ReplaceLinesTool] Created ${suggestionIds.length} diff suggestions:`, suggestionIds);

        const finalPreview = "📝 修改已应用（用户可撤销）:\n" + previewBlocks.join('\n\n');
        resultData = {
          file: args.target_file,
          applied: true,
          status: 'SUCCESS_APPLIED',
          message: `SUCCESS: ${suggestionIds.length} modification(s) applied to the document. The changes are now live and compilable. User can undo individual changes if needed. You may proceed with next steps (e.g. compile to verify).`,
          suggestionIds,
          replacementsCount: args.replacements.length,
          preview: finalPreview
        };
      }

      return {
        success: true,
        data: resultData,
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error('[ReplaceLinesTool] Error:', error);
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
    replacements: Replacement[];
    explanation: string;
  }): string {
    const count = args.replacements?.length || 0;
    return `替换 ${args.target_file} 中的 ${count} 处内容: ${args.explanation}`;
  }

  /**
   * 获取当前打开的文件名
   */
  private async getCurrentFileName(): Promise<string | null> {
    try {
      const fileInfo = await overleafEditor.file.getInfo();
      return fileInfo.fileName;
    } catch (error) {
      console.error('[ReplaceLinesTool] Failed to get current file name:', error);
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
