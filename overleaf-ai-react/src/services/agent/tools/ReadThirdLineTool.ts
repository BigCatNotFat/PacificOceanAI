/**
 * ReadThirdLineTool - 读取第三行文本
 * 
 * 具体工具实现，用于读取当前编辑器文件的第三行内容。
 * 这是一个只读工具，不需要用户审批。
 */

import type { ITool, IToolContext, ToolResult, ToolParametersSchema } from '../../../platform/tools/ITool';

/**
 * ReadThirdLineTool 实现
 * 
 * 职责：
 * - 通过 IEditorService 读取当前文件的第三行
 * - 处理文件不存在或行数不足的情况
 * - 返回统一格式的结果
 */
export class ReadThirdLineTool implements ITool {
  // ==================== 元信息 ====================
  
  readonly name = 'read_third_line';
  
  readonly description = 'Read the third line of text from the current active file in the Overleaf editor';
  
  readonly parametersSchema: ToolParametersSchema = {
    type: 'object',
    properties: {
      // 此工具不需要参数，读取的是当前激活的文件
    },
    required: []
  };
  
  // ==================== 能力标记 ====================
  
  readonly needApproval = false; // 只读操作，不需要审批
  
  readonly isReadOnly = true; // 只读工具
  
  readonly category = 'editor' as const; // 编辑器类工具
  
  // ==================== 执行逻辑 ====================
  
  /**
   * 执行工具：读取第三行
   * 
   * @param args - 参数对象（此工具不需要参数）
   * @param context - 执行上下文（包含 editorService）
   * @returns 工具执行结果
   */
  async execute(args: any, context: IToolContext): Promise<ToolResult> {
    try {
      const { editorService } = context;
      
      if (!editorService) {
        return {
          success: false,
          errorMessage: 'EditorService not available',
          displayMessage: '编辑器服务不可用'
        };
      }
      
      // 检查当前是否有激活的文件
      const currentFileName = await editorService.getCurrentFileName();
      
      if (!currentFileName) {
        return {
          success: false,
          errorMessage: 'No active file',
          displayMessage: '当前没有打开的文件'
        };
      }
      
      // 读取第三行（行号从 1 开始）
      const thirdLine = await editorService.readLine(3);
      
      if (thirdLine === null) {
        return {
          success: false,
          errorMessage: 'Line 3 does not exist or file has fewer than 3 lines',
          displayMessage: '文件不足三行或第三行不存在'
        };
      }
      
      // 成功读取
      return {
        success: true,
        data: {
          fileName: currentFileName,
          lineNumber: 3,
          content: thirdLine
        },
        displayMessage: `成功读取文件 ${currentFileName} 的第三行内容`
      };
      
    } catch (error) {
      // 处理异常
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        errorMessage: errorMessage,
        displayMessage: `读取第三行时发生错误: ${errorMessage}`
      };
    }
  }
}
