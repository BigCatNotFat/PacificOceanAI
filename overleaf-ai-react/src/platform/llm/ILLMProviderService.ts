/**
 * ILLMProviderService - Platform 层接口定义
 * 
 * LLM 厂商适配服务，负责：
 * - 将统一的 LLMConfig 转换为各厂商的请求格式
 * - 处理 maxTokensParamName 等厂商差异
 * - 选择正确的 API 端点
 * - 提供流解析策略
 */

import type { LLMMessage, LLMConfig, LLMDeltaChunk } from './ILLMService';

// ==================== 类型定义 ====================

/**
 * LLM 厂商请求配置
 */
export interface LLMProviderRequest {
  /** API 端点 */
  endpoint: string;
  /** 请求头 */
  headers: Record<string, string>;
  /** 请求体 */
  body: any;
  /** 厂商类型（用于解析响应） */
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';
}

/**
 * 流解析结果
 */
export interface ParsedStreamChunk {
  /** 增量内容 */
  chunk?: LLMDeltaChunk;
  /** 是否完成 */
  done?: boolean;
  /** 完成原因 */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** 使用统计 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ==================== Service 接口 ====================

/**
 * ILLMProviderService - LLM 厂商适配服务接口
 */
export interface ILLMProviderService {
  /**
   * 构建 LLM 请求配置
   * @param messages - 消息列表
   * @param config - LLM 配置
   * @returns 厂商特定的请求配置
   */
  buildRequestConfig(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMProviderRequest>;

  /**
   * 解析流式响应的单个数据块
   * @param dataString - SSE 数据字符串
   * @param provider - 厂商类型
   * @returns 解析后的增量数据
   */
  parseStreamChunk(
    dataString: string,
    provider: LLMProviderRequest['provider']
  ): ParsedStreamChunk | null;
}

/**
 * ILLMProviderService 的服务标识符
 */
export const ILLMProviderServiceId: symbol = Symbol('ILLMProviderService');

