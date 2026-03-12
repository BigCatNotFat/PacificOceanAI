/**
 * ToolService - Services 层实现
 * 
 * 工具注册表与执行器，负责：
 * - 管理工具生命周期（注册、查询）
 * - 执行具体工具逻辑
 * - 统一错误处理和日志记录
 * 
 * 📌 新架构：
 * - 使用 ToolRegistry 管理所有工具
 * - 每个工具独立实现，位于 tools/implementations/
 * - 添加新工具只需在 ToolRegistry.BUILTIN_TOOLS 数组中注册
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  IToolService,
  ITool,
  ToolExecutionResult
} from '../../platform/agent/IToolService';
import { IToolServiceId } from '../../platform/agent/IToolService';
import { ToolRegistry } from './tools/ToolRegistry';
import type { ITool as IToolNew } from './tools/base/ITool';
/**
 * ToolService 实现
 */
@injectable()
export class ToolService implements IToolService {
  /** 工具注册中心（新架构） */
  private readonly registry: ToolRegistry;

  constructor() {
    // 初始化工具注册中心（自动注册所有内置工具）
    this.registry = new ToolRegistry();
  }

  // ==================== 公共方法 ====================

  /**
   * 注册工具（保持兼容性）
   * 
   * 注意：此方法用于外部动态注册工具
   * 内置工具通过 ToolRegistry.BUILTIN_TOOLS 自动注册
   */
  registerTool(tool: ITool): void {
    // TODO: 将旧的 ITool 接口适配为新的 IToolNew 接口
    // const adaptedTool = this.adaptLegacyTool(tool);
    // this.registry.register(adaptedTool);
  }

  /**
   * 获取工具
   */
  getTool(name: string): ITool | undefined {
    const tool = this.registry.get(name);
    if (!tool) return undefined;
    
    // 转换新接口为旧接口（保持兼容性）
    return this.convertToLegacyTool(tool);
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, args: any): Promise<ToolExecutionResult> {
    const tool = this.registry.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `工具 "${name}" 不存在`
      };
    }

    // 🔧 工具调用调试
    const debugToolCalls =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('overleaf_ai_debug_tool_calls') === '1';

    if (debugToolCalls) {
      const metadata = tool.getMetadata();
      // 参数验证
      const isValid = tool.validate(args);
      if (!isValid) {
        const required = metadata.parameters.required || [];
        for (const r of required) {
          if (args?.[r] === undefined || args?.[r] === null) {
          }
        }
      } else {
      }

      // 检查参数值类型是否与 schema 匹配
      const properties = metadata.parameters.properties || {};
      for (const [key, val] of Object.entries(args || {})) {
        const schemaProp = properties[key] as any;
        if (schemaProp) {
          const expectedType = schemaProp.type;
          const actualType = Array.isArray(val) ? 'array' : typeof val;
          if (expectedType && actualType !== expectedType) {
          }
        }
      }
    }

    const result = await tool.execute(args);

    if (debugToolCalls && !result.success) {
    }

    return result;
  }

  /**
   * 列出所有工具名称
   */
  listTools(): string[] {
    return this.registry.getAllNames();
  }

  /**
   * 列出所有工具的元信息
   */
  listToolInfos(): ITool[] {
    return this.registry.getAll().map(tool => this.convertToLegacyTool(tool));
  }

  /**
   * 获取 Agent 模式可用工具
   */
  getAgentTools(): ITool[] {
    return this.registry.getAgentTools().map(tool => this.convertToLegacyTool(tool));
  }

  /**
   * 获取 Chat 模式可用工具
   */
  getChatTools(): ITool[] {
    return this.registry.getChatTools().map(tool => this.convertToLegacyTool(tool));
  }

  /**
   * 获取 Normal 模式可用工具
   */
  getNormalTools(): ITool[] {
    return this.registry.getNormalTools().map(tool => this.convertToLegacyTool(tool));
  }

  /**
   * 获取所有工具
   */
  getAllTools(): ITool[] {
    return this.registry.getAll().map(tool => this.convertToLegacyTool(tool));
  }

  // ==================== 私有方法 ====================

  /**
   * 将新工具接口转换为旧接口（保持兼容性）
   */
  private convertToLegacyTool(tool: IToolNew): ITool {
    const metadata = tool.getMetadata();
    return {
      name: metadata.name,
      description: metadata.description,
      parameters: metadata.parameters,
      needApproval: metadata.needApproval,
      modes: metadata.modes,
      execute: (args: any) => tool.execute(args)
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.registry.clear();
  }
}

// 导出服务标识符
export { IToolServiceId };
