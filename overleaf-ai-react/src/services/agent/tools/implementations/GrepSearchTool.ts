/**
 * grep_search - 正则搜索工具
 * 
 * 功能：使用 ripgrep 进行快速文本搜索
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 正则搜索工具
 */
export class GrepSearchTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'grep_search',
    description: `Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching.
Results will be formatted in the style of ripgrep and can be configured to include line numbers and content.
To avoid overwhelming output, the results are capped at 50 matches.
Use the include or exclude patterns to filter the search scope by file type or specific paths.

This is best for finding exact text matches or regex patterns.
More precise than semantic search for finding specific strings or patterns.
This is preferred over semantic search when we know the exact symbol/function name/etc. to search in some set of directories/file types.`,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        query: {
          type: 'string',
          description: 'The regex pattern to search for'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether the search should be case sensitive'
        },
        include_pattern: {
          type: 'string',
          description: "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)"
        },
        exclude_pattern: {
          type: 'string',
          description: 'Glob pattern for files to exclude'
        }
      },
      required: ['query']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  /**
   * 执行正则搜索
   */
  async execute(args: {
    query: string;
    case_sensitive?: boolean;
    include_pattern?: string;
    exclude_pattern?: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: query',
          duration: Date.now() - startTime
        };
      }

      this.log(`执行正则搜索: ${args.query}`);
      if (args.include_pattern) {
        this.log(`包含模式: ${args.include_pattern}`);
      }
      if (args.exclude_pattern) {
        this.log(`排除模式: ${args.exclude_pattern}`);
      }

      // TODO: 实际实现 - 通过搜索服务执行 grep 搜索
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
    query: string;
    include_pattern?: string;
  }): string {
    const pattern = args.include_pattern ? ` (在 ${args.include_pattern} 中)` : '';
    return `搜索: "${args.query}"${pattern}`;
  }

  /**
   * 模拟结果（临时实现）
   */
  private getMockResult(args: any): any {
    return {
      query: args.query,
      matches: [
        {
          file: 'main.tex',
          line: 10,
          content: '% 匹配的内容...',
          context_before: [],
          context_after: []
        }
      ],
      total_matches: 1,
      message: `找到 1 个匹配 "${args.query}" 的结果`
    };
  }
}
