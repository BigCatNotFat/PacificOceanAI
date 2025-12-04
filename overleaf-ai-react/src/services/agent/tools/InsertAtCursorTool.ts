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
      
      // TODO: 等待 IEditorService 扩展插入文本的方法
      // 目前 IEditorService 接口中没有 insertText 方法
      // 需要在 platform/editor/editor.ts 中添加类似以下方法：
      // insertTextAtCursor(text: string): Promise<void>;
      // 或者
      // applyEdit(edit: TextEdit): Promise<void>;
      
      // 临时方案：检查 editorService 是否有 insertTextAtCursor 方法
      if (typeof (editorService as any).insertTextAtCursor === 'function') {
        await (editorService as any).insertTextAtCursor(textToInsert);
        
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
        // 如果没有实现该方法，返回提示信息
        return {
          success: false,
          errorMessage: 'insertTextAtCursor method not implemented in EditorService',
          displayMessage: `编辑器服务尚未实现 insertTextAtCursor 方法。需要在 IEditorService 中添加该方法。`
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
