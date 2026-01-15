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

/**
 * 读取文件工具
 * 
 * 支持读取 Overleaf 项目中的任意文档文件
 * 通过 target_file 参数指定要读取的文件路径
 */
export class ReadFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'read_file',
    description: `Read the contents of a file in the Overleaf project. The output will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside that range.
Note that this call can view at most 300 lines at a time for performance reasons.
Each time you call this tool, you should:
1) if you do not sure which lines to read, read the entire file at once.
2) Trust the content that you read before fully. Unless you can sure the content that you read before has been changed, do not read the same content again.
`,

    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        target_file: {
          type: 'string',
          description: 'The path of the file to read. Currently reads the active file in Overleaf editor.'
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
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  // 最大单次读取行数
  private readonly MAX_LINES_PER_READ = 300;
  // 最大字符数限制
  private readonly MAX_CHARACTERS = 50000;

  /**
   * 执行读取文件
   */
  async execute(args: {
    target_file: string;
    start_line_one_indexed: number;
    end_line_one_indexed_inclusive: number;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, start_line_one_indexed, end_line_one_indexed_inclusive',
          duration: Date.now() - startTime
        };
      }

      this.log(`读取文件: ${args.target_file}`);

      // 根据 target_file 查找对应的 docId
      const docId = await this.getDocIdByPath(args.target_file);
      if (!docId) {
        return {
          success: false,
          error: `无法找到文件 "${args.target_file}" 的文档 ID。请确保文件路径正确，且文件存在于项目中。`,
          duration: Date.now() - startTime
        };
      }

      this.log(`找到文档 ID: ${docId}`);

      let result: ReadFileResult;

      // 读取指定行范围
      result = await this.readLineRange(
        args.target_file,
        docId,
        args.start_line_one_indexed,
        args.end_line_one_indexed_inclusive
      );

      return {
        success: true,
        data: result,
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
   * 读取指定行范围
   */
  private async readLineRange(
    targetFile: string,
    docId: string,
    startLine: number,
    endLine: number
  ): Promise<ReadFileResult> {
    // 先获取整个文件以得到总行数
    const fullContent = await overleafEditor.document.getDocContent(docId);
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
    
    const formattedContent = this.formatLinesWithNumbers(truncatedLines);
    
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
    } catch (error) {
      console.error('[ReadFileTool] 获取 DOM 文件 ID 映射失败:', error);
    }

    return map;
  }

  /**
   * 根据文件路径查找对应的 docId
   * 优先从文件树 API 获取，fallback 到 DOM
   */
  private async getDocIdByPath(targetFile: string): Promise<string | null> {
    // 规范化路径
    const normalizedPath = targetFile.startsWith('/') ? targetFile : `/${targetFile}`;
    const baseName = targetFile.split('/').pop() || targetFile;

    try {
      // 优先从文件树 API 获取
      const fileTree = await overleafEditor.project.getFileTree();
      for (const entity of fileTree.entities) {
        // 完整路径匹配
        if (entity.path === normalizedPath) {
          const id = entity.id ?? entity._id;
          if (id) return id;
        }
        // 文件名匹配（fallback）
        const entityBaseName = entity.path.split('/').pop();
        if (entityBaseName === baseName) {
          const id = entity.id ?? entity._id;
          if (id) return id;
        }
      }
    } catch (error) {
      this.log(`从文件树获取 docId 失败: ${error}`);
    }

    // Fallback: 从 DOM 获取
    const domMap = this.getDomFileIdMap();
    return domMap.get(baseName) ?? null;
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
    // 计算行号的最大宽度
    const maxLineNum = lines.length > 0 ? lines[lines.length - 1].lineNumber : 0;
    const lineNumWidth = String(maxLineNum).length;
    
    return lines
      .map(line => {
        const paddedNum = String(line.lineNumber).padStart(lineNumWidth, ' ');
        return `${paddedNum} | ${line.text}`;
      })
      .join('\n');
  }


  /**
   * 生成摘要
   */
  getSummary(args: {
    target_file: string;
    start_line_one_indexed: number;
    end_line_one_indexed_inclusive: number;
  }): string {
    return `读取文件 ${args.target_file} 的第 ${args.start_line_one_indexed} - ${args.end_line_one_indexed_inclusive} 行`;
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
