
import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 论文语义搜索接口参数
 */
interface PaperSemanticSearchArgs {
  query: string;
  limit?: number;
  cursor?: number;
}

/**
 * 论文数据接口
 */
interface PaperData {
  title: string;
  year: number;
  citations: number;
  authors: string;
  venue: string;
  content: string;
}

/**
 * API 响应接口
 */
interface PaperSemanticSearchResponse {
  error: string | null;
  total: number;
  cursor: number;
  data: PaperData[];
}

/**
 * 论文语义搜索工具
 * 
 * 基于自然语言查询执行学术论文的语义搜索，按相关性排序结果
 */
export class PaperSemanticSearchTool extends BaseTool {
  private readonly API_URL = 'https://api.silicondream.top/api/paper_semantic_search';

  protected metadata: ToolMetadata = {
    name: 'paper_semantic_search',
    description: `
    Performs a semantic search for academic papers based on plain-text input, ranking results by relevance. 
    Returns an object containing the total count, current cursor, and a list of papers.
    If the returned results are insufficient, call this tool again using the 'cursor' provided in the previous result to retrieve the next page.
    `,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        query: {
          type: 'string',
          description: 'A plain-text search query. IMPORTANT: Hyphenated terms (e.g., "self-supervised") may not match; you MUST replace hyphens with spaces (e.g., "self supervised"). The query will be truncated to the first 100 characters.'
        },
        limit: {
          type: 'number',
          description: 'The maximum number of results to return. Default is 10. Must be greater than 0 and less than 50.'
        },
        cursor: {
          type: 'number',
          description: 'Used for pagination. To get the next page of results, pass the cursor value returned from the previous tool execution. Default is 0.'
        }
      },
      required: ['query']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  /**
   * 执行论文语义搜索
   */
  async execute(args: PaperSemanticSearchArgs): Promise<ToolExecutionResult> {
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

      // 处理参数默认值和边界
      const query = args.query.slice(0, 100); // 截断到100字符
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 50); // 限制在1-50之间
      const cursor = Math.max(args.cursor ?? 0, 0); // 确保cursor非负

      this.log(`执行论文语义搜索: "${query}", limit=${limit}, cursor=${cursor}`);

      // 发起 POST 请求
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          cursor
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }

      const result: PaperSemanticSearchResponse = await response.json();

      // 检查 API 返回的错误
      if (result.error) {
        return {
          success: false,
          error: result.error,
          duration: Date.now() - startTime
        };
      }

      // 格式化输出结果
      const formattedData = this.formatResult(result);

      return {
        success: true,
        data: formattedData,
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
   * 生成执行摘要
   */
  getSummary(args: PaperSemanticSearchArgs): string {
    return `论文语义搜索: "${args.query}"`;
  }

  /**
   * 格式化搜索结果
   */
  private formatResult(result: PaperSemanticSearchResponse): {
    total: number;
    cursor: number;
    papers: PaperData[];
    message: string;
  } {
    return {
      total: result.total,
      cursor: result.cursor,
      papers: result.data,
      message: `Found ${result.total} papers. Showing ${result.data.length} results starting from position ${result.cursor - result.data.length}.`
    };
  }
}