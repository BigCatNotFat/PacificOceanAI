/**
 * compile_project - 编译项目工具
 *
 * 功能：触发 LaTeX 编译并返回结果（错误、警告、日志摘要）
 * 类型：action（操作类工具）
 *
 * 这是实现"修改 → 编译 → 检查 → 修复"闭环的关键工具。
 * AI 可以在修改 LaTeX 代码后自主编译、检查错误，并根据结果自动修复。
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';

export class CompileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'compile_project',
    description: `Compile the LaTeX project and return the result including errors, warnings, and a log summary.

This is essential for verifying that your changes are correct. Use this tool after making edits to:
1. Check if the document compiles successfully
2. Get a list of LaTeX errors with line numbers
3. Get a list of LaTeX warnings
4. Read the compile log summary for diagnostics

The tool supports two actions:
- **compile**: Trigger compilation and wait for the result. Returns errors, warnings, and log summary.
- **stop**: Stop an in-progress compilation.

**Typical workflow:**
1. Make edits to .tex files using search_replace or replace_lines
2. Call compile_project with action "compile" to verify
3. If errors are found, read the error messages and fix them
4. Repeat until compilation succeeds

**Options for compile action:**
- \`draft\`: If true, compile in draft mode (faster but lower quality). Defaults to false.
- \`clear_cache\`: If true, clear the compile cache before compiling (useful when stuck). Defaults to false.`,

    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['compile', 'stop'],
          description: 'The action to perform: "compile" to start compilation, "stop" to abort it.'
        },
        draft: {
          type: 'boolean',
          description: 'If true, compile in draft mode (faster). Only applicable when action is "compile". Defaults to false.'
        },
        clear_cache: {
          type: 'boolean',
          description: 'If true, clear compile cache before compiling. Only applicable when action is "compile". Defaults to false.'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why compilation is being triggered.'
        }
      },
      required: ['action']
    },
    needApproval: false,
    modes: ['agent']
  };

  async execute(args: {
    action: 'compile' | 'stop';
    draft?: boolean;
    clear_cache?: boolean;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: action (must be "compile" or "stop")',
          duration: Date.now() - startTime
        };
      }

      if (args.action === 'stop') {
        await overleafEditor.compile.stopCompile();
        return {
          success: true,
          data: { action: 'stop', message: 'Compilation stopped.' },
          duration: Date.now() - startTime
        };
      }

      if (args.clear_cache) {
        await overleafEditor.compile.clearCache();
      }

      const result = await overleafEditor.compile.compile({
        draft: args.draft
      });

      const hasErrors = result.errors.length > 0;
      const hasWarnings = result.warnings.length > 0;

      let summary = `Compilation ${result.status}.`;
      if (hasErrors) {
        summary += ` ${result.errors.length} error(s) found.`;
      }
      if (hasWarnings) {
        summary += ` ${result.warnings.length} warning(s).`;
      }
      if (!hasErrors && !hasWarnings) {
        summary += ' No errors or warnings.';
      }

      const formattedErrors = result.errors.map((e, i) => {
        const lineInfo = e.line ? ` (line ${e.line})` : '';
        return `  ${i + 1}. ${e.message}${lineInfo}`;
      }).join('\n');

      const formattedWarnings = result.warnings.slice(0, 10).map((w, i) => {
        return `  ${i + 1}. ${w.message}`;
      }).join('\n');

      return {
        success: true,
        data: {
          status: result.status,
          summary,
          errors: hasErrors ? formattedErrors : null,
          errorCount: result.errors.length,
          warnings: hasWarnings ? formattedWarnings : null,
          warningCount: result.warnings.length,
          warningsTruncated: result.warnings.length > 10,
          logSummary: result.logSummary,
          message: summary
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

  getSummary(args: { action: string }): string {
    return args.action === 'stop' ? '停止编译' : '编译项目';
  }
}
