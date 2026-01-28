/**
 * GeminiProvider - Google Gemini API 提供者
 *
 * 职责：
 * - 完整的 Gemini 客户端实现（使用 OpenAI 兼容接口）
 * - 接收历史上下文（messages + config）
 * - 内部构建请求并发送给 Gemini API
 * - 流式接收响应，实时解析
 * - 每收到一个 chunk，立即通过 UIStreamService 更新 UI
 * - 等流式完成后，返回完整的最终结果
 * 
 * Gemini 特性：
 * - 使用 OpenAI 兼容接口
 * - 支持思考过程（Gemini thinking + thought summaries）
 * - 需要特殊处理 thinking_config / thought_signature
 */

import type { LLMMessage, LLMConfig, LLMFinalMessage } from '../../../platform/llm/ILLMService';
import type { IModelRegistryService } from '../../../platform/llm/IModelRegistryService';
import { BaseLLMProvider, type APIConfig } from './BaseLLMProvider';
import type { IUIStreamService } from '../../../platform/agent/IUIStreamService';
import { isAgentDebugEnabled, logger } from '../../../utils/logger';

export class GeminiProvider extends BaseLLMProvider {
  /**
   * Gemini 3 要求：当 assistant 产生 tool_calls 后，后续请求必须把每个 tool_call 的
   * extra_content.google.thought_signature 原样回传，否则会 400。
   *
   * 但上层 PromptService/AgentService 当前不会透传 extra_content；
   * 因此在 Provider 内部做一个轻量缓存，在下一轮请求发送前把签名补回到 messages[].tool_calls。
   */
  private readonly toolCallExtraContentCache = new Map<
    string,
    Map<string, any>
  >();

  constructor(
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService,
    private readonly apiConfig: APIConfig
  ) {
    super();
  }

  /**
   * 唯一公共接口：发送请求并返回完整结果
   * @param messages - 历史上下文消息列表
   * @param config - LLM 配置
   * @returns 完整的最终响应
   */
  async chat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    logger.debug('[GeminiProvider] chat() called', {
      messageCount: messages.length,
      hasUIStreamMeta: !!config.uiStreamMeta,
      conversationId: config.uiStreamMeta?.conversationId,
      messageId: config.uiStreamMeta?.messageId,
      hasUIStreamService: !!this.uiStreamService
    });

    // 🔑 Gemini 3: 补回上轮 tool_calls 的 thought_signature（如果上层没透传 extra_content）
    const conversationId = config.uiStreamMeta?.conversationId;
    if (conversationId) {
      this.hydrateToolCallExtraContent(messages, conversationId);
    }

    // 1. 构建请求
    const { endpoint, headers, body } = this.buildRequest(messages, config);

    // 2. 发送 HTTP 请求
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 流式解析响应
    return await this.parseStreamResponse(response, config);
  }

  /**
   * Manager 聊天接口 - 用于 MultiAgent 模式的 ManagerAgent
   * 
   * 与 chat 的区别：
   * - 不流式输出
   * - 不更新 UI
   * - 只返回结果
   */
  async managerChat(messages: LLMMessage[], config: LLMConfig): Promise<LLMFinalMessage> {
    logger.debug('[GeminiProvider] managerChat() called', {
      messageCount: messages.length,
      modelId: config.modelId
    });

    // 补回上轮 tool_calls 的 thought_signature
    const conversationId = config.uiStreamMeta?.conversationId;
    if (conversationId) {
      this.hydrateToolCallExtraContent(messages, conversationId);
    }

    // 1. 构建请求（非流式）
    const { endpoint, headers, body } = this.buildRequest(messages, config, false);

    // 2. 发送 HTTP 请求
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as any).abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    // 3. 解析非流式响应
    const data = await response.json();
    return this.parseNonStreamResponse(data, conversationId);
  }

  /**
   * 解析非流式响应
   */
  private parseNonStreamResponse(data: any, conversationId?: string): LLMFinalMessage {
    const choice = data?.choices?.[0];
    if (!choice) {
      throw new Error('无效的 API 响应');
    }

    const message = choice.message;
    const result: LLMFinalMessage = {
      content: message?.content || '',
      finishReason: choice.finish_reason as LLMFinalMessage['finishReason']
    };

    // 处理推理内容
    if (message?.reasoning_content) {
      result.thinking = message.reasoning_content;
    }

    // 处理工具调用
    if (message?.tool_calls && message.tool_calls.length > 0) {
      result.toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || '',
        arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
      }));

      // Gemini 3: 非流式也要缓存 tool_call.extra_content（尤其 thought_signature），供下一轮回传
      if (conversationId) {
        for (const tc of message.tool_calls) {
          if (!tc?.id) continue;
          const extra = tc?.extra_content ?? tc?.function?.extra_content;
          const thoughtSig =
            tc?.thought_signature ??
            tc?.function?.thought_signature ??
            tc?.extra_content?.google?.thought_signature ??
            tc?.function?.extra_content?.google?.thought_signature;

          if (extra || thoughtSig) {
            const cacheObj: any = (extra && typeof extra === 'object') ? { ...extra } : {};
            if (thoughtSig) {
              cacheObj.google = cacheObj.google || {};
              cacheObj.google.thought_signature = thoughtSig;
            }
            this.rememberToolCallExtraContent(conversationId, tc.id, cacheObj);
          }
        }
      }
    }

    // 处理使用统计
    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0
      };
    }

    return result;
  }

  /**
   * 构建 Gemini 请求配置（内部方法）
   */
  private buildRequest(
    messages: LLMMessage[],
    config: LLMConfig,
    stream: boolean = true
  ): { endpoint: string; headers: Record<string, string>; body: any } {
    const modelInfo = this.modelRegistry.getModelInfo(config.modelId);
    const maxTokensParamName = 
      (modelInfo?.defaultConfig as any)?.maxTokensParamName || 'max_tokens';

    const payload = this.buildBasePayload(messages, config);
    
    // 设置流式参数
    payload.stream = stream;

    // 设置 max_tokens 参数
    if (typeof config.maxTokens === 'number') {
      payload[maxTokensParamName] = config.maxTokens;
    }

    // 工具调用
    const tools = (config as any).tools;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      const toolChoice = (config as any).tool_choice;
      if (toolChoice) {
        payload.tool_choice = toolChoice;
      }
    }

    // 🔑 Gemini 特定参数：启用思考过程输出
    // 如果模型支持推理能力，自动启用 thinking_config
    // 官方：include_thoughts 会让响应中包含 thought summaries（在 parts 上打 thought 标记）
    if (modelInfo?.capabilities?.supportsReasoning) {
      payload.extra_body = {
        google: {
          thinking_config: {
            include_thoughts: true
          }
        }
      };
      logger.debug('[GeminiProvider] 已启用思考过程输出', { modelId: config.modelId });
    }

    // 确保 API 端点格式正确
    const normalizedBaseUrl = this.apiConfig.baseUrl.endsWith('/') 
      ? this.apiConfig.baseUrl.slice(0, -1) 
      : this.apiConfig.baseUrl;

    return {
      endpoint: config.apiEndpoint || `${normalizedBaseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiConfig.apiKey}`
      },
      body: payload
    };
  }

  /**
   * 解析流式响应（内部方法）
   * 
   * Gemini 思考/回复拆分规则（参考 OpenAI 兼容流式网关）：
   * - `delta.reasoning_content` -> 思考内容（thinking）
   * - `delta.content` -> 根据 `delta.extra_content.google.thought` 判定：
   *   - truthy（true/1/"true"）-> 思考内容（thinking）
   *   - 否则 -> 最终回复（content）
   */
  private async parseStreamResponse(
    response: Response,
    config: LLMConfig
  ): Promise<LLMFinalMessage> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    const conversationId = config.uiStreamMeta?.conversationId;
    const messageId = config.uiStreamMeta?.messageId;

    // 累积完整内容
    let fullContent = '';
    let fullThinking = '';
    // 使用 index 作为稳定 key：避免流式 chunk 缺失 id 时将同一 tool call 拆成两条
    const toolCallsMap = new Map<
      string,
      { id: string; name: string; args: string; extra_content?: any }
    >();
    
    let finishReason: LLMFinalMessage['finishReason'];
    let usage: LLMFinalMessage['usage'];
    
    // 可开关 debug：localStorage.setItem('overleaf_ai_debug_gemini_stream','1')
    const debugGeminiStream =
      isAgentDebugEnabled() &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('overleaf_ai_debug_gemini_stream') === '1';
    // 输出完整原始文本（包含 <thought> 标签）：localStorage.setItem('overleaf_ai_debug_gemini_stream_text','1')
    const debugGeminiStreamText =
      isAgentDebugEnabled() &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('overleaf_ai_debug_gemini_stream_text') === '1';
    let debugDeltaCount = 0;
    // 自动诊断：缓存少量原始 SSE data，便于定位“开头缺字/思考缺失”
    const rawSseSamples: Array<{
      dataStr: string;
      parsedKeys?: string[];
      deltaKeys?: string[];
      contentPreview?: string;
      reasoningPreview?: string;
      extraGoogleKeys?: string[];
      extraGooglePreview?: any;
    }> = [];
    const pushRawSample = (sample: (typeof rawSseSamples)[number]) => {
      if (rawSseSamples.length < 30) rawSseSamples.push(sample);
    };

    // 兼容：部分上游会用 <thought>...</thought> 包裹思考内容，这里统一剥离标签，避免渲染到 UI。
    const stripThoughtTags = (text: string): string => {
      if (!text) return '';
      return text.replace(/<\/?thought\b[^>]*>/gi, '');
    };

    try {
      let buffer = '';

      const emitThinking = (text: string) => {
        if (!text) return;
        const nextText = stripThoughtTags(text);
        if (!nextText) return;
        // 轻量去重：避免同一段 thinking 被重复写入（常见于 reasoning_content 与 thought summary 重叠）
        if (fullThinking.endsWith(nextText)) return;
        fullThinking += nextText;
        if (this.uiStreamService && messageId) {
          this.uiStreamService.pushThinking({
            conversationId,
            messageId,
            delta: nextText
          });
        }
      };

      const emitContent = (text: string) => {
        if (!text) return;
        // 防御：有些网关/模型会把首段 content 以 ", " 开头（看起来像“被截断”）
        // 这里仅在“正文尚未开始”时做一次非常保守的清洗。
        let nextText = stripThoughtTags(text);
        if (!nextText) return;
        if (!fullContent) {
          nextText = nextText.replace(/^\s*[，,]\s+/, '');
        }
        if (!nextText) return;

        fullContent += nextText;
        if (this.uiStreamService && messageId) {
          this.uiStreamService.pushContent({
            conversationId,
            messageId,
            delta: nextText
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // SSE 兼容：既可能是 "data: {...}" 也可能是 "data:{...}"（无空格）
          if (!trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trimStart();
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed?.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Debug：抓前若干个 delta 的形状，方便定位 thought 字段实际在哪里
            let debugN: number | null = null;
            if (debugGeminiStream && debugDeltaCount < 20) {
              debugN = ++debugDeltaCount;
              const extraGoogle = (delta as any)?.extra_content?.google;
              logger.debug('[GeminiProvider][debug] delta snapshot', {
                n: debugN,
                deltaKeys: delta ? Object.keys(delta) : [],
                finish_reason: choice.finish_reason,
                hasContent: typeof (delta as any)?.content === 'string' && (delta as any).content.length > 0,
                contentPreview: typeof (delta as any)?.content === 'string' ? (delta as any).content.slice(0, 120) : undefined,
                reasoning_content_preview: typeof (delta as any)?.reasoning_content === 'string'
                  ? (delta as any).reasoning_content.slice(0, 120)
                  : undefined,
                extra_google_keys: extraGoogle ? Object.keys(extraGoogle) : [],
                extra_google_preview: extraGoogle
              });
            }

            // 自动缓存原始片段（只存很少），便于用户直接贴日志定位
            if (rawSseSamples.length < 30) {
              const extraGoogle = (delta as any)?.extra_content?.google;
              pushRawSample({
                dataStr,
                parsedKeys: parsed ? Object.keys(parsed) : undefined,
                deltaKeys: delta ? Object.keys(delta) : undefined,
                contentPreview: typeof (delta as any)?.content === 'string' ? (delta as any).content.slice(0, 200) : undefined,
                reasoningPreview: typeof (delta as any)?.reasoning_content === 'string' ? (delta as any).reasoning_content.slice(0, 200) : undefined,
                extraGoogleKeys: extraGoogle ? Object.keys(extraGoogle) : undefined,
                extraGooglePreview: extraGoogle
              });
            }

            // 1) reasoning_content -> 思考（thinking）
            const reasoningDeltaRaw = (delta as any)?.reasoning_content;
            if (debugGeminiStreamText && reasoningDeltaRaw != null && reasoningDeltaRaw !== '') {
              logger.debug('[GeminiProvider][debug][raw] reasoning_content', reasoningDeltaRaw);
            }
            const reasoningDelta =
              typeof reasoningDeltaRaw === 'string'
                ? stripThoughtTags(reasoningDeltaRaw)
                : reasoningDeltaRaw != null && reasoningDeltaRaw !== ''
                  ? stripThoughtTags(String(reasoningDeltaRaw))
                  : '';
            const hasReasoningDelta = reasoningDelta.length > 0;
            if (hasReasoningDelta) {
              emitThinking(reasoningDelta);
            }

            // 2) content -> 根据 extra_content.google.thought 判定是思考还是最终回复
            const contentRaw = (delta as any)?.content;
            if (!hasReasoningDelta && typeof contentRaw === 'string' && contentRaw) {
              if (debugGeminiStreamText) {
                logger.debug('[GeminiProvider][debug][raw] content', contentRaw);
              }
              const thoughtFlag = (delta as any)?.extra_content?.google?.thought;
              const isThought =
                thoughtFlag === true ||
                thoughtFlag === 1 ||
                (typeof thoughtFlag === 'string' && thoughtFlag.toLowerCase() === 'true');

              if (isThought) {
                emitThinking(contentRaw);
              } else {
                emitContent(contentRaw);
              }

              if (debugN != null) {
                logger.debug('[GeminiProvider][debug] route decision', {
                  n: debugN,
                  isThought,
                  thoughtFlag
                });
              }
            }

            // 处理工具调用
            const toolCallsDelta = (delta as any)?.tool_calls;
            if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
              for (const tcDelta of toolCallsDelta) {
                const index = tcDelta.index ?? 0;
                const stableKey = `tool_call_${index}`;
                const apiId = tcDelta.id;
                const name = tcDelta.function?.name;
                const argsText = tcDelta.function?.arguments || '';

                let existing = toolCallsMap.get(stableKey);
                if (!existing) {
                  existing = { id: apiId || stableKey, name: name || '', args: '' };
                  toolCallsMap.set(stableKey, existing);
                }

                if (apiId) existing.id = apiId;
                if (name) existing.name = name;
                existing.args += argsText;

                // Gemini 3: thought_signature 通常在 tcDelta.extra_content.google.thought_signature
                const extraFromDelta =
                  tcDelta?.extra_content ??
                  tcDelta?.function?.extra_content ??
                  undefined;
                const thoughtSig =
                  tcDelta?.thought_signature ??
                  tcDelta?.function?.thought_signature ??
                  tcDelta?.extra_content?.google?.thought_signature ??
                  tcDelta?.function?.extra_content?.google?.thought_signature;

                if (extraFromDelta || thoughtSig) {
                  if (!existing.extra_content) existing.extra_content = {};
                  if (extraFromDelta && typeof extraFromDelta === 'object') {
                    this.deepMerge(existing.extra_content, extraFromDelta);
                  }
                  if (thoughtSig) {
                    if (!existing.extra_content.google) existing.extra_content.google = {};
                    existing.extra_content.google.thought_signature = thoughtSig;
                  }

                  // 缓存，供下一轮请求补全 messages[].tool_calls
                  if (conversationId) {
                    const cacheObj = existing.extra_content;
                    // 既存 stableKey 也存 apiId，增加命中率（上层可能用任意一种作为 tool_call_id）
                    this.rememberToolCallExtraContent(conversationId, stableKey, cacheObj);
                    if (existing.id) this.rememberToolCallExtraContent(conversationId, existing.id, cacheObj);
                    if (apiId) this.rememberToolCallExtraContent(conversationId, apiId, cacheObj);
                  }
                }

                if (this.uiStreamService && messageId) {
                  this.uiStreamService.pushToolCall({
                    conversationId,
                    messageId,
                    toolCallId: existing.id,
                    phase: 'args',
                    name: existing.name,
                    argsDelta: argsText
                  });
                }
              }
            }

            // 处理完成原因
            if (choice.finish_reason) {
              finishReason = choice.finish_reason as LLMFinalMessage['finishReason'];
            }

            // 处理使用统计
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0
              };
            }
          } catch (err) {
            console.warn('[GeminiProvider] 解析流数据失败:', err);
            // JSON 解析失败时，也缓存一条原始数据，方便定位中转格式问题
            pushRawSample({ dataStr });
          }
        }
      }

      // 自动异常诊断输出：当没有思考且正文像被截断（以逗号开头）时，打印前几个 raw SSE 片段
      const contentTrimmed = (fullContent || '').trimStart();
      const looksTruncated = contentTrimmed.startsWith(',') || contentTrimmed.startsWith('，');
      if (!fullThinking && looksTruncated && rawSseSamples.length > 0) {
        // 将诊断信息写入 localStorage，便于用户在页面控制台直接复制。
        // 注意：content script 是隔离世界，window 挂载的对象在页面控制台拿不到。
        const diag = {
          ts: Date.now(),
          modelId: config.modelId,
          samples: rawSseSamples,
          fullContentPreview: fullContent.slice(0, 500),
          fullThinkingPreview: fullThinking.slice(0, 500)
        };
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('overleaf_ai_gemini_diag', JSON.stringify(diag));
          }
        } catch {
          // ignore
        }
        console.warn('[GeminiProvider][diagnostic] thinking is empty and content looks truncated. First SSE samples:', {
          samples: rawSseSamples.slice(0, 12),
          fullContentPreview: fullContent.slice(0, 200),
          // 用户可在页面控制台运行：localStorage.getItem('overleaf_ai_gemini_diag')
          diagKey: 'overleaf_ai_gemini_diag'
        });
      }

      // 发送完成信号给 UI
      if (this.uiStreamService && messageId) {
        if (fullThinking) {
          this.uiStreamService.pushThinking({
            conversationId,
            messageId,
            delta: '',
            done: true
          });
        }
        if (fullContent) {
          this.uiStreamService.pushContent({
            conversationId,
            messageId,
            delta: '',
            done: true
          });
        }
        for (const [, tc] of toolCallsMap) {
          this.uiStreamService.pushToolCall({
            conversationId,
            messageId,
            toolCallId: tc.id,
            phase: 'end'
          });
        }
      }

      // 构建最终结果
      const result: LLMFinalMessage = {
        content: fullContent,
        finishReason,
        usage
      };

      if (fullThinking) {
        result.thinking = fullThinking;
      }

      if (toolCallsMap.size > 0) {
        result.toolCalls = Array.from(toolCallsMap.values())
          .filter(tc => typeof tc.name === 'string' && tc.name.trim().length > 0)
          .map(tc => {
            let parsedArgs: Record<string, any> = {};
            if (tc.args) {
              try {
                parsedArgs = JSON.parse(tc.args);
              } catch {
                try {
                  parsedArgs = JSON.parse(tc.args + '}');
                } catch {
                  parsedArgs = {};
                }
              }
            }
            return {
              id: tc.id,
              name: tc.name,
              arguments: parsedArgs
            };
          });
      }

      return result;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 将 src 合并进 dst（递归合并对象），用于聚合 streaming extra_content。
   */
  private deepMerge(dst: Record<string, any>, src: Record<string, any>): Record<string, any> {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        this.deepMerge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  }

  /**
   * 记忆 tool_call 对应的 extra_content（尤其是 thought_signature）。
   * 做简单的上限裁剪，避免长会话无限增长。
   */
  private rememberToolCallExtraContent(conversationId: string, toolCallId: string, extra: any) {
    if (!conversationId || !toolCallId || !extra) return;
    let m = this.toolCallExtraContentCache.get(conversationId);
    if (!m) {
      m = new Map<string, any>();
      this.toolCallExtraContentCache.set(conversationId, m);
    }
    m.set(toolCallId, extra);

    // 简单裁剪：每个 conversation 保留最近 200 个 tool call 额外信息
    const MAX = 200;
    if (m.size > MAX) {
      const firstKey = m.keys().next().value;
      if (firstKey) m.delete(firstKey);
    }
  }

  /**
   * 在发送请求前，补全历史 messages[].tool_calls[*].extra_content.google.thought_signature
   * 以满足 Gemini 3 的强制校验。
   */
  private hydrateToolCallExtraContent(messages: LLMMessage[], conversationId: string) {
    const cache = this.toolCallExtraContentCache.get(conversationId);
    if (!cache || cache.size === 0) return;

    for (const msg of messages) {
      const toolCalls = (msg as any)?.tool_calls;
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) continue;

      for (const tc of toolCalls) {
        if (!tc?.id) continue;
        const cached = cache.get(tc.id);
        if (!cached) continue;

        // 只在缺失时注入，避免覆盖上层显式传入的 extra_content
        if (!(tc as any).extra_content) {
          (tc as any).extra_content = cached;
        } else if (cached && typeof cached === 'object') {
          try {
            this.deepMerge((tc as any).extra_content, cached);
          } catch {
            // ignore
          }
        }

        // Gemini 3 / Vertex AI: 某些网关会强校验 tool_call 的 thought_signature 字段本身，
        // 仅在 extra_content.google.thought_signature 存在还不够（会 400）。
        // 因此这里把签名同时“镜像”到常见位置：tc.thought_signature / tc.function.thought_signature。
        const thoughtSig =
          (tc as any)?.thought_signature ??
          (tc as any)?.function?.thought_signature ??
          (tc as any)?.extra_content?.google?.thought_signature;

        const cachedThoughtSig =
          (cached as any)?.google?.thought_signature ??
          (cached as any)?.extra_content?.google?.thought_signature;

        const finalThoughtSig = thoughtSig || cachedThoughtSig;
        if (finalThoughtSig) {
          // 顶层
          if (!(tc as any).thought_signature) {
            (tc as any).thought_signature = finalThoughtSig;
          }
          // function 层（OpenAI tool_calls 结构常见）
          if ((tc as any).function && !(tc as any).function.thought_signature) {
            (tc as any).function.thought_signature = finalThoughtSig;
          }
          // extra_content 层（我们自己的缓存结构）
          (tc as any).extra_content = (tc as any).extra_content || {};
          (tc as any).extra_content.google = (tc as any).extra_content.google || {};
          if (!(tc as any).extra_content.google.thought_signature) {
            (tc as any).extra_content.google.thought_signature = finalThoughtSig;
          }
        }
      }
    }
  }
}

