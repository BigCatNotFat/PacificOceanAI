/**
 * LLMService - Services 层实现
 * 
 * 负责调用底层 LLM API，包括：
 * - 根据 modelId 选择对应的 API（OpenAI/Anthropic/Google/DeepSeek）
 * - 处理流式响应
 * - 解析 thinking 标签
 * - 解析工具调用
 * - 错误处理和重试
 */

import { injectable } from '../../platform/instantiation/descriptors';
import { Emitter } from '../../base/common/event';
import type {
  ILLMService,
  LLMMessage,
  LLMConfig,
  StreamResponse,
  LLMDeltaChunk,
  LLMFinalMessage
} from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { 
  IModelRegistryService
} from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { 
  IConfigurationService
} from '../../platform/configuration/configuration';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';

/**
 * LLMService 实现
 */
@injectable(IConfigurationServiceId, IModelRegistryServiceId)
export class LLMService implements ILLMService {
  /** 当前活跃的请求 */
  private activeRequests: Set<AbortController> = new Set();

  constructor(
    private readonly configService: IConfigurationService,
    private readonly modelRegistry: IModelRegistryService
  ) {
    console.log('[LLMService] 依赖注入成功', {
      hasConfigService: !!configService,
      hasModelRegistry: !!modelRegistry
    });
  }

  // ==================== 公共方法 ====================

  /**
   * 流式调用 LLM
   */
  async streamResponse(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<StreamResponse> {
    console.log('[LLMService] 开始流式调用', {
      modelId: config.modelId,
      messageCount: messages.length,
      config
    });

    // 创建事件发射器
    const onTokenEmitter = new Emitter<LLMDeltaChunk>();
    const onErrorEmitter = new Emitter<Error>();
    const onDoneEmitter = new Emitter<LLMFinalMessage>();

    // 创建取消控制器
    const abortController = new AbortController();
    this.activeRequests.add(abortController);

    // 异步执行流式响应
    this.executeStreamRequest(
      messages,
      config,
      abortController,
      onTokenEmitter,
      onErrorEmitter,
      onDoneEmitter
    );

    return {
      onToken: onTokenEmitter.event,
      onError: onErrorEmitter.event,
      onDone: onDoneEmitter.event,
      cancel: () => {
        console.log('[LLMService] 取消请求');
        abortController.abort();
        this.activeRequests.delete(abortController);
      }
    };
  }

  /**
   * 非流式调用 LLM
   */
  async completeResponse(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    console.log('[LLMService] 开始非流式调用', {
      modelId: config.modelId,
      messageCount: messages.length
    });

    // TODO: 实现真实的 API 调用
    // 临时模拟
    await this.sleep(1000);
    
    return {
      content: '这是一个非流式响应（模拟）',
      finishReason: 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    };
  }

  /**
   * 检查模型是否可用
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    if (this.modelRegistry) {
      return this.modelRegistry.hasModel(modelId);
    }
    return false;
  }

  /**
   * 取消所有进行中的请求
   */
  cancelAll(): void {
    console.log(`[LLMService] 取消所有请求 (${this.activeRequests.size} 个)`);
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
  }

  // ==================== 私有方法 ====================

  /**
   * 解析并归一化 API 协议格式
   * 优先顺序：
   * 1. 调用时显式传入的 config.apiFormat
   * 2. ModelRegistry 中该模型的 provider
   * 3. 根据 modelId 前缀进行推断
   */
  private resolveApiFormat(config: LLMConfig): LLMConfig['apiFormat'] {
    let apiFormat = config.apiFormat as LLMConfig['apiFormat'] | 'google' | 'deepseek' | undefined;

    // 1. 兼容旧值：'google' / 'deepseek' 统一归为 openai 兼容协议
    if (apiFormat === 'google' || apiFormat === 'deepseek') {
      apiFormat = 'openai-compatible';
    }

    // 2. 从模型注册表中读取 provider（只关心协议层，不关心真实底层厂商）
    if (!apiFormat && this.modelRegistry) {
      const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
      if (modelInfo) {
        switch (modelInfo.provider) {
          case 'openai':
          case 'openai-compatible':
          case 'anthropic':
            apiFormat = modelInfo.provider;
            break;
          default:
            apiFormat = 'custom';
            break;
        }
      }
    }

    // 3. 最后兜底：根据 modelId 前缀简单推断
    if (!apiFormat) {
      apiFormat = this.getProvider(config.modelId) as LLMConfig['apiFormat'];
    }

    // 如果还没有，默认按 OpenAI 兼容处理
    return apiFormat || 'openai-compatible';
  }

  /**
   * 执行流式请求
   */
  private async executeStreamRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onErrorEmitter: Emitter<Error>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    try {
      // 1. 统一解析 API 协议格式
      let apiFormat = this.resolveApiFormat(config);

      // 2. 如果用户提供了自定义端点，且不是 Claude，则统一按 OpenAI 兼容处理
      if (config.apiEndpoint) {
        console.log(`[LLMService] 使用自定义端点: ${config.apiEndpoint}`);
        if (apiFormat !== 'anthropic') {
          apiFormat = 'openai-compatible';
        }
      }

      // 3. 根据协议格式调用对应的 API
      switch (apiFormat) {
        case 'anthropic':
        case 'openai':
        case 'openai-compatible':
        case 'custom':
        default:
          await this.callOpenAIStreaming(messages, config, abortController, onTokenEmitter, onDoneEmitter);
          break;
      }

      // 请求完成，移除记录
      this.activeRequests.delete(abortController);

    } catch (error) {
      console.error('[LLMService] 流式请求失败:', error);
      
      if (abortController.signal.aborted) {
        console.log('[LLMService] 请求已取消');
      } else {
        onErrorEmitter.fire(error instanceof Error ? error : new Error(String(error)));
      }
      
      this.activeRequests.delete(abortController);
    }
  }

  /**
   * 获取模型提供商
   */
  private getProvider(modelId: string): string {
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1')) {
      return 'openai';
    }
    if (modelId.startsWith('claude-')) {
      return 'anthropic';
    }
    if (modelId.startsWith('gemini-')) {
      return 'openai-compatible';
    }
    if (modelId.startsWith('deepseek-')) {
      return 'openai-compatible';
    }
    return 'openai-compatible';
  }

  /**
   * 统一构建 OpenAI 兼容接口的配置（包括 DeepSeek 等 OpenAI 兼容服务）
   */
  private async getOpenAIRequestConfig(config: LLMConfig): Promise<{ apiKey: string; endpoint: string }> {
    let apiKey = '';
    let baseUrl = '';
    
    if (this.configService) {
      const apiConfig = await this.configService.getAPIConfig();
      if (apiConfig) {
        apiKey = apiConfig.apiKey;
        baseUrl = apiConfig.baseUrl;
        console.log('[LLMService] 使用用户配置:', {
          baseUrl,
          hasApiKey: !!apiKey
        });
      }
    }
    
    // 优先级：config.apiEndpoint > 用户配置的 baseUrl > 默认值
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const endpoint = config.apiEndpoint || `${normalizedBaseUrl}/chat/completions`;
    
    console.log('[LLMService] 调用 OpenAI 兼容 API', {
      endpoint,
      modelId: config.modelId,
      isCustomEndpoint: !!config.apiEndpoint,
      isUserConfigured: !!this.configService
    });
    
    if (!apiKey) {
      throw new Error('API Key 未配置，请在设置中配置 API Key');
    }

    return { apiKey, endpoint };
  }
  
  /**
   * 调用 OpenAI API（或兼容的自定义端点）
   */
  private async callOpenAI(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
      onTokenEmitter: Emitter<LLMDeltaChunk>,
      onDoneEmitter: Emitter<LLMFinalMessage>
    ): Promise<void> {
      // 1. 获取用户配置
    let apiKey = '';
    let baseUrl = '';
    
    if (this.configService) {
      const apiConfig = await this.configService.getAPIConfig();
      if (apiConfig) {
        apiKey = apiConfig.apiKey;
        baseUrl = apiConfig.baseUrl;
        console.log('[LLMService] 使用用户配置:', {
          baseUrl,
          hasApiKey: !!apiKey
        });
      }
    }
    
    // 2. 确定 API 端点
    // 优先级：config.apiEndpoint > 用户配置的 baseUrl > 默认值
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const endpoint = config.apiEndpoint || `${normalizedBaseUrl}/chat/completions`;
    
    console.log('[LLMService] 调用 OpenAI 兼容 API', {
      endpoint,
      modelId: config.modelId,
      isCustomEndpoint: !!config.apiEndpoint,
      isUserConfigured: !!this.configService
    });
    
    // 3. 检查 API Key
    if (!apiKey) {
      throw new Error('API Key 未配置，请在设置中配置 API Key');
    }
    
    // TODO: 实现真实的 API 调用
    // const response = await fetch(endpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${apiKey}`
    //   },
    //   body: JSON.stringify({
    //     model: config.modelId,
    //     messages: messages,
    //     temperature: config.temperature,
    //     max_tokens: config.maxTokens,
    //     stream: true
    //   }),
    //   signal: abortController.signal
    // });
    //
    // // 解析 SSE 流
    // const reader = response.body.getReader();
    // const decoder = new TextDecoder();
    // while (true) {
    //   const { done, value } = await reader.read();
    //   if (done) break;
    //   const text = decoder.decode(value);
    //   // 解析 data: {...} 格式
    //   // 发送 token 事件
    // }

    // 临时：模拟流式响应
    const simulateText = `使用配置的端点: ${endpoint}\n\nAPI Key: ${apiKey.substring(0, 10)}...\n\n这是模拟响应，真实 API 调用已准备好，取消注释即可使用。`;
    
      await this.simulateStreamingResponse(
        simulateText,
        onTokenEmitter,
        onDoneEmitter,
        abortController
      );
    }

  /**
   * 调用 OpenAI 兼容 API 的真实流式接口（包括 DeepSeek 等）
   */
  private async callOpenAIStreaming(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    const { apiKey, endpoint } = await this.getOpenAIRequestConfig(config);

    const payload: any = {
      model: config.modelId,
      messages,
      stream: true
    };

    if (typeof config.temperature === 'number') {
      payload.temperature = config.temperature;
    }
    if (typeof config.topP === 'number') {
      payload.top_p = config.topP;
    }
    if (typeof config.maxTokens === 'number') {
      // 优先从调用配置或模型注册表中读取底层字段名，默认使用 max_tokens
      const modelInfo = this.modelRegistry?.getModelInfo(config.modelId);
      const maxTokensParamName =
        (config as any).maxTokensParamName ||
        (modelInfo?.defaultConfig as any)?.maxTokensParamName ||
        'max_tokens';

      payload[maxTokensParamName] = config.maxTokens;
    }

    // 工具调用：如果上层传入了 tools / tool_choice，则透传给 OpenAI 兼容接口
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;

      const toolChoice = (config as any).tool_choice;
      if (toolChoice) {
        payload.tool_choice = toolChoice;
      }
    }

    // DeepSeek v3.2 等推理模型的 thinking 开关
    // 等价于 Python SDK 中的 extra_body={"thinking": {"type": "enabled"}}
    const thinking = (config as any).thinking;
    if (thinking) {
      payload.thinking = thinking;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM 请求失败 (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('响应 body 为空，当前环境可能不支持流式读取');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let accumulatedContent = '';
    let accumulatedThinking: string | undefined;
    let finishReason: LLMFinalMessage['finishReason'] | undefined;
    let usage: LLMFinalMessage['usage'] | undefined;
    // 累积工具调用的增量片段（按 index 存储）
    const toolCallDeltas: Array<{ id?: string; name?: string; arguments: string }> = [];
    let buffer = '';

    while (true) {
      if (abortController.signal.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        console.log('[LLMService] 请求已通过 AbortController 取消');
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const lines = rawEvent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) {
            continue;
          }
          if (!trimmed.startsWith('data:')) {
            continue;
          }

          const dataStr = trimmed.slice('data:'.length).trim();
          if (!dataStr || dataStr === '[DONE]') {
            finishReason = finishReason || 'stop';
            break;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch (err) {
            console.warn('[LLMService] 解析 SSE 数据失败:', err, dataStr);
            continue;
          }

          const choice = parsed.choices?.[0];
          const delta = choice?.delta;

          // DeepSeek 等推理模型可能使用 reasoning_content 字段承载思考内容
          const reasoningDelta = (delta as any)?.reasoning_content;
          if (reasoningDelta) {
            const text = String(reasoningDelta);
            accumulatedThinking = (accumulatedThinking || '') + text;
            onTokenEmitter.fire({
              delta: text,
              type: 'thinking'
            });
          }

          if (delta?.content) {
            const text = String(delta.content);
            accumulatedContent += text;
            onTokenEmitter.fire({
              delta: text,
              type: 'content'
            });
          }

          // 工具调用增量：OpenAI Chat Completions 在 delta.tool_calls 中返回
          const toolCallsDelta = (delta as any)?.tool_calls;
          if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
            for (const tcDelta of toolCallsDelta) {
              const index = typeof tcDelta.index === 'number' ? tcDelta.index : 0;
              if (!toolCallDeltas[index]) {
                toolCallDeltas[index] = { id: undefined, name: undefined, arguments: '' };
              }
              const target = toolCallDeltas[index];

              if (tcDelta.id) {
                target.id = tcDelta.id;
              }

              const fn = tcDelta.function;
              if (fn?.name) {
                target.name = fn.name;
              }
              const argsDelta = typeof fn?.arguments === 'string' ? fn.arguments : '';
              if (argsDelta) {
                target.arguments = (target.arguments || '') + argsDelta;

                // 向上层发出工具调用增量事件（可选，用于调试或 UI 展示）
                onTokenEmitter.fire({
                  delta: argsDelta,
                  type: 'tool_call',
                  toolCall: {
                    id: target.id,
                    name: target.name,
                    arguments: target.arguments
                  }
                });
              }
            }
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason as LLMFinalMessage['finishReason'];
          }

          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? 0,
              totalTokens: parsed.usage.total_tokens ?? 0
            };
          }
        }
      }
    }

    if (!abortController.signal.aborted) {
      try {
        // 对于使用 <thinking> 标签的模型，从 content 中再尝试解析一次
        const { thinking } = this.extractThinkingFromContent(accumulatedContent);
        if (thinking && !accumulatedThinking) {
          accumulatedThinking = thinking;
        }
      } catch (err) {
        console.warn('[LLMService] 解析思考内容时出错:', err);
      }

      if (accumulatedThinking) {
        console.log('[LLMService] 解析到思考内容:', accumulatedThinking);
      }

      // 将累积的工具调用增量整理为最终的 toolCalls 列表
      let finalToolCalls: LLMFinalMessage['toolCalls'] | undefined;
      if (toolCallDeltas.length > 0) {
        finalToolCalls = [];
        toolCallDeltas.forEach((tc, index) => {
          if (!tc) {
            return;
          }
          const rawArgs = (tc.arguments || '').trim();
          let parsedArgs: Record<string, any> = {};
          if (rawArgs) {
            try {
              parsedArgs = JSON.parse(rawArgs);
            } catch (err) {
              console.warn('[LLMService] 解析工具调用参数失败:', err, rawArgs);
            }
          }

          finalToolCalls!.push({
            id: tc.id || String(index),
            name: tc.name || '',
            arguments: parsedArgs
          });
        });
      }

      onDoneEmitter.fire({
        content: accumulatedContent,
        thinking: accumulatedThinking,
        toolCalls: finalToolCalls,
        finishReason: finishReason || 'stop',
        usage
      });
    }
  }

  /**
   * 调用 Anthropic API（模拟实现）
   */
  private async callAnthropic(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    console.log('[LLMService] 调用 Anthropic API (模拟)');
    
    await this.simulateStreamingResponse(
      'Claude 模拟响应：这是一个模拟的 Claude 回复。',
      onTokenEmitter,
      onDoneEmitter,
      abortController
    );
  }

  /**
   * 调用 Google API（模拟实现）
   */
  private async callGoogle(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    console.log('[LLMService] 调用 Google API (模拟)');
    
    await this.simulateStreamingResponse(
      'Gemini 模拟响应：这是一个模拟的 Gemini 回复。',
      onTokenEmitter,
      onDoneEmitter,
      abortController
    );
  }

  /**
   * 调用 DeepSeek API（模拟实现）
   */
  private async callDeepSeek(
    messages: LLMMessage[],
    config: LLMConfig,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    console.log('[LLMService] 调用 DeepSeek API (OpenAI 兼容模式)');

    // DeepSeek 提供 OpenAI 兼容接口，这里复用 OpenAI 的真实流式实现
    await this.callOpenAIStreaming(
      messages,
      config,
      abortController,
      onTokenEmitter,
      onDoneEmitter
    );
  }

  /**
   * 模拟流式响应（临时实现）
   */
  private async simulateStreamingResponse(
    fullResponse: string,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>,
    abortController: AbortController
  ): Promise<void> {
    let accumulatedContent = '';

    // 逐字发送 token
    for (let i = 0; i < fullResponse.length; i++) {
      if (abortController.signal.aborted) {
        console.log('[LLMService] 流式响应被取消');
        return;
      }

      const char = fullResponse[i];
      accumulatedContent += char;

      // 发送增量 token
      onTokenEmitter.fire({
        delta: char,
        type: 'content'
      });

      // 模拟网络延迟
      await this.sleep(30);
    }

    // 发送完成事件
    if (!abortController.signal.aborted) {
      onDoneEmitter.fire({
        content: accumulatedContent,
        finishReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: accumulatedContent.length,
          totalTokens: 100 + accumulatedContent.length
        }
      });
    }
  }

  /**
   * 延时工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 从完整文本中解析 <thinking>...</thinking> 段落
   * 目前仅用于日志打印，不改变对外返回的 content
   */
  private extractThinkingFromContent(
    fullText: string
  ): { thinking?: string; visibleContent: string } {
    if (!fullText) {
      return { visibleContent: '' };
    }

    const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/i;
    const match = thinkingRegex.exec(fullText);

    if (!match) {
      return { visibleContent: fullText };
    }

    const thinking = match[1].trim();
    const before = fullText.slice(0, match.index);
    const after = fullText.slice(match.index + match[0].length);
    const visibleContent = `${before}${after}`;

    return { thinking, visibleContent };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.cancelAll();
  }
}

// 导出服务标识符
export { ILLMServiceId };
