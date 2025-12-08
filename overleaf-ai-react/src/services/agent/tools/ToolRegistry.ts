/**
 * ToolRegistry - 工具注册中心
 * 
 * 职责：
 * 1. 管理所有工具的注册与查询
 * 2. 提供统一的工具导出接口（OpenAI、Anthropic 等格式）
 * 3. 自动生成工具文档
 * 
 * 📌 新增工具步骤：
 * 1. 在 implementations/ 文件夹创建新的工具类
 * 2. 在下面的 BUILTIN_TOOLS 数组中添加一行：new YourNewTool()
 * 3. 完成！无需其他修改
 */

import type { ITool, ToolMetadata } from './base/ITool';
import { ReadFileTool } from './implementations/ReadFileTool';
import { ListDirTool } from './implementations/ListDirTool';
import { GrepSearchTool } from './implementations/GrepSearchTool';
import { EditFileTool } from './implementations/EditFileTool';
import { DeleteFileTool } from './implementations/DeleteFileTool';
import { ReapplyTool } from './implementations/ReapplyTool';
import { WebSearchTool } from './implementations/WebSearchTool';
import { DiffHistoryTool } from './implementations/DiffHistoryTool';
import { LatexCodebaseSearchTool } from './implementations/LatexCodeBaseSearch';

/**
 * 工具注册表
 */
export class ToolRegistry {
  /** 工具存储容器 */
  private tools: Map<string, ITool> = new Map();

  /**
   * 内置工具列表
   * 
   * ⚠️ 新增工具请在此数组添加
   * 格式：new YourToolClass()
   */
  private static readonly BUILTIN_TOOLS: ITool[] = [
    // 读取类工具
    new ReadFileTool(),
    new ListDirTool(),
    new GrepSearchTool(),
    new LatexCodebaseSearchTool(),
    new WebSearchTool(),
    // new DiffHistoryTool(),
    // 写入类工具
    new EditFileTool(),
    new DeleteFileTool(),
    // new ReapplyTool(),
    // 👇 新增工具在这里添加，每个工具一行
    // new YourNewTool(),
  ];

  constructor() {
    this.initializeBuiltInTools();
  }

  // ==================== 工具注册与查询 ====================

  /**
   * 初始化内置工具
   */
  private initializeBuiltInTools(): void {
    for (const tool of ToolRegistry.BUILTIN_TOOLS) {
      this.register(tool);
    }
    console.log(`[ToolRegistry] 已注册 ${this.tools.size} 个工具`);
  }

  /**
   * 注册工具
   * @param tool - 工具实例
   */
  register(tool: ITool): void {
    const metadata = tool.getMetadata();
    
    if (this.tools.has(metadata.name)) {
      console.warn(`[ToolRegistry] 工具 "${metadata.name}" 已存在，将被覆盖`);
    }
    
    this.tools.set(metadata.name, tool);
    console.log(
      `[ToolRegistry] 已注册工具: ${metadata.name} ` +
      `(模式: ${metadata.modes.join(', ')}, 需要审批: ${metadata.needApproval})`
    );
  }

  /**
   * 根据名称获取工具
   * @param name - 工具名称
   * @returns 工具实例，如果不存在则返回 undefined
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   * @returns 工具实例数组
   */
  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 根据模式过滤工具
   * @param mode - 工具模式 ('agent' | 'chat' | 'normal')
   * @returns 符合条件的工具列表
   */
  getByMode(mode: 'agent' | 'chat' | 'normal'): ITool[] {
    return this.getAll().filter(tool => {
      const metadata = tool.getMetadata();
      return metadata.modes.includes(mode);
    });
  }

  /**
   * 获取 Agent 模式可用工具
   * @returns Agent 模式工具列表
   */
  getAgentTools(): ITool[] {
    return this.getByMode('agent');
  }

  /**
   * 获取 Chat 模式可用工具
   * @returns Chat 模式工具列表
   */
  getChatTools(): ITool[] {
    return this.getByMode('chat');
  }

  /**
   * 获取 Normal 模式可用工具
   * @returns Normal 模式工具列表
   */
  getNormalTools(): ITool[] {
    return this.getByMode('normal');
  }

  /**
   * 获取所有工具名称
   * @returns 工具名称列表
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // ==================== 导出功能 ====================

  /**
   * 导出为 OpenAI Function Calling 格式
   * 
   * 用于：直接传递给 OpenAI API 的 tools 参数
   * 
   * @example
   * const registry = new ToolRegistry();
   * const tools = registry.exportToOpenAIFormat();
   * await openai.chat.completions.create({
   *   model: "gpt-4",
   *   messages: [...],
   *   tools: tools  // ← 直接使用
   * });
   */
  exportToOpenAIFormat(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }> {
    return this.getAll().map(tool => {
      const metadata = tool.getMetadata();
      return {
        type: 'function',
        function: {
          name: metadata.name,
          description: metadata.description,
          parameters: metadata.parameters
        }
      };
    });
  }

  /**
   * 导出工具元数据列表
   * 
   * 用于：调试、日志记录、UI 展示
   * 
   * @returns 所有工具的元数据数组
   */
  exportMetadata(): ToolMetadata[] {
    return this.getAll().map(tool => tool.getMetadata());
  }

  /**
   * 生成工具使用文档（Markdown 格式）
   * 
   * 用于：自动生成 README 或帮助文档
   * 
   * @returns Markdown 格式的文档字符串
   */
  generateDocumentation(): string {
    const lines: string[] = [
      '# 可用工具列表\n',
      `> 共 ${this.tools.size} 个工具\n`,
      '---\n'
    ];

    // 按模式分组
    const byMode: Record<string, ITool[]> = {
      agent: [],
      chat: [],
      normal: []
    };

    for (const tool of this.getAll()) {
      const modes = tool.getMetadata().modes;
      modes.forEach(mode => {
        byMode[mode].push(tool);
      });
    }

    // 生成每个模式的文档
    for (const [mode, tools] of Object.entries(byMode)) {
      if (tools.length === 0) continue;

      const modeNames: Record<string, string> = {
        agent: '🤖 Agent 模式工具',
        chat: '💬 Chat 模式工具',
        normal: '📝 Normal 模式工具'
      };

      lines.push(`## ${modeNames[mode]}\n`);

      for (const tool of tools) {
        const meta = tool.getMetadata();
        lines.push(`### \`${meta.name}\`\n`);
        lines.push(`**描述**: ${meta.description}\n`);
        lines.push(`**需要审批**: ${meta.needApproval ? '✅ 是' : '❌ 否'}\n`);
        lines.push(`**可用模式**: ${meta.modes.join(', ')}\n`);
        
        if (meta.version) {
          lines.push(`**版本**: ${meta.version}\n`);
        }
        
        if (meta.tags && meta.tags.length > 0) {
          lines.push(`**标签**: ${meta.tags.map(t => `\`${t}\``).join(', ')}\n`);
        }

        lines.push('\n**参数**:\n');
        lines.push('```json\n');
        lines.push(JSON.stringify(meta.parameters, null, 2));
        lines.push('\n```\n');
        lines.push('---\n');
      }
    }

    return lines.join('\n');
  }

  /**
   * 导出为 Anthropic Claude 格式
   * 
   * 用于：传递给 Claude API
   */
  exportToAnthropicFormat(): Array<{
    name: string;
    description: string;
    input_schema: any;
  }> {
    return this.getAll().map(tool => {
      const metadata = tool.getMetadata();
      return {
        name: metadata.name,
        description: metadata.description,
        input_schema: metadata.parameters
      };
    });
  }

  /**
   * 导出统计信息
   * 
   * 用于：监控和调试
   */
  getStatistics(): {
    total: number;
    byMode: Record<string, number>;
    needingApproval: number;
  } {
    const all = this.getAll();
    
    return {
      total: all.length,
      byMode: {
        agent: this.getAgentTools().length,
        chat: this.getChatTools().length,
        normal: this.getNormalTools().length
      },
      needingApproval: all.filter(t => t.getMetadata().needApproval).length
    };
  }

  // ==================== 工具管理 ====================

  /**
   * 取消注册工具
   * @param name - 工具名称
   * @returns 是否成功删除
   */
  unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      console.log(`[ToolRegistry] 已取消注册工具: ${name}`);
    }
    return deleted;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    console.log('[ToolRegistry] 已清空所有工具');
  }

  /**
   * 检查工具是否存在
   * @param name - 工具名称
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
