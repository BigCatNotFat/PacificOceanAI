/**
 * BaseLLMAdapter - LLM 适配器基类
 * 
 * 定义所有 LLM 厂商适配器的通用接口
 */

import type { LLMMessage, LLMConfig } from '../../../platform/llm/ILLMService';
import type { LLMProviderRequest } from '../../../platform/llm/ILLMProviderService';

/**
 * API 配置
 */
export interface APIConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * LLM 适配器抽象基类
 */
export abstract class BaseLLMAdapter {
  /**
   * 构建请求配置
   * @param messages - 消息列表
   * @param config - LLM 配置
   * @param apiConfig - API 配置
   * @returns 厂商特定的请求配置
   */
  abstract buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    apiConfig: APIConfig
  ): LLMProviderRequest;

  /**
   * 格式化消息列表（某些厂商可能需要特殊处理）
   * 
   * 🔑 防御性编程：过滤掉空内容的消息
   * 虽然 PromptService 应该已经过滤，但这里再加一层保护
   * 确保不会将无效消息发送给 LLM API
   */
  protected formatMessages(messages: LLMMessage[]): any[] {
    return messages.filter(msg => {
      // 保留有内容的消息
      if (msg.content && msg.content.trim()) {
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
      console.warn('[BaseLLMAdapter] 过滤空消息', { role: msg.role });
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

    if (typeof config.temperature === 'number') {
      payload.temperature = config.temperature;
    }
    if (typeof config.topP === 'number') {
      payload.top_p = config.topP;
    }

    return payload;
  }
}

