/**
 * BaseTool - 工具基类
 * 
 * 提供工具的通用实现，减少重复代码
 * 所有具体工具可以继承此类
 */

import type { ITool, ToolMetadata, ToolExecutionResult } from './ITool';

/**
 * 工具基类
 * 
 * 提供默认实现：
 * - getMetadata(): 返回工具元数据
 * - validate(): 基于 JSON Schema 的参数验证
 * - getSummary(): 生成默认摘要
 * - handleError(): 统一错误处理
 */
export abstract class BaseTool implements ITool {
  /**
   * 工具元数据（子类必须实现）
   */
  protected abstract metadata: ToolMetadata;

  /**
   * 执行工具（子类必须实现）
   */
  abstract execute(args: any): Promise<ToolExecutionResult>;

  /**
   * 获取工具元数据
   */
  getMetadata(): ToolMetadata {
    return this.metadata;
  }

  /**
   * 验证参数
   * 
   * 默认实现：检查所有 required 字段是否存在
   * 子类可以重写此方法实现更复杂的验证逻辑
   */
  validate(args: any): boolean {
    if (!args || typeof args !== 'object') {
      return false;
    }

    const required = this.metadata.parameters.required || [];
    return required.every(key => args[key] !== undefined && args[key] !== null);
  }

  /**
   * 生成执行摘要
   * 
   * 默认实现：返回工具名称
   * 子类可以重写此方法生成更详细的摘要
   */
  getSummary(args: any): string {
    return `执行工具: ${this.metadata.name}`;
  }

  /**
   * 统一错误处理
   * 
   * 将各种错误类型转换为标准的 ToolExecutionResult
   */
  protected handleError(error: unknown): ToolExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // console.error(`[${this.metadata.name}] 执行失败:`, error);
    
    return {
      success: false,
      error: errorMessage
    };
  }

  /**
   * 记录工具执行日志
   */
  protected log(message: string, data?: any): void {
    // console.log(`[${this.metadata.name}] ${message}`, data || '');
  }
}
