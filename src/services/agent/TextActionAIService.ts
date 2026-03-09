/**
 * TextActionAIService - Services 层实现
 * 
 * 负责处理文本操作（润色/扩写/缩写）的 AI 调用
 * 
 * 职责：
 * - 调用 PromptService 获取提示词
 * - 调用 LLMService 执行 AI 调用
 * - 支持流式输出
 * - 处理错误和中断
 */

import { injectable } from '../../platform/instantiation/descriptors';
import type {
  ITextActionAIService,
  TextActionAIOptions,
  TextActionAIResult,
  TextActionStreamCallback
} from '../../platform/agent/ITextActionAIService';
import { ITextActionAIServiceId } from '../../platform/agent/ITextActionAIService';
import type { ILLMService, LLMConfig } from '../../platform/llm/ILLMService';
import { ILLMServiceId } from '../../platform/llm/ILLMService';
import type { IPromptService, TextActionType } from '../../platform/agent/IPromptService';
import { IPromptServiceId } from '../../platform/agent/IPromptService';
import type { IConfigurationService } from '../../platform/configuration/configuration';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IModelRegistryService } from '../../platform/llm/IModelRegistryService';
import { IModelRegistryServiceId } from '../../platform/llm/IModelRegistryService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';
import { Disposable } from '../../base/common/disposable';

/**
 * 文本操作专用的消息 ID 前缀
 */
const TEXT_ACTION_MESSAGE_PREFIX = 'text_action_';

/**
 * TextActionAIService 实现
 */
@injectable(
  ILLMServiceId,
  IPromptServiceId,
  IConfigurationServiceId,
  IModelRegistryServiceId,
  IUIStreamServiceId
)
export class TextActionAIService extends Disposable implements ITextActionAIService {
  /** 当前操作的流式回调 */
  private currentStreamCallback: TextActionStreamCallback | null = null;
  /** 当前操作的思考过程流式回调 */
  private currentThinkingStreamCallback: TextActionStreamCallback | null = null;
  /** 当前操作的消息 ID */
  private currentMessageId: string | null = null;
  /** 内容流式事件监听器 */
  private streamDisposable: { dispose: () => void } | null = null;
  /** 思考过程流式事件监听器 */
  private thinkingStreamDisposable: { dispose: () => void } | null = null;

  constructor(
    private readonly llmService: ILLMService,
    private readonly promptService: IPromptService,
    private readonly configService: IConfigurationService,
    private readonly modelRegistry: IModelRegistryService,
    private readonly uiStreamService: IUIStreamService
  ) {
    super();
    console.log('[TextActionAIService] 依赖注入成功');
  }

  /**
   * 执行文本操作
   */
  async execute(options: TextActionAIOptions): Promise<TextActionAIResult> {
    const { action, text, modelId: specifiedModelId, customPrompt, context, onStream, onThinkingStream, abortSignal } = options;

    console.log(`[TextActionAIService] 执行操作: ${action}`, {
      textLength: text.length,
      specifiedModelId,
      customPrompt: customPrompt ? customPrompt.substring(0, 50) + '...' : undefined,
      hasContext: !!(context?.before || context?.after),
      contextBeforeLength: context?.before?.length || 0,
      contextAfterLength: context?.after?.length || 0,
      hasStreamCallback: !!onStream,
      hasThinkingStreamCallback: !!onThinkingStream
    });

    try {
      // 1. 获取模型配置（优先使用指定的模型）
      const modelId = specifiedModelId || await this.getTextActionModelId();
      if (!modelId) {
        return {
          success: false,
          error: '未配置 AI 模型，请先在设置中配置 API',
          action,
          originalText: text
        };
      }
      
      console.log(`[TextActionAIService] 使用模型: ${modelId}`);

      // 2. 构建消息（对于自定义操作，传递 customPrompt；对于翻译等操作，传递上下文）
      const messages = this.promptService.buildTextActionPrompt(action, text, customPrompt, context);

      // 3. 设置流式回调（如果提供）
      if (onStream || onThinkingStream) {
        this.setupStreamListener(onStream, onThinkingStream);
      }

      // 4. 构建 LLM 配置
      const llmConfig = this.buildLLMConfig(modelId, abortSignal);

      // 打印发送给 AI 的提示词
      console.log('='.repeat(80));
      console.log(`[TextActionAIService] 📤 发送给 AI 的提示词: ${action}`);
      console.log('='.repeat(80));
      console.log(JSON.stringify(messages, null, 2));
      console.log('='.repeat(80));
      console.log('');

      // 5. 调用 LLM
      const result = await this.llmService.chat(messages, llmConfig);

      // 6. 清理流式监听器
      this.cleanupStreamListener();

      // 7. 返回结果
      const resultText = result.content?.trim() || '';
      
      console.log(`[TextActionAIService] 操作完成: ${action}`, {
        resultLength: resultText.length
      });

      return {
        success: true,
        resultText,
        action,
        originalText: text
      };

    } catch (error) {
      // 清理流式监听器
      this.cleanupStreamListener();

      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检查是否是用户取消
      if (errorMessage.includes('aborted') || errorMessage.includes('cancelled') || (error instanceof Error && error.name === 'AbortError')) {
        console.log(`[TextActionAIService] 操作已取消: ${action}`);
        return {
          success: false,
          error: '操作已取消',
          action,
          originalText: text
        };
      }

      console.error(`[TextActionAIService] 操作失败: ${action}`, error);

      return {
        success: false,
        error: errorMessage,
        action,
        originalText: text
      };
    }
  }

  /**
   * 润色文本
   */
  async polish(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult> {
    return this.execute({ action: 'polish', text, onStream });
  }

  /**
   * 扩写文本
   */
  async expand(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult> {
    return this.execute({ action: 'expand', text, onStream });
  }

  /**
   * 缩写文本
   */
  async condense(text: string, onStream?: TextActionStreamCallback): Promise<TextActionAIResult> {
    return this.execute({ action: 'condense', text, onStream });
  }

  // ==================== 私有方法 ====================

  /**
   * 获取文本操作使用的模型 ID
   * 
   * 优先级：
   * 1. 配置中的专用文本操作模型
   * 2. 默认使用已配置的模型中的第一个
   * 3. 使用模型注册表中的默认模型
   */
  private async getTextActionModelId(): Promise<string | null> {
    const apiConfig = await this.configService.getAPIConfig();
    
    // 检查是否有 API Key
    if (!apiConfig?.apiKey) {
      console.warn('[TextActionAIService] 未配置 API Key');
      return null;
    }

    // 检查是否有专用的文本操作模型配置（后续可扩展）
    // 目前直接使用模型注册表中的第一个模型
    const models = this.modelRegistry.listModels();
    if (models.length > 0) {
      // 优先使用 gpt-4o-mini 或其他快速模型
      const preferredModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'claude-3-haiku'];
      for (const preferred of preferredModels) {
        if (models.includes(preferred)) {
          return preferred;
        }
      }
      // 否则使用第一个可用模型
      return models[0];
    }

    console.warn('[TextActionAIService] 未找到可用模型');
    return null;
  }

  /**
   * 构建 LLM 配置
   */
  private buildLLMConfig(modelId: string, abortSignal?: AbortSignal): LLMConfig {
    const defaultConfig = this.modelRegistry.getDefaultConfig(modelId);
    
    this.currentMessageId = `${TEXT_ACTION_MESSAGE_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const config: LLMConfig = {
      modelId,
      temperature: 0.7,
      maxTokens: defaultConfig?.maxTokens || 16384,
      stream: true,
      uiStreamMeta: {
        messageId: this.currentMessageId
      }
    };

    // 添加中止信号
    if (abortSignal) {
      (config as any).abortSignal = abortSignal;
    }

    return config;
  }

  /**
   * 设置流式监听器
   */
  private setupStreamListener(
    contentCallback?: TextActionStreamCallback,
    thinkingCallback?: TextActionStreamCallback
  ): void {
    this.currentStreamCallback = contentCallback || null;
    this.currentThinkingStreamCallback = thinkingCallback || null;
    
    // 监听 UIStreamService 的内容更新事件
    if (contentCallback) {
      this.streamDisposable = this.uiStreamService.onDidContentUpdate((event) => {
        // 只处理当前操作的消息
        if (event.messageId === this.currentMessageId && this.currentStreamCallback) {
          this.currentStreamCallback(event.delta);
        }
      });
    }

    // 监听 UIStreamService 的思考过程更新事件
    if (thinkingCallback) {
      this.thinkingStreamDisposable = this.uiStreamService.onDidThinkingUpdate((event) => {
        // 只处理当前操作的消息
        if (event.messageId === this.currentMessageId && this.currentThinkingStreamCallback) {
          this.currentThinkingStreamCallback(event.delta);
        }
      });
    }
  }

  /**
   * 清理流式监听器
   */
  private cleanupStreamListener(): void {
    if (this.streamDisposable) {
      this.streamDisposable.dispose();
      this.streamDisposable = null;
    }
    if (this.thinkingStreamDisposable) {
      this.thinkingStreamDisposable.dispose();
      this.thinkingStreamDisposable = null;
    }
    this.currentStreamCallback = null;
    this.currentThinkingStreamCallback = null;
    this.currentMessageId = null;
  }

  /**
   * 释放资源
   */
  override dispose(): void {
    this.cleanupStreamListener();
    super.dispose();
  }
}

// 导出服务标识符
export { ITextActionAIServiceId };

