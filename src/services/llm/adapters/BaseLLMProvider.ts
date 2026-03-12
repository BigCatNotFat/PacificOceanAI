/**
 * BaseLLMProvider - LLM 提供者基类
 * 
 * 定义所有 LLM 厂商提供者的通用接口
 */

import type { LLMMessage, LLMConfig, ContentPart } from '../../../platform/llm/ILLMService';
import { getTextContent } from '../../../platform/llm/ILLMService';

/**
 * API 配置
 */
export interface APIConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * LLM 提供者抽象基类
 */
export abstract class BaseLLMProvider {
  /**
   * 聊天接口 - 所有 Provider 必须实现（流式输出，更新 UI）
   * @param messages - 消息列表
   * @param config - LLM 配置
   * @returns 完整的最终响应
   */
  abstract chat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<import('../../../platform/llm/ILLMService').LLMFinalMessage>;

  /**
   * Manager 聊天接口 - 用于 MultiAgent 模式的 ManagerAgent
   * 
   * 与 chat 的区别：
   * - 不流式输出
   * - 不更新 UI
   * - 只返回结果
   * 
   * @param messages - 消息列表
   * @param config - LLM 配置
   * @returns 完整的最终响应
   */
  abstract managerChat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<import('../../../platform/llm/ILLMService').LLMFinalMessage>;

  /**
   * 格式化消息列表（某些厂商可能需要特殊处理）
   * 
   * 🔑 防御性编程：过滤掉空内容的消息
   * 虽然 PromptService 应该已经过滤，但这里再加一层保护
   * 确保不会将无效消息发送给 LLM API
   */
  protected formatMessages(messages: LLMMessage[]): any[] {
    return messages.filter(msg => {
      // 多模态内容（ContentPart[]）：只要有元素就保留
      if (Array.isArray(msg.content) && msg.content.length > 0) {
        return true;
      }
      // 纯文本内容
      if (typeof msg.content === 'string' && msg.content.trim()) {
        return true;
      }
      // 保留有工具调用的消息（即使内容为空）
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return true;
      }
      // 保留 tool 角色的消息（工具执行结果）
      if (msg.role === 'tool') {
        return true;
      }
      // 过滤掉其他空消息
      return false;
    });
  }

  /**
   * 构建请求体基础部分
   */
  protected buildBasePayload(
    messages: LLMMessage[],
    config: LLMConfig
  ): any {
    const payload: any = {
      model: config.modelId,
      messages: this.formatMessages(messages),
      stream: true
    };

    // 某些模型（如 Kimi K2.5）有固定的 temperature/top_p，必须使用固定值或不发送
    const fixedTemp = (config as any).fixedTemperature;
    const fixedTopP = (config as any).fixedTopP;
    const skipTopP = (config as any).skipTopP;
    const skipTemperature = (config as any).skipTemperature;

    // temperature：优先使用固定值，其次用户值，skipTemperature 时完全不发
    if (skipTemperature) {
      // 不发送 temperature
    } else if (typeof fixedTemp === 'number') {
      payload.temperature = fixedTemp;
    } else if (typeof config.temperature === 'number') {
      payload.temperature = config.temperature;
    }

    // top_p：优先使用固定值，其次用户值，skipTopP 时完全不发
    if (skipTopP) {
      // 不发送 top_p
    } else if (typeof fixedTopP === 'number') {
      payload.top_p = fixedTopP;
    } else if (typeof config.topP === 'number') {
      payload.top_p = config.topP;
    }

    return payload;
  }
}

