/**
 * latex_codebase_search - LaTeX 代码库语义搜索工具
 * 
 * 功能：在 LaTeX 代码库中进行语义搜索，找到与查询最相关的代码片段
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * LaTeX 代码库搜索工具
 */
export class LatexCodebaseSearchTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'latex_codebase_search',
    description: `Find snippets of latex from the paperbase most relevant to the search query.\nThis is a semantic search tool, so the query should ask for something semantically matching what is needed.\nIf it makes sense to only search in particular directories, please specify them in the target_directories field.\nUnless there is a clear reason to use your own search query, please just reuse the user's exact query with their wording.\nTheir exact wording/phrasing can often be helpful for the semantic search query. Keeping the same exact question format can also be helpful.`,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: `One sentence explanation as to why this tool is being used, and how it contributes to the goal.` 
        },
        query: {
          type: 'string',
          description: `The search query to find relevant latex. You should reuse the user's exact query/most recent message with their wording unless there is a clear reason not to.` 
        },
        target_directories: {
          type: 'array',
          description: 'Glob patterns for directories to search over',
          items: {
            type: 'string'
          }
        }
      },
      required: ['query']
    },
    needApproval: false,  
    modes: ['agent']  // 只在 Agent 模式可用

  };

  /**
   * 执行语义搜索
   */
  async execute(args: {
    query: string;
    explanation?: string;
    target_directories?: string[];
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      // 参数验证
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: query',
          duration: Date.now() - startTime
        };
      }

      this.log(`执行语义搜索: ${args.query}`);
      if (args.target_directories?.length) {
        this.log(`搜索目录: ${args.target_directories.join(', ')}`);
      }

      // TODO: 实际实现 - 通过语义搜索服务查找相关代码
      // const results = await this.searchService.semanticSearch({
      //   query: args.query,
      //   directories: args.target_directories
      // });
      
      // 临时模拟实现
      const result = this.getMockSearchResult(args);

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
    explanation?: string;
    target_directories?: string[];
  }): string {
    const dirs = args.target_directories?.length 
      ? ` (在 ${args.target_directories.join(', ')} 中)` 
      : '';
    return `搜索 LaTeX 代码库: "${args.query}"${dirs}`;
  }

  /**
   * 模拟搜索结果（临时实现）
   */
  private getMockSearchResult(args: {
    query: string;
    target_directories?: string[];
  }): any {
    return {
      query: args.query,
      target_directories: args.target_directories,
      results: [
        {
          file: 'main.tex',
          snippet: '% 示例搜索结果...',
          relevance: 0.95,
          line_range: [1, 10]
        }
      ],
      total_results: 1,
      message: `找到与 "${args.query}" 相关的代码片段`
    };
  }
}
