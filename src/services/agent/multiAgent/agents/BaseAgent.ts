/**
 * BaseAgent - Agent 基类
 * 
 * 定义了所有 Agent 的通用接口和属性
 * 每个具体的 Agent 继承此基类
 */

import type { AgentName } from '../types';
import type { AvailableToolName } from '../tools/MultiAgentToolRegistry';

/**
 * Agent 配置接口
 */
export interface AgentConfig {
  /** Agent 名称 */
  name: AgentName;
  /** 系统提示词 */
  systemPrompt: string;
  /** 工具名称列表 */
  tools: AvailableToolName[];
}

/**
 * Agent 基类
 */
export abstract class BaseAgent {
  /** Agent 配置 */
  protected abstract config: AgentConfig;

  /**
   * 获取 Agent 名称
   */
  getName(): AgentName {
    return this.config.name;
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  /**
   * 获取工具名称列表
   */
  getTools(): AvailableToolName[] {
    return this.config.tools;
  }

  /**
   * 获取完整配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }
}

