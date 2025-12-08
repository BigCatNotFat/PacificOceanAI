/**
 * edit_file - 编辑文件工具
 * 
 * 功能：对现有文件进行编辑修改
 * 类型：write（写操作，需要用户审批）
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';

/**
 * 编辑文件工具
 */
export class EditFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'edit_file',
    description: `Use this tool to propose an edit to an existing file.

This will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged latex you write.
When writing the edit, you should specify each edit in sequence, with the special comment \`// ... existing latex codes...\` to represent unchanged latex codes in between edited lines.

For example:

\`\`\`
// ... existing latex codes...
FIRST_EDIT
// ... existing latex codes...
SECOND_EDIT
// ... existing latex codes...
THIRD_EDIT
// ... existing latex codes...
\`\`\`

You should still bias towards repeating as few lines of the original file as possible to convey the change.
But, each edit should contain sufficient context of unchanged lines around the latex you're editing to resolve ambiguity.
DO NOT omit spans of pre-existing latex (or comments) without using the \`// ... existing latex ...\` comment to indicate its absence. If you omit the existing latex comment, the model may inadvertently delete these lines.
Make sure it is clear what the edit should be, and where it should be applied.

You should specify the following arguments before the others: [target_file]`,
    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The target file to modify. Always specify the target file as the first argument. You can use either a relative path in the workspace or an absolute path. If an absolute path is provided, it will be preserved as is.'
        },
        instructions: {
          type: 'string',
          description: "A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit. Please use the first person to describe what you are going to do. Dont repeat what you have said previously in normal messages. And use it to disambiguate uncertainty in the edit."
        },
        latex_edit: {
          type: 'string',
          description: 'Specify ONLY the precise lines of latex that you wish to edit. **NEVER specify or write out unchanged latex**. Instead, represent all unchanged latex using the comment of the language you\'re editing in - example: `// ... existing latex ...`'
        }
      },
      required: ['target_file', 'instructions', 'latex_edit']
    },
    needApproval: true,
    modes: ['agent']
  };

  /**
   * 执行编辑文件
   */
  async execute(args: {
    target_file: string;
    instructions: string;
    latex_edit: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, instructions, latex_edit',
          duration: Date.now() - startTime
        };
      }

      this.log(`编辑文件: ${args.target_file}`);
      this.log(`指令: ${args.instructions}`);

      // TODO: 实际实现 - 通过编辑服务应用编辑
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
    instructions: string;
  }): string {
    return `编辑文件 ${args.target_file}: ${args.instructions}`;
  }

  /**
   * 模拟结果（临时实现）
   */
  private getMockResult(args: any): any {
    return {
      file: args.target_file,
      instructions: args.instructions,
      applied: true,
      message: `成功编辑文件 ${args.target_file}`
    };
  }
}
