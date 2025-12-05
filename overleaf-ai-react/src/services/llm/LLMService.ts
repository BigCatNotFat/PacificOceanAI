/**
 * LLMService - Services 层实现（重构后）
 * 
 * 职责简化为：
 * - 发送 HTTP 请求
 * - 处理流式响应
 * - 解析 SSE 数据流
 * 
 * 不再负责：
 * - 厂商适配（移至 LLMProviderService）
 * - 参数转换（移至 LLMProviderService）
 * - 协议选择（移至 LLMProviderService）
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
import type { ILLMProviderService } from '../../platform/llm/ILLMProviderService';
import { ILLMProviderServiceId } from '../../platform/llm/ILLMProviderService';

/**
 * LLMService 实现
 */
@injectable(ILLMProviderServiceId)
export class LLMService implements ILLMService {
  /** 当前活跃的请求 */
  private activeRequests: Set<AbortController> = new Set();

  constructor(
    private readonly providerService: ILLMProviderService
  ) {
    console.log('[LLMService] 依赖注入成功', {
      hasProviderService: !!providerService
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
      messageCount: messages.length
    });

    // 创建事件发射器
    const onTokenEmitter = new Emitter<LLMDeltaChunk>();
    const onErrorEmitter = new Emitter<Error>();
    const onDoneEmitter = new Emitter<LLMFinalMessage>();

    // 创建取消控制器
    const abortController = new AbortController();
    this.activeRequests.add(abortController);

    // 异步执行流式请求
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
   * 检查模型是否可用
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    // 委托给 ProviderService
    try {
      const request = await this.providerService.buildRequestConfig(
        [{ role: 'user', content: 'test' }],
        { modelId, stream: false }
      );
      return !!request.endpoint;
    } catch {
      return false;
    }
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
      // 1. 通过 ProviderService 构建请求配置
      const request = await this.providerService.buildRequestConfig(messages, config);

      console.log('[LLMService] 请求配置:', {
        endpoint: request.endpoint,
        provider: request.provider
      });

      // 2. 发送 HTTP 请求
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM 请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      if (!response.body) {
        throw new Error('响应 body 为空，当前环境可能不支持流式读取');
      }

      // 3. 处理流式响应
      await this.processStreamResponse(
        response.body,
        request.provider,
        abortController,
        onTokenEmitter,
        onDoneEmitter
      );

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
   * 处理流式响应
   */
  private async processStreamResponse(
    body: ReadableStream<Uint8Array>,
    provider: string,
    abortController: AbortController,
    onTokenEmitter: Emitter<LLMDeltaChunk>,
    onDoneEmitter: Emitter<LLMFinalMessage>
  ): Promise<void> {
    const reader = body.getReader();
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

      // 解析 SSE 格式：data: {...}\n\n
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

          // 使用 ProviderService 解析数据块
          const parsed = this.providerService.parseStreamChunk(dataStr, provider as any);
          if (!parsed) {
            continue;
          }

          // 处理增量数据
          if (parsed.chunk) {
            const chunk = parsed.chunk;
            
            if (chunk.type === 'thinking' && chunk.delta) {
              accumulatedThinking = (accumulatedThinking || '') + chunk.delta;
              onTokenEmitter.fire(chunk);
            } else if (chunk.type === 'content' && chunk.delta) {
              accumulatedContent += chunk.delta;
              onTokenEmitter.fire(chunk);
            } else if (chunk.type === 'tool_call' && chunk.toolCall) {
              // 累积工具调用信息
              const index = 0; // 简化：暂时只支持单个工具调用
              if (!toolCallDeltas[index]) {
                toolCallDeltas[index] = { id: undefined, name: undefined, arguments: '' };
              }
              const target = toolCallDeltas[index];
              
              if (chunk.toolCall.id) target.id = chunk.toolCall.id;
              if (chunk.toolCall.name) target.name = chunk.toolCall.name;
              if (chunk.toolCall.arguments) {
                target.arguments += chunk.toolCall.arguments;
              }
              
              onTokenEmitter.fire(chunk);
            }
          }

          // 处理完成状态
          if (parsed.finishReason) {
            finishReason = parsed.finishReason;
          }
          if (parsed.usage) {
            usage = parsed.usage;
          }
        }
      }
    }

    // 发送完成事件
    if (!abortController.signal.aborted) {
      // 解析工具调用
      let finalToolCalls: LLMFinalMessage['toolCalls'] | undefined;
      if (toolCallDeltas.length > 0) {
        finalToolCalls = [];
        toolCallDeltas.forEach((tc, index) => {
          if (!tc) return;
          
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
   * 延时工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
