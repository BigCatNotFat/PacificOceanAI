/**
 * read_file - 读取文件工具
 * 
 * 功能：读取文件内容，支持指定行范围
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 读取文件工具
 */
export class ReadFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'read_file',
    description: `Read the contents of a file. the output of this tool call will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside start_line_one_indexed and end_line_one_indexed_inclusive.
Note that this call can view at most 250 lines at a time.

When using this tool to gather information, it's your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should:
1) Assess if the contents you viewed are sufficient to proceed with your task.
2) Take note of where there are lines not shown.
3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.
4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.

In some cases, if reading a range of lines is not enough, you may choose to read the entire file.
Reading entire files is often wasteful and slow, especially for large files (i.e. more than a few hundred lines). So you should use this option sparingly.
Reading the entire file is not allowed in most cases. You are only allowed to read the entire file if it has been edited or manually attached to the conversation by the user.`,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        target_file: {
          type: 'string',
          description: 'The path of the file to read. You can use either a relative path in the workspace or an absolute path. If an absolute path is provided, it will be preserved as is.'
        },
        should_read_entire_file: {
          type: 'boolean',
          description: 'Whether to read the entire file. Defaults to false.'
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
      if (!args.should_read_entire_file) {
        this.log(`行范围: ${args.start_line_one_indexed} - ${args.end_line_one_indexed_inclusive}`);
      }

      // TODO: 实际实现 - 通过文件服务读取文件内容
      const result = this.getMockResult(args);

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

  /**
   * 模拟结果（临时实现）
   */
  private getMockResult(args: any): any {
    return {
      file: args.target_file,
      start_line: args.start_line_one_indexed,
      end_line: args.end_line_one_indexed_inclusive,
      content: '% 示例文件内容...',
      total_lines: 100,
      message: `成功读取文件 ${args.target_file}`
    };
  }
}
