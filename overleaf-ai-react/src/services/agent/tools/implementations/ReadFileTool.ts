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
import type { ReadLinesResult, FileInfo } from '../../../editor/bridge';

/**
 * 读取文件工具
 * 
 * 注意：当前实现只能读取 Overleaf 编辑器中当前打开的文件
 * target_file 参数目前用于记录和显示，实际读取的是当前活动文件
 */
export class ReadFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'read_file',
    description: `Read the contents of the current file in Overleaf editor. The output will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside that range.
Note that this call can view at most 20 lines at a time for performance reasons.

When using this tool to gather information, it's your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should:
1) Assess if the contents you viewed are sufficient to proceed with your task.
2) Take note of where there are lines not shown.
3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.
4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.

In some cases, if reading a range of lines is not enough, you may choose to read the entire file.
Reading entire files is often wasteful and slow, especially for large files (i.e. more than a few hundred lines). So you should use this option sparingly！！！`,
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
        should_read_entire_file: {
          type: 'boolean',
          description: 'Whether to read the entire file. Defaults to false. be careful when using this option sparingly！！！'
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
      required: ['target_file', 'should_read_entire_file', 'start_line_one_indexed', 'end_line_one_indexed_inclusive']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  // 最大单次读取行数
  private readonly MAX_LINES_PER_READ = 20;
  // 最大字符数限制
  private readonly MAX_CHARACTERS = 50000;

  /**
   * 执行读取文件
   */
  async execute(args: {
    target_file: string;
    should_read_entire_file: boolean;
    start_line_one_indexed: number;
    end_line_one_indexed_inclusive: number;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, should_read_entire_file, start_line_one_indexed, end_line_one_indexed_inclusive',
          duration: Date.now() - startTime
        };
      }

      this.log(`读取文件: ${args.target_file}`);

      // 首先检查编辑器是否可用
      const isAvailable = await overleafEditor.editor.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: 'Overleaf editor is not available. Please make sure you have a file open in the editor.',
          duration: Date.now() - startTime
        };
      }

      // 获取文件信息
      const fileInfo = await overleafEditor.file.getInfo();
      this.log(`文件信息: ${fileInfo.fileName}, 总行数: ${fileInfo.totalLines}`);

      let result: ReadFileResult;

      if (args.should_read_entire_file) {
        // 读取整个文件
        result = await this.readEntireFile(fileInfo);
      } else {
        // 读取指定行范围
        result = await this.readLineRange(
          args.start_line_one_indexed,
          args.end_line_one_indexed_inclusive,
          fileInfo
        );
      }

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
   * 读取整个文件
   */
  private async readEntireFile(fileInfo: FileInfo): Promise<ReadFileResult> {
    this.log('读取整个文件');
    
    const result = await overleafEditor.document.readEntireFile();
    
    const totalCharacters = result.content.length;
    
    // 检查是否需要截断
    const { lines: truncatedLines, truncated, truncatedAtLine } = this.truncateByCharacters(result.lines);
    
    // 格式化输出
    const formattedContent = this.formatLinesWithNumbers(truncatedLines);
    const displayedCharacters = truncatedLines.reduce((sum, line) => sum + line.text.length + 1, 0);
    
    const actualEndLine = truncated ? truncatedAtLine! : result.totalLines;
    let message = `Successfully read entire file (${result.totalLines} lines, ${totalCharacters} characters)`;
    if (truncated) {
      message += ` [TRUNCATED at line ${truncatedAtLine} due to ${this.MAX_CHARACTERS} character limit, showing ${displayedCharacters} characters]`;
    }
    
    return {
      file: fileInfo.fileName || 'current file',
      totalLines: result.totalLines,
      totalCharacters,
      startLine: 1,
      endLine: actualEndLine,
      content: formattedContent,
      rawContent: truncated ? undefined : result.content,
      truncated,
      truncatedAtLine,
      message
    };
  }

  /**
   * 读取指定行范围
   */
  private async readLineRange(
    startLine: number,
    endLine: number,
    fileInfo: FileInfo
  ): Promise<ReadFileResult> {
    // 限制单次读取行数
    const requestedLines = endLine - startLine + 1;
    if (requestedLines > this.MAX_LINES_PER_READ) {
      this.log(`请求行数 ${requestedLines} 超过限制 ${this.MAX_LINES_PER_READ}，将截断`);
      endLine = startLine + this.MAX_LINES_PER_READ - 1;
    }

    this.log(`读取行范围: ${startLine} - ${endLine}`);
    
    const result = await overleafEditor.document.readLines(startLine, endLine);
    
    // 检查是否需要截断
    const { lines: truncatedLines, truncated, truncatedAtLine } = this.truncateByCharacters(result.lines);
    
    // 格式化输出
    const formattedContent = this.formatLinesWithNumbers(truncatedLines);
    
    // 计算当前读取内容的字符数
    const readCharacters = truncatedLines.reduce((sum, line) => sum + line.text.length + 1, 0); // +1 for newline
    
    const actualEndLine = truncated ? truncatedAtLine! : result.endLine;
    
    // 生成摘要信息（使用实际结束行）
    const modifiedResult = { ...result, endLine: actualEndLine };
    const summary = this.generateSummary(modifiedResult, fileInfo);
    
    let message = `Successfully read lines ${result.startLine}-${actualEndLine} of ${result.totalLines} (${readCharacters} characters)`;
    if (truncated) {
      message += ` [TRUNCATED at line ${truncatedAtLine} due to ${this.MAX_CHARACTERS} character limit]`;
    }
    
    return {
      file: fileInfo.fileName || 'current file',
      totalLines: result.totalLines,
      readLines: actualEndLine - result.startLine + 1,
      readCharacters,
      startLine: result.startLine,
      endLine: actualEndLine,
      content: formattedContent,
      summary,
      hasMoreBefore: result.hasMoreBefore,
      hasMoreAfter: truncated ? true : result.hasMoreAfter,
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
   * 生成范围外内容的摘要
   */
  private generateSummary(result: ReadLinesResult, fileInfo: FileInfo): string {
    const parts: string[] = [];
    
    if (result.hasMoreBefore) {
      parts.push(`Lines 1-${result.startLine - 1} not shown (${result.startLine - 1} lines before)`);
    }
    
    if (result.hasMoreAfter) {
      const linesAfter = result.totalLines - result.endLine;
      parts.push(`Lines ${result.endLine + 1}-${result.totalLines} not shown (${linesAfter} lines after)`);
    }
    
    return parts.join('\n');
  }

  /**
   * 生成摘要
   */
  getSummary(args: {
    target_file: string;
    should_read_entire_file: boolean;
    start_line_one_indexed: number;
    end_line_one_indexed_inclusive: number;
  }): string {
    if (args.should_read_entire_file) {
      return `读取整个文件: ${args.target_file}`;
    }
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
