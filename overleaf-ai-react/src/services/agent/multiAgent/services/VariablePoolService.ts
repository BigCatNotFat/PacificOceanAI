/**
 * VariablePoolService - Agent 间变量池服务
 * 
 * 核心职责：
 * - 管理 Agent 执行结果的存储和传递
 * - 支持变量的自动命名和手动命名
 * - 提供变量注入功能，用于跨 Agent 数据传递
 * 
 * 设计原则：
 * - 低耦合：独立的服务，不依赖其他 Agent 服务
 * - 可扩展：支持不同类型的变量和自定义格式化
 * - 线程安全：每个会话独立的变量池
 */

import { logger } from '../../../../utils/logger';

// ==================== 类型定义 ====================

/**
 * 变量条目
 */
export interface VariableEntry {
  /** 变量名称 */
  name: string;
  /** 变量值 */
  value: string;
  /** 来源 Agent */
  sourceAgent: string;
  /** 创建时间 */
  createdAt: number;
  /** 变量描述（可选） */
  description?: string;
  /** 元数据（可选，用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * 变量池配置
 */
export interface VariablePoolConfig {
  /** 变量名前缀 */
  variablePrefix?: string;
  /** 最大变量数量 */
  maxVariables?: number;
  /** 变量值最大长度（用于截断显示） */
  maxValueDisplayLength?: number;
}

/**
 * 变量注入选项
 */
export interface VariableInjectionOptions {
  /** 变量名列表 */
  variableNames: string[];
  /** 注入格式模板（可选） */
  formatTemplate?: string;
  /** 是否包含变量元信息 */
  includeMetadata?: boolean;
}

/**
 * 变量注入结果
 */
export interface VariableInjectionResult {
  /** 是否成功 */
  success: boolean;
  /** 注入的内容 */
  content: string;
  /** 找到的变量 */
  foundVariables: string[];
  /** 未找到的变量 */
  missingVariables: string[];
}

// ==================== VariablePoolService 实现 ====================

/**
 * VariablePoolService - Agent 间变量池服务
 */
export class VariablePoolService {
  /** 变量存储 */
  private variables: Map<string, VariableEntry> = new Map();
  
  /** 变量计数器（用于自动命名） */
  private variableCounter: number = 0;
  
  /** 配置 */
  private config: Required<VariablePoolConfig>;

  constructor(config?: VariablePoolConfig) {
    this.config = {
      variablePrefix: config?.variablePrefix ?? '$result_',
      maxVariables: config?.maxVariables ?? 100,
      maxValueDisplayLength: config?.maxValueDisplayLength ?? 500
    };
  }

  // ==================== 核心方法 ====================

  /**
   * 保存变量
   * 
   * @param value - 变量值
   * @param sourceAgent - 来源 Agent
   * @param customName - 自定义变量名（可选）
   * @param description - 变量描述（可选）
   * @returns 保存后的变量条目
   */
  saveVariable(
    value: string,
    sourceAgent: string,
    customName?: string,
    description?: string
  ): VariableEntry {
    // 生成或使用自定义变量名
    const name = customName || this.generateVariableName(sourceAgent);
    
    // 检查变量池容量
    if (this.variables.size >= this.config.maxVariables) {
      this.evictOldestVariable();
    }

    const entry: VariableEntry = {
      name,
      value,
      sourceAgent,
      createdAt: Date.now(),
      description
    };

    this.variables.set(name, entry);
    
    logger.debug(`[VariablePoolService] 保存变量: ${name} (来源: ${sourceAgent})`);
    
    return entry;
  }

  /**
   * 获取变量
   * 
   * @param name - 变量名
   * @returns 变量条目或 undefined
   */
  getVariable(name: string): VariableEntry | undefined {
    return this.variables.get(name);
  }

  /**
   * 获取变量值
   * 
   * @param name - 变量名
   * @returns 变量值或 undefined
   */
  getVariableValue(name: string): string | undefined {
    return this.variables.get(name)?.value;
  }

  /**
   * 检查变量是否存在
   * 
   * @param name - 变量名
   * @returns 是否存在
   */
  hasVariable(name: string): boolean {
    return this.variables.has(name);
  }

  /**
   * 删除变量
   * 
   * @param name - 变量名
   * @returns 是否成功删除
   */
  deleteVariable(name: string): boolean {
    const deleted = this.variables.delete(name);
    if (deleted) {
      logger.debug(`[VariablePoolService] 删除变量: ${name}`);
    }
    return deleted;
  }

  /**
   * 获取所有变量名
   * 
   * @returns 变量名列表
   */
  getAllVariableNames(): string[] {
    return Array.from(this.variables.keys());
  }

  /**
   * 获取所有变量
   * 
   * @returns 变量条目数组
   */
  getAllVariables(): VariableEntry[] {
    return Array.from(this.variables.values());
  }

  /**
   * 清空变量池
   */
  clear(): void {
    this.variables.clear();
    this.variableCounter = 0;
    logger.debug('[VariablePoolService] 变量池已清空');
  }

  // ==================== 变量注入 ====================

  /**
   * 构建变量注入内容
   * 
   * 将指定的变量内容格式化为可注入到 Agent 提示词的格式
   * 
   * @param options - 注入选项
   * @returns 注入结果
   */
  buildInjectionContent(options: VariableInjectionOptions): VariableInjectionResult {
    const { variableNames, includeMetadata = false } = options;
    
    const foundVariables: string[] = [];
    const missingVariables: string[] = [];
    const contentParts: string[] = [];

    for (const name of variableNames) {
      const entry = this.variables.get(name);
      
      if (entry) {
        foundVariables.push(name);
        contentParts.push(this.formatVariableForInjection(entry, includeMetadata));
      } else {
        missingVariables.push(name);
      }
    }

    // 构建最终内容
    let content = '';
    if (contentParts.length > 0) {
      content = `<injected_variables>\n${contentParts.join('\n\n')}\n</injected_variables>`;
    }

    // 如果有缺失的变量，添加警告
    if (missingVariables.length > 0) {
      logger.warn(`[VariablePoolService] 未找到变量: ${missingVariables.join(', ')}`);
    }

    return {
      success: foundVariables.length > 0,
      content,
      foundVariables,
      missingVariables
    };
  }

  /**
   * 格式化单个变量用于注入
   */
  private formatVariableForInjection(entry: VariableEntry, includeMetadata: boolean): string {
    const lines: string[] = [];
    
    lines.push(`<variable name="${entry.name}" source="${entry.sourceAgent}">`);
    
    if (entry.description) {
      lines.push(`<!-- ${entry.description} -->`);
    }
    
    lines.push(entry.value);
    lines.push(`</variable>`);
    
    return lines.join('\n');
  }

  // ==================== 工具结果格式化 ====================

  /**
   * 格式化工具返回结果
   * 
   * 当 Agent 执行完成后，格式化返回给 Manager Agent 的消息
   * 包含结果内容和变量保存信息
   * 
   * @param entry - 变量条目
   * @param truncateLength - 截断长度（可选）
   * @returns 格式化后的结果字符串
   */
  formatToolResult(entry: VariableEntry, truncateLength?: number): string {
    const maxLen = truncateLength ?? this.config.maxValueDisplayLength;
    
    // 如果内容过长，截断显示
    let displayValue = entry.value;
    let truncated = false;
    
    if (displayValue.length > maxLen) {
      displayValue = displayValue.substring(0, maxLen) + '...';
      truncated = true;
    }

    const lines: string[] = [];
    lines.push(`[Agent Result]`);
    lines.push(`Variable: ${entry.name}`);
    lines.push(`Source: ${entry.sourceAgent}`);
    if (truncated) {
      lines.push(`Content (truncated to ${maxLen} chars):`);
    } else {
      lines.push(`Content:`);
    }
    lines.push('---');
    lines.push(displayValue);
    lines.push('---');
    lines.push(`\nNote: This result has been saved to variable "${entry.name}". You can inject this variable into other agents using the inject_variables parameter.`);

    return lines.join('\n');
  }

  // ==================== 私有方法 ====================

  /**
   * 生成变量名
   */
  private generateVariableName(sourceAgent: string): string {
    this.variableCounter++;
    // 使用 agent 名称简写 + 计数器
    const agentShort = sourceAgent.replace('_agent', '');
    return `${this.config.variablePrefix}${agentShort}_${this.variableCounter}`;
  }

  /**
   * 淘汰最旧的变量（当达到容量上限时）
   */
  private evictOldestVariable(): void {
    let oldest: VariableEntry | null = null;
    let oldestName: string | null = null;

    for (const [name, entry] of this.variables) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = entry;
        oldestName = name;
      }
    }

    if (oldestName) {
      this.variables.delete(oldestName);
      logger.debug(`[VariablePoolService] 淘汰旧变量: ${oldestName}`);
    }
  }

  // ==================== 调试方法 ====================

  /**
   * 获取变量池状态（用于调试）
   */
  getStatus(): {
    totalVariables: number;
    variableNames: string[];
    config: Required<VariablePoolConfig>;
  } {
    return {
      totalVariables: this.variables.size,
      variableNames: this.getAllVariableNames(),
      config: this.config
    };
  }

  /**
   * 打印变量池摘要（用于调试）
   */
  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('[VariablePoolService] 变量池摘要');
    console.log('-'.repeat(60));
    console.log(`总变量数: ${this.variables.size}`);
    
    for (const [name, entry] of this.variables) {
      const preview = entry.value.length > 100 
        ? entry.value.substring(0, 100) + '...' 
        : entry.value;
      console.log(`  ${name} (${entry.sourceAgent}): ${preview}`);
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== 导出 ====================

export default VariablePoolService;

