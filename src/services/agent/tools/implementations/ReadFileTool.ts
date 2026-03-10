/**
 * read_file - 读取文件工具
 * 
 * 功能：读取文件内容，支持指定行范围
 * 类型：read（只读操作，不需要用户审批）
 * 
 * 通过 OverleafBridge 访问 Overleaf 编辑器的内部 API 获取真实文件内容
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import type { ReadLinesResult } from '../../../editor/bridge';
import { recentlyCreatedFiles } from '../utils/RecentlyCreatedFilesRegistry';

/**
 * 读取文件工具
 * 
 * 支持一次性读取多个文件的多段内容
 * 通过 reads 数组参数批量指定要读取的文件和行范围
 */
export class ReadFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'read_file',
    description: `Read the contents of one or more files in the Overleaf project. Supports batch reading of multiple files and multiple line ranges in a single call.
Note that each read segment can view at most 300 lines at a time for performance reasons.

**Batch mode (recommended):** Provide a \`reads\` array to read multiple files/ranges in one call. Each item specifies a target_file and line range.
**Single mode (backward compatible):** Provide target_file, start_line_one_indexed, end_line_one_indexed_inclusive directly.

Each time you call this tool, you should:
1) If you do not sure which lines to read, read the entire file at once.
2) Trust the content that you read before fully. Unless you can sure the content that you read before has been changed, do not read the same content again.
3) When you need to read multiple files or multiple ranges, use the \`reads\` array to batch them in ONE call.

Example (batch): reads=[{target_file:"main.tex", start_line_one_indexed:1, end_line_one_indexed_inclusive:50}, {target_file:"intro.tex", start_line_one_indexed:1, end_line_one_indexed_inclusive:100}]
Example (single): target_file="main.tex", start_line_one_indexed=1, end_line_one_indexed_inclusive=50
`,

    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        reads: {
          type: 'array',
          description: 'Array of read operations. Each item specifies a file and line range to read. Use this for batch reading.',
          items: {
            type: 'object',
            properties: {
              target_file: {
                type: 'string',
                description: 'The path of the file to read.'
              },
              start_line_one_indexed: {
                type: 'integer',
                description: 'The one-indexed line number to start reading from (inclusive).'
              },
              end_line_one_indexed_inclusive: {
                type: 'integer',
                description: 'The one-indexed line number to end reading at (inclusive).'
              }
            },
            required: ['target_file', 'start_line_one_indexed', 'end_line_one_indexed_inclusive']
          }
        },
        target_file: {
          type: 'string',
          description: '(Single mode) The path of the file to read.'
        },
        start_line_one_indexed: {
          type: 'integer',
          description: '(Single mode) The one-indexed line number to start reading from (inclusive).'
        },
        end_line_one_indexed_inclusive: {
          type: 'integer',
          description: '(Single mode) The one-indexed line number to end reading at (inclusive).'
        }
      },
      required: ['explanation']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  // 最大单次读取行数
  private readonly MAX_LINES_PER_READ = 300;
  // 最大字符数限制
  private readonly MAX_CHARACTERS = 50000;

  /**
   * 将参数标准化为 reads 数组（兼容单文件和批量模式）
   */
  private normalizeToReads(args: any): Array<{
    target_file: string;
    start_line_one_indexed: number;
    end_line_one_indexed_inclusive: number;
  }> {
    if (Array.isArray(args.reads) && args.reads.length > 0) {
      return args.reads;
    }
    if (args.target_file) {
      return [{
        target_file: args.target_file,
        start_line_one_indexed: args.start_line_one_indexed,
        end_line_one_indexed_inclusive: args.end_line_one_indexed_inclusive
      }];
    }
    return [];
  }

  /**
   * 执行读取文件（支持批量）
   */
  async execute(args: {
    reads?: Array<{
      target_file: string;
      start_line_one_indexed: number;
      end_line_one_indexed_inclusive: number;
    }>;
    target_file?: string;
    start_line_one_indexed?: number;
    end_line_one_indexed_inclusive?: number;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const reads = this.normalizeToReads(args);

      if (reads.length === 0) {
        return {
          success: false,
          error: 'Missing required parameters: provide either "reads" array or "target_file" with line range.',
          duration: Date.now() - startTime
        };
      }

      // 验证每个读取操作的参数
      for (let i = 0; i < reads.length; i++) {
        const r = reads[i];
        if (!r.target_file || r.start_line_one_indexed == null || r.end_line_one_indexed_inclusive == null) {
          return {
            success: false,
            error: `Read operation ${i + 1}: missing target_file, start_line_one_indexed, or end_line_one_indexed_inclusive.`,
            duration: Date.now() - startTime
          };
        }
      }

      console.log('[ReadFileTool] execute 开始, 共', reads.length, '个读取操作');

      const results: ReadFileResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < reads.length; i++) {
        const readOp = reads[i];
        try {
          console.log(`[ReadFileTool] 读取操作 ${i + 1}/${reads.length}:`, {
            target_file: readOp.target_file,
            start: readOp.start_line_one_indexed,
            end: readOp.end_line_one_indexed_inclusive
          });

          const docId = await this.getDocIdByPath(readOp.target_file);
          if (!docId) {
            errors.push(`[${readOp.target_file}] 无法找到文件的文档 ID`);
            continue;
          }

          const result = await this.readLineRange(
            readOp.target_file,
            docId,
            readOp.start_line_one_indexed,
            readOp.end_line_one_indexed_inclusive
          );
          results.push(result);

          console.log(`[ReadFileTool] 读取操作 ${i + 1} 完成:`, {
            totalLines: result.totalLines,
            readLines: result.readLines,
            truncated: result.truncated
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`[${readOp.target_file}] ${msg}`);
          console.error(`[ReadFileTool] 读取操作 ${i + 1} 失败:`, error);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return {
          success: false,
          error: `All read operations failed:\n${errors.join('\n')}`,
          duration: Date.now() - startTime
        };
      }

      // 单个操作时保持原有返回格式
      if (reads.length === 1 && results.length === 1) {
        return {
          success: true,
          data: results[0],
          duration: Date.now() - startTime
        };
      }

      // 批量操作：合并所有结果的 content
      const combinedContent = results.map(r => r.content).join('\n\n');
      const totalReadLines = results.reduce((sum, r) => sum + (r.readLines || 0), 0);
      const totalReadChars = results.reduce((sum, r) => sum + (r.readCharacters || 0), 0);

      return {
        success: true,
        data: {
          batchMode: true,
          totalOperations: reads.length,
          successCount: results.length,
          errorCount: errors.length,
          totalReadLines,
          totalReadCharacters: totalReadChars,
          content: combinedContent,
          results,
          errors: errors.length > 0 ? errors : undefined,
          message: `Successfully read ${results.length}/${reads.length} file segments (${totalReadLines} lines, ${totalReadChars} characters)${errors.length > 0 ? `. ${errors.length} failed.` : ''}`
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error('[ReadFileTool] execute 异常', error);
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 读取指定行范围
   */
  private async readLineRange(
    targetFile: string,
    docId: string,
    startLine: number,
    endLine: number
  ): Promise<ReadFileResult> {
    // 先获取整个文件以得到总行数
    console.log('[ReadFileTool] getDocContent (full) 开始, docId:', docId);
    const fullContent = await overleafEditor.document.getDocContent(docId);
    console.log('[ReadFileTool] getDocContent (full) 完成, 内容长度:', fullContent?.length, '前100字符:', fullContent?.substring(0, 100));
    const totalLines = fullContent.split('\n').length;

    // 限制单次读取行数
    const requestedLines = endLine - startLine + 1;
    if (requestedLines > this.MAX_LINES_PER_READ) {
      this.log(`请求行数 ${requestedLines} 超过限制 ${this.MAX_LINES_PER_READ}，将截断`);
      endLine = startLine + this.MAX_LINES_PER_READ - 1;
    }

    this.log(`读取行范围: ${startLine} - ${endLine}`);

    const rangeContent = await overleafEditor.document.getDocContent(docId, startLine, endLine);
    const rangeLines = rangeContent.split('\n').map((text, index) => ({
      lineNumber: startLine + index,
      text
    }));
    
    const { lines: truncatedLines, truncated, truncatedAtLine } = this.truncateByCharacters(rangeLines);
    
    const linesContent = this.formatLinesWithNumbers(truncatedLines);
    const formattedContent = this.wrapContentAsXml(targetFile, linesContent);
    
    const readCharacters = truncatedLines.reduce((sum, line) => sum + line.text.length + 1, 0);
    
    const actualEndLine = truncated
      ? truncatedAtLine!
      : (rangeLines.length > 0 ? rangeLines[rangeLines.length - 1].lineNumber : startLine - 1);
    
    const resultForSummary: ReadLinesResult = {
      lines: truncatedLines,
      totalLines,
      startLine,
      endLine: actualEndLine,
      hasMoreBefore: startLine > 1,
      hasMoreAfter: actualEndLine < totalLines
    };
    const summary = this.generateSummaryFromResult(resultForSummary, totalLines);
    
    let message = `Successfully read lines ${startLine}-${actualEndLine} of ${totalLines} (${readCharacters} characters)`;
    if (truncated) {
      message += ` [TRUNCATED at line ${truncatedAtLine} due to ${this.MAX_CHARACTERS} character limit]`;
    }
    
    return {
      file: targetFile,
      totalLines,
      readLines: actualEndLine - startLine + 1,
      readCharacters,
      startLine,
      endLine: actualEndLine,
      content: formattedContent,
      summary,
      hasMoreBefore: resultForSummary.hasMoreBefore,
      hasMoreAfter: truncated ? true : resultForSummary.hasMoreAfter,
      truncated,
      truncatedAtLine,
      message
    };
  }

  /**
   * 按字符数截断内容
   */
  private truncateByCharacters(lines: Array<{ lineNumber: number; text: string }>): {
    lines: Array<{ lineNumber: number; text: string }>;
    truncated: boolean;
    truncatedAtLine?: number;
  } {
    let charCount = 0;
    const truncatedLines: Array<{ lineNumber: number; text: string }> = [];
    
    for (const line of lines) {
      const lineLength = line.text.length + 1; // +1 for newline
      if (charCount + lineLength > this.MAX_CHARACTERS) {
        // 超过限制，截断
        this.log(`字符数 ${charCount + lineLength} 超过限制 ${this.MAX_CHARACTERS}，在第 ${line.lineNumber} 行截断`);
        return {
          lines: truncatedLines,
          truncated: true,
          truncatedAtLine: truncatedLines.length > 0 ? truncatedLines[truncatedLines.length - 1].lineNumber : line.lineNumber - 1
        };
      }
      charCount += lineLength;
      truncatedLines.push(line);
    }
    
    return { lines: truncatedLines, truncated: false };
  }

  private getDomFileIdMap(): Map<string, string> {
    const map = new Map<string, string>();

    try {
      // 方式 1: 从文件树 treeitem 获取（Overleaf 官网结构）
      const treeItems = document.querySelectorAll('li[role="treeitem"][aria-label]');
      treeItems.forEach((item) => {
        const name = item.getAttribute('aria-label');
        if (!name) return;
        const entity = item.querySelector('.entity') as HTMLElement | null;
        const id = entity?.getAttribute('data-file-id');
        if (id) map.set(name, id);
      });

      // 方式 2: 直接查 [data-file-id] 元素（自建实例可能用此结构）
      if (map.size === 0) {
        const fileItems = document.querySelectorAll('[data-file-id]');
        fileItems.forEach((item) => {
          const el = item as HTMLElement;
          const id = el.getAttribute('data-file-id');
          if (!id) return;
          const nameSpan = el.querySelector('.item-name-button span') as HTMLElement | null;
          const name = nameSpan?.textContent?.trim();
          if (!name) return;
          map.set(name, id);
        });
      }
    } catch (error) {
      console.error('[ReadFileTool] 获取 DOM 文件 ID 映射失败:', error);
    }

    return map;
  }

  /**
   * 根据文件路径查找对应的 docId
   * 优先从文件树 API 获取，fallback 到 DOM，再 fallback 到 recently-created registry。
   * 如果文件刚刚创建，会重试几次以等待 Overleaf 同步。
   */
  private async getDocIdByPath(targetFile: string): Promise<string | null> {
    const normalizedPath = targetFile.startsWith('/') ? targetFile : `/${targetFile}`;
    const baseName = targetFile.split('/').pop() || targetFile;

    console.log('[ReadFileTool] getDocIdByPath', { targetFile, normalizedPath, baseName });

    // 策略 1: 从 DOM 文件树获取（最可靠，官网和自建都有 data-file-id）
    const domMap = this.getDomFileIdMap();
    console.log('[ReadFileTool] DOM 文件映射:', Object.fromEntries(domMap));
    const domId = domMap.get(baseName);
    if (domId) {
      console.log('[ReadFileTool] 从 DOM 找到 docId:', domId);
      return domId;
    }

    // 策略 2: 从 REST API 文件树获取（自建实例可能返回 ID）
    try {
      const fileTree = await overleafEditor.project.getFileTree();
      for (const entity of fileTree.entities) {
        const entityAny = entity as any;
        const id = entity.id ?? entity._id ?? entityAny.doc_id ?? entityAny.docId;
        if (!id) continue;
        if (entity.path === normalizedPath || entity.path.split('/').pop() === baseName) {
          console.log('[ReadFileTool] 从 REST API 找到 docId:', id);
          return id;
        }
      }
    } catch (error) {
      console.warn('[ReadFileTool] REST API 文件树获取失败:', error);
    }

    // 策略 3: 从 Overleaf Store 获取当前打开文件的 ID
    try {
      const currentFile = await overleafEditor.file.getInfo();
      console.log('[ReadFileTool] 当前打开文件:', currentFile);
      if (currentFile && (currentFile as any).fileName === baseName && (currentFile as any).fileId) {
        console.log('[ReadFileTool] 从当前文件匹配到 docId:', (currentFile as any).fileId);
        return (currentFile as any).fileId;
      }
    } catch (error) {
      console.warn('[ReadFileTool] 获取当前文件信息失败:', error);
    }

    // 策略 4: 从 recently-created-files registry 获取
    const recentEntry = recentlyCreatedFiles.findByPath(targetFile);
    if (recentEntry) {
      console.log('[ReadFileTool] 从 recently-created registry 找到 docId:', recentEntry.id);
      return recentEntry.id;
    }

    // 策略 5: 如果上面都没找到，可能是文件刚创建但还没同步。
    // 等待一段时间后重试 DOM + REST API。
    console.log('[ReadFileTool] 未立即找到 docId，等待后重试...');
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, 1000));

      const retryDomMap = this.getDomFileIdMap();
      const retryId = retryDomMap.get(baseName);
      if (retryId) {
        console.log(`[ReadFileTool] 重试 ${attempt + 1}: 从 DOM 找到 docId:`, retryId);
        return retryId;
      }

      try {
        const fileTree = await overleafEditor.project.getFileTree();
        for (const entity of fileTree.entities) {
          const entityAny = entity as any;
          const id = entity.id ?? entity._id ?? entityAny.doc_id ?? entityAny.docId;
          if (!id) continue;
          if (entity.path === normalizedPath || entity.path.split('/').pop() === baseName) {
            console.log(`[ReadFileTool] 重试 ${attempt + 1}: 从 REST API 找到 docId:`, id);
            return id;
          }
        }
      } catch { /* ignore */ }
    }

    console.error('[ReadFileTool] 所有策略均未找到 docId', { targetFile });
    return null;
  }

  private generateSummaryFromResult(result: ReadLinesResult, totalLines: number): string {
    // 移除 "Lines not shown" 的提示，避免 Agent 误以为丢失上下文
    // 用户反馈该提示会导致 Agent 反复读取已有的文件内容
    return '';
  }

  /**
   * 格式化行内容（带行号）
   */
  private formatLinesWithNumbers(lines: Array<{ lineNumber: number; text: string }>): string {
    return lines
      .map(line => `[Line ${line.lineNumber}] ${line.text}`)
      .join('\n');
  }

  /**
   * 将内容包装为 XML 格式
   */
  private wrapContentAsXml(fileName: string, content: string): string {
    return `<file name="${fileName}">\n${content}\n</file>`;
  }


  /**
   * 生成摘要
   */
  getSummary(args: any): string {
    const reads = this.normalizeToReads(args);
    if (reads.length === 0) return '读取文件';
    if (reads.length === 1) {
      const r = reads[0];
      return `读取文件 ${r.target_file} 的第 ${r.start_line_one_indexed} - ${r.end_line_one_indexed_inclusive} 行`;
    }
    const files = [...new Set(reads.map(r => r.target_file))];
    return `批量读取 ${reads.length} 个片段 (${files.length} 个文件: ${files.join(', ')})`;
  }
}

/**
 * 读取文件结果类型
 */
interface ReadFileResult {
  file: string;
  totalLines: number;
  totalCharacters?: number;  // 整个文件的字符数（仅读取整个文件时）
  readLines?: number;        // 当前读取的行数（仅读取范围时）
  readCharacters?: number;   // 当前读取的字符数（仅读取范围时）
  startLine: number;
  endLine: number;
  content: string;
  rawContent?: string;
  summary?: string;
  hasMoreBefore?: boolean;
  hasMoreAfter?: boolean;
  truncated?: boolean;       // 是否因字符数限制被截断
  truncatedAtLine?: number;  // 截断发生在哪一行
  message: string;
}
