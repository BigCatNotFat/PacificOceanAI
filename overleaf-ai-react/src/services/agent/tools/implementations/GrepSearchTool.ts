/**
 * grep_search - 正则搜索工具
 * 
 * 功能：使用 ripgrep 风格的搜索功能（通过 Overleaf Bridge）
 * 类型：read（只读操作，不需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { OverleafBridgeClient } from '../../../editor/bridge/OverleafBridgeClient';

/**
 * 正则搜索工具
 */
export class GrepSearchTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'grep_search',
    description: `Fast text-based regex search that finds exact pattern matches within files or directories.
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
          description: "Glob pattern for files to include (e.g. '*.ts' for TypeScript files). Currently supports simple suffix matching (e.g. *.tex) or exact match."
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
      
      // 调用 Bridge 进行搜索
      const bridge = OverleafBridgeClient.getInstance();
      
      // 注意：overleafBridge.js 中的 searchProject 接受 (pattern, options)
      // options: { caseSensitive: boolean, wholeWord: boolean, regexp: boolean }
      const searchOptions = {
        caseSensitive: args.case_sensitive || false,
        regexp: true, // 默认开启正则模式，因为工具描述说是 "regex search"
        wholeWord: false
      };

      const result = await bridge.call('searchProject', args.query, searchOptions);

      // 检查是否有错误
      if (result.error) {
        return {
          success: false,
          error: result.error,
          duration: Date.now() - startTime
        };
      }

      // 过滤结果
      const filteredResult = this.filterResults(result, args.include_pattern, args.exclude_pattern);

      // 格式化输出结果（类似 ripgrep 风格）
      const formattedResults = this.formatResults(filteredResult.results);

      return {
        success: true,
        data: {
          query: args.query,
          results: filteredResult.results,
          formatted_output: formattedResults,
          total_matches: filteredResult.totalMatches,
          file_count: filteredResult.fileCount,
          duration: result.duration, // 使用服务端返回的搜索耗时
          message: filteredResult.totalMatches > 0 
            ? `找到 ${filteredResult.totalMatches} 个匹配 "${args.query}" 的结果，分布在 ${filteredResult.fileCount} 个文件中`
            : `未找到匹配 "${args.query}" 的结果`
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
  getSummary(args: {
    query: string;
    include_pattern?: string;
  }): string {
    const pattern = args.include_pattern ? ` (s在 ${args.include_pattern} 中)` : '';
    return `搜索: "${args.query}"${pattern}`;
  }

  /**
   * 过滤搜索结果
   */
  private filterResults(
    rawResult: any, 
    includePattern?: string, 
    excludePattern?: string
  ): any {
    if (!rawResult || !rawResult.results) {
      return { results: [], totalMatches: 0, fileCount: 0 };
    }

    let results = rawResult.results;

    // 简单过滤逻辑：支持 *.ext 后缀匹配或字符串包含
    const matchPattern = (path: string, pattern: string): boolean => {
      if (pattern.startsWith('*')) {
        return path.endsWith(pattern.slice(1));
      }
      return path.includes(pattern);
    };

    if (includePattern) {
      results = results.filter((file: any) => matchPattern(file.path, includePattern));
    }

    if (excludePattern) {
      results = results.filter((file: any) => !matchPattern(file.path, excludePattern));
    }

    // 重新计算统计数据
    let totalMatches = 0;
    results.forEach((file: any) => {
      totalMatches += file.matchCount;
    });

    return {
      results,
      totalMatches,
      fileCount: results.length
    };
  }

  /**
   * 格式化搜索结果（类似 ripgrep 风格）
   */
  private formatResults(results: any[]): string {
    if (!results || results.length === 0) {
      return '未找到匹配项';
    }

    const lines: string[] = [];
    const MAX_MATCHES = 50; // 限制输出数量
    let matchCount = 0;

    for (const file of results) {
      if (matchCount >= MAX_MATCHES) {
        lines.push(`\n... 结果已截断，共找到超过 ${MAX_MATCHES} 个匹配项`);
        break;
      }

      lines.push(`\n📁 ${file.path} (${file.matchCount} 个匹配)`);
      lines.push('─'.repeat(60));

      for (const match of file.matches) {
        if (matchCount >= MAX_MATCHES) break;
        
        // 格式: 行号:列号: 行内容
        const lineContent = match.lineContent.length > 200 
          ? match.lineContent.substring(0, 200) + '...' 
          : match.lineContent;
        lines.push(`  ${match.lineNumber}:${match.columnStart}: ${lineContent}`);
        matchCount++;
      }
    }

    return lines.join('\n');
  }
}
