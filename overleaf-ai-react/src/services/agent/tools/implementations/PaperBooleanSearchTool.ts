import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 论文布尔搜索接口参数
 */
interface PaperBooleanSearchArgs {
  query: string;
  limit?: number;
  cursor?: number;
  sort?: string;
}

/**
 * 作者数据接口（API原始响应）
 */
interface AuthorData {
  authorId: string;
  name: string;
}

/**
 * 论文数据接口（API原始响应）
 */
interface PaperData {
  paperId: string;
  title: string;
  abstract?: string;
  publicationDate?: string;
  year: number;
  citationCount: number;
  authors: AuthorData[];
  venue?: string;
  url: string;
}

/**
 * 精简后的论文数据接口（发送给LLM）
 */
interface PaperDataForLLM {
  title: string;
  abstract?: string;
  publicationDate?: string;
  year: number;
  citationCount: number;
  authors: string[];  // 只保留作者名字
  venue?: string;
}

/**
 * API 响应接口
 */
interface PaperBooleanSearchResponse {
  error: string | null;
  total: number;
  cursor: number;
  sort: string;
  data: PaperData[];
}

/**
 * 论文布尔搜索工具
 * 
 * 使用布尔逻辑对论文标题和摘要执行精确搜索
 */
export class PaperBooleanSearchTool extends BaseTool {
  private readonly API_URL = 'https://api.silicondream.top/api/paper_boolean_search';

  protected metadata: ToolMetadata = {
    name: 'paper_boolean_search',
    description: `
    Executes a precision search against paper titles and abstracts using boolean logic.
    Use this tool when you need specific keyword combinations, exclusions, or exact phrasing.
    Returns an object with total count, current cursor, and a list of papers.
    If more results are needed, call this tool again with the 'cursor' updated to the next position.
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
          description: `The boolean search string. 
          CRITICAL RULE FOR PHRASES:
          You MUST enclose multi-word concepts in double quotes (" ").
          - CORRECT: "large language model" (Matches the exact phrase)
          - WRONG: large language model (Matches "large" AND "language" AND "model" anywhere in text, resulting in noise)
          Supported Boolean Logic:
          - AND: Both terms required (e.g., "AI AND ethics")
          - OR: Either term required (e.g., "CNN OR RNN")
          - NOT: Exclude term (e.g., "classification NOT image")
          Advanced Matching:
          - "..." : Exact phrase match (e.g., "generative adversarial")
          - "*" : Prefix/Wildcard match (e.g., "comput*")
          - "()" : Grouping priority (e.g., "(AI OR ML) AND ethics")
          - "~N" : Fuzzy match or proximity search.`
        },
        limit: {
          type: 'number',
          description: 'The maximum number of results to return. Default is 10. Must be greater than 0 and less than 50.'
        },
        cursor: {
          type: 'number',
          description: 'Used for pagination. To retrieve the next page of results, pass the cursor value returned from the previous execution (previous_cursor + limit). Default is 0.'
        },
        year: {
          type: 'string',
          description: 'The year of the paper. Example: "2025" restricts to papers from 2025, "2023-2025" restricts to papers published between 2023 and 2025, "-2023" restricts to papers published before 2023 (include 2023), "+2025" restricts to papers published after 2025 (include 2025); leave empty for no year restriction.'
        },
        sort: {
          type: 'string',
          description: `Optional field to sort the results. Format: "field:order".
          Valid fields:
          - "paperId" (prevents data shifts during pagination)
          - "publicationDate" (e.g., "publicationDate:asc" for oldest first)
          - "citationCount" (Default, e.g., "citationCount:desc" for most cited first)
          
          Default is "citationCount:desc".`
        }
      },
      required: ['query']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  /**
   * 执行论文布尔搜索
   */
  async execute(args: PaperBooleanSearchArgs): Promise<ToolExecutionResult> {
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
      const query = args.query;
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 50); // 限制在1-50之间
      const cursor = Math.max(args.cursor ?? 0, 0); // 确保cursor非负
      const sort = args.sort ?? 'citationCount:desc'; // 默认排序：引用最多靠前

      // 验证 sort 参数格式
      const validSortFields = ['paperId', 'publicationDate', 'citationCount'];
      const validSortOrders = ['asc', 'desc'];
      const sortParts = sort.split(':');
      
      if (sortParts.length !== 2 || 
          !validSortFields.includes(sortParts[0]) || 
          !validSortOrders.includes(sortParts[1])) {
        return {
          success: false,
          error: `Invalid sort parameter: "${sort}". Expected format: "field:order" where field is one of [${validSortFields.join(', ')}] and order is one of [${validSortOrders.join(', ')}].`,
          duration: Date.now() - startTime
        };
      }

      this.log(`执行论文布尔搜索: "${query}", limit=${limit}, cursor=${cursor}, sort=${sort}`);

      // 发起 POST 请求
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          cursor,
          sort
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }

      const result: PaperBooleanSearchResponse = await response.json();

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
  getSummary(args: PaperBooleanSearchArgs): string {
    const sortInfo = args.sort ? `, sorted by ${args.sort}` : '';
    return `论文布尔搜索: "${args.query}"${sortInfo}`;
  }

  /**
   * 格式化搜索结果（过滤掉 paperId, url, authorId 以节省 token）
   */
  private formatResult(result: PaperBooleanSearchResponse): {
    total: number;
    cursor: number;
    sort: string;
    papers: PaperDataForLLM[];
    message: string;
  } {
    // 过滤掉 paperId, url, 以及 authors 中的 authorId
    const filteredPapers: PaperDataForLLM[] = result.data.map(paper => ({
      title: paper.title,
      abstract: paper.abstract,
      publicationDate: paper.publicationDate,
      year: paper.year,
      citationCount: paper.citationCount,
      authors: paper.authors.map(author => author.name),  // 只保留作者名字
      venue: paper.venue
    }));

    return {
      total: result.total,
      cursor: result.cursor,
      sort: result.sort,
      papers: filteredPapers,
      message: `Found ${result.total} papers. Showing ${result.data.length} results starting from position ${result.cursor - result.data.length}. Sorted by ${result.sort}.`
    };
  }
}