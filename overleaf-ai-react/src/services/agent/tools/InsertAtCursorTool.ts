/**
 * InsertAtCursorTool - 在光标处插入文本
 * 
 * 具体工具实现，用于在当前光标位置插入指定文本。
 * 这是一个写入工具，需要用户审批。
 */

import type { ITool, IToolContext, ToolResult, ToolParametersSchema } from '../../../platform/tools/ITool';

/**
 * InsertAtCursorTool 实现
 * 
 * 职责：
 * - 在当前光标位置插入文本
 * - 支持自定义插入内容（默认为 "aabb"）
 * - 需要用户审批后执行
 */
export class InsertAtCursorTool implements ITool {
  // ==================== 元信息 ====================
  
  readonly name = 'insert_at_cursor';
  
  readonly description = 'Insert text at the current cursor position in the Overleaf editor. Default text is "aabb" if not specified.';
  
  readonly parametersSchema: ToolParametersSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to insert at cursor position',
        default: 'aabb'
      }
    },
    required: [] // text 参数可选，有默认值
  };
  
  // ==================== 能力标记 ====================
  
  readonly needApproval = true; // 修改文件内容，需要用户审批
  
  readonly isReadOnly = false; // 写入工具
  
  readonly category = 'editor' as const; // 编辑器类工具
  
  // ==================== 执行逻辑 ====================
  
  /**
   * 执行工具：在光标处插入文本
   * 
   * @param args - 参数对象 { text?: string }
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
      
      // 获取要插入的文本（默认为 "aabb"）
      const textToInsert = args.text || 'aabb';
      
      // 检查当前是否有激活的文件
      const currentFileName = await editorService.getCurrentFileName();
      
      if (!currentFileName) {
        return {
          success: false,
          errorMessage: 'No active file',
          displayMessage: '当前没有打开的文件'
        };
      }
      
      // 调用 editorService 的 insertTextAtCursor 方法
      // 该方法已经在 OverleafEditorService 中实现，使用测试成功的 DOM 操作
      const success = await editorService.insertTextAtCursor(textToInsert);
      
      if (success) {
        return {
          success: true,
          data: {
            fileName: currentFileName,
            insertedText: textToInsert,
            length: textToInsert.length
          },
          displayMessage: `成功在光标处插入文本: "${textToInsert}"`
        };
      } else {
        return {
          success: false,
          errorMessage: 'Failed to insert text at cursor',
          displayMessage: '插入文本失败，请确保光标在编辑器中'
        };
      }
      
    } catch (error) {
      // 处理异常
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        errorMessage: errorMessage,
        displayMessage: `插入文本时发生错误: ${errorMessage}`
      };
    }
  }
}
