/**
 * compiler_settings - 编译器设置工具
 *
 * 功能：查看/切换 LaTeX 编译器
 * 类型：read/write（查看不需审批，切换需要审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';

export class CompilerSettingsTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'compiler_settings',
    description: `View or change the LaTeX compiler settings for the project.

Supported actions:
- **get**: Get the current compiler name.
- **list**: List all available compilers and which one is currently active.
- **switch**: Switch to a different compiler.

Available compilers: pdflatex, xelatex, lualatex, latex.

**When to switch compilers:**
- Use \`xelatex\` or \`lualatex\` for documents with Unicode/CJK characters (Chinese, Japanese, Korean)
- Use \`pdflatex\` for standard LaTeX documents (fastest)
- Use \`lualatex\` for documents requiring advanced font features or Lua scripting
- Use \`latex\` for DVI output (rare)

**Tip:** If compilation fails with font errors or encoding issues, try switching to xelatex or lualatex.`,

    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'list', 'switch'],
          description: 'The action to perform.'
        },
        compiler: {
          type: 'string',
          enum: ['pdflatex', 'xelatex', 'lualatex', 'latex'],
          description: 'The compiler to switch to. Required when action is "switch".'
        },
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why the compiler is being changed.'
        }
      },
      required: ['action']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  async execute(args: {
    action: 'get' | 'list' | 'switch';
    compiler?: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: action (must be "get", "list", or "switch")',
          duration: Date.now() - startTime
        };
      }

      switch (args.action) {
        case 'get': {
          const compiler = await overleafEditor.compile.getCompiler();
          return {
            success: true,
            data: {
              compiler,
              message: `Current compiler: ${compiler || 'unknown'}`
            },
            duration: Date.now() - startTime
          };
        }

        case 'list': {
          const compilers = await overleafEditor.compile.listCompilers();
          const current = compilers.find(c => c.current);
          const list = compilers.map(c =>
            `${c.current ? '→ ' : '  '}${c.name}`
          ).join('\n');

          return {
            success: true,
            data: {
              compilers,
              currentCompiler: current?.name || null,
              formatted: `Available compilers:\n${list}`,
              message: `Current compiler: ${current?.name || 'unknown'}. ${compilers.length} compilers available.`
            },
            duration: Date.now() - startTime
          };
        }

        case 'switch': {
          if (!args.compiler) {
            return {
              success: false,
              error: 'Parameter "compiler" is required when action is "switch".',
              duration: Date.now() - startTime
            };
          }

          const result = await overleafEditor.compile.switchCompiler(args.compiler);

          if (!result.changed) {
            return {
              success: true,
              data: {
                compiler: result.compiler,
                changed: false,
                message: `Compiler is already set to "${result.compiler}", no change needed.`
              },
              duration: Date.now() - startTime
            };
          }

          return {
            success: true,
            data: {
              compiler: result.compiler,
              previous: result.previous,
              changed: true,
              message: `Switched compiler from "${result.previous}" to "${result.compiler}". You may want to recompile.`
            },
            duration: Date.now() - startTime
          };
        }

        default:
          return {
            success: false,
            error: `Unknown action: "${args.action}". Must be "get", "list", or "switch".`,
            duration: Date.now() - startTime
          };
      }
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  getSummary(args: { action: string; compiler?: string }): string {
    switch (args.action) {
      case 'get': return '查看当前编译器';
      case 'list': return '列出可用编译器';
      case 'switch': return `切换编译器为 ${args.compiler}`;
      default: return '编译器设置';
    }
  }
}
