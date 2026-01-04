/**
 * ITextActionAIService - Platform 层接口定义
 * 
 * 负责处理文本操作（润色/扩写/缩写）的 AI 调用
 * 支持流式输出，与 TextActionService 配合使用
 */

import type { TextActionType } from './IPromptService';

// ==================== 类型定义 ====================

/**
 * 流式输出回调函数类型
 */
export type TextActionStreamCallback = (delta: string) => void;

/**
 * 文本操作 AI 调用选项
 */
export interface TextActionAIOptions {
  /** 操作类型 */
  action: TextActionType;
  /** 用户选中的原始文本 */
  text: string;
  /** 指定使用的模型 ID（可选，不指定则使用默认模型） */
  modelId?: string;
  /** 自定义提示词（仅当 action 为 'custom' 时使用） */
  customPrompt?: string;
  /** 流式输出回调（可选，如果提供则启用流式模式） */
  onStream?: TextActionStreamCallback;
  /** 思考过程流式输出回调（可选，用于 DeepSeek 等推理模型） */
  onThinkingStream?: TextActionStreamCallback;
  /** 中止信号（可选） */
  abortSignal?: AbortSignal;
}

/**
 * 文本操作 AI 调用结果
 */
export interface TextActionAIResult {
  /** 是否成功 */
  success: boolean;
  /** 处理后的文本（成功时返回） */
  resultText?: string;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 操作类型 */
  action: TextActionType;
  /** 原始文本 */
  originalText: string;
}

// ==================== Service 接口 ====================

/**
 * ITextActionAIService - 文本操作 AI 服务接口
 * 
 * 提供润色、扩写、缩写三种文本操作的 AI 调用能力
 * 支持流式输出，可用于实时预览 AI 生成的内容
 */
export interface ITextActionAIService {
  /**
   * 执行文本操作
   * 
   * @param options - 操作选项，包含操作类型、文本和可选的流式回调
   * @returns 操作结果
   * 
   * @example
   * // 非流式调用
   * const result = await service.execute({
   *   action: 'polish',
   *   text: 'Some text to polish'
   * });
   * 
   * @example
   * // 流式调用
   * const result = await service.execute({
   *   action: 'expand',
   *   text: 'Some text to expand',
   *   onStream: (delta) => {
   *     console.log('Received:', delta);
   *   }
   * });
   */
  execute(options: TextActionAIOptions): Promise<TextActionAIResult>;

  /**
   * 润色文本（快捷方法）
   */
  polish(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult>;

  /**
   * 扩写文本（快捷方法）
   */
  expand(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult>;

  /**
   * 缩写文本（快捷方法）
   */
  condense(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult>;
}

/**
 * ITextActionAIService 的服务标识符
 */
export const ITextActionAIServiceId: symbol = Symbol('ITextActionAIService');

