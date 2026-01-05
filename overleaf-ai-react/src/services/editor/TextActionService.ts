/**
 * 文本操作服务
 * 
 * 负责处理选区文本的扩写/缩写/润色等操作
 * 低耦合设计：
 * - 操作逻辑与 UI 分离
 * - 通过回调/事件机制与其他模块通信
 * - 方便后续扩展新的操作类型
 * 
 * 预览模式（v2）：
 * - 操作结果先显示预览（删除线原文 + 新文本）
 * - 用户确认后才真正替换
 * - 用户拒绝则保持原样
 */

import { Disposable } from '../../base/common/disposable';
import { Emitter, Event } from '../../base/common/event';
import type { TextActionRequest, TextActionResult, TextActionType, TextActionPreview, PreviewState } from './bridge';

/** 文本操作处理器类型 */
export type TextActionHandler = (
  action: TextActionType,
  text: string,
  from: number,
  to: number,
  modelId?: string,
  customPrompt?: string,
  context?: { before?: string; after?: string }
) => Promise<string | null>;

/** 预览决策结果 */
export interface PreviewDecisionEvent {
  id: string;
  accepted: boolean;
  success: boolean;
}

/**
 * 文本操作服务
 * 
 * 使用示例：
 * ```typescript
 * const service = TextActionService.getInstance();
 * 
 * // 注册操作处理器
 * service.registerHandler('expand', async (action, text, from, to) => {
 *   // 调用 AI 进行扩写
 *   const result = await aiService.expand(text);
 *   return result;
 * });
 * 
 * // 监听操作请求
 * service.onActionRequest((request) => {
 *   console.log('收到操作请求:', request);
 * });
 * 
 * // 监听操作完成
 * service.onActionComplete((result) => {
 *   console.log('操作完成:', result);
 * });
 * 
 * // 监听预览决策
 * service.onPreviewDecision((event) => {
 *   console.log('预览决策:', event.accepted ? '接受' : '拒绝');
 * });
 * ```
 */
export class TextActionService extends Disposable {
  private static instance: TextActionService | null = null;
  
  /** 操作处理器映射 */
  private handlers: Map<TextActionType, TextActionHandler> = new Map();
  
  /** 当前预览信息 */
  private currentPreview: TextActionPreview | null = null;
  
  /** 操作请求事件发射器 */
  private readonly _onActionRequest = new Emitter<TextActionRequest>();
  readonly onActionRequest: Event<TextActionRequest> = this._onActionRequest.event;
  
  /** 操作完成事件发射器 */
  private readonly _onActionComplete = new Emitter<TextActionResult>();
  readonly onActionComplete: Event<TextActionResult> = this._onActionComplete.event;
  
  /** 操作失败事件发射器 */
  private readonly _onActionError = new Emitter<{ request: TextActionRequest; error: Error }>();
  readonly onActionError: Event<{ request: TextActionRequest; error: Error }> = this._onActionError.event;
  
  /** 预览显示事件发射器 */
  private readonly _onPreviewShow = new Emitter<TextActionPreview>();
  readonly onPreviewShow: Event<TextActionPreview> = this._onPreviewShow.event;
  
  /** 预览决策事件发射器 */
  private readonly _onPreviewDecision = new Emitter<PreviewDecisionEvent>();
  readonly onPreviewDecision: Event<PreviewDecisionEvent> = this._onPreviewDecision.event;
  
  /** 消息监听器 */
  private messageListener: ((event: MessageEvent) => void) | null = null;
  /** 预览决策消息监听器 */
  private previewDecisionListener: ((event: MessageEvent) => void) | null = null;
  
  private constructor() {
    super();
    this.setupMessageListener();
    this.setupPreviewDecisionListener();
  }
  
  static getInstance(): TextActionService {
    if (!TextActionService.instance) {
      TextActionService.instance = new TextActionService();
    }
    return TextActionService.instance;
  }
  
  /**
   * 生成唯一预览 ID
   */
  private generatePreviewId(): string {
    return 'preview_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * 设置消息监听器，接收来自注入脚本的操作请求
   */
  private setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.type !== 'OVERLEAF_TEXT_ACTION_REQUEST') return;
      
      const request: TextActionRequest = {
        action: data.data.action,
        text: data.data.text,
        from: data.data.from,
        to: data.data.to,
        modelId: data.data.modelId,  // 传递模型 ID
        customPrompt: data.data.customPrompt,  // 传递自定义提示词
        contextBefore: data.data.contextBefore,  // 选区前的上下文
        contextAfter: data.data.contextAfter     // 选区后的上下文
      };
      
      console.log('[TextActionService] 收到操作请求:', request.action, '模型:', request.modelId, 
        request.customPrompt ? '自定义:' + request.customPrompt.substring(0, 30) + '...' : '',
        '上下文:', { before: request.contextBefore?.length || 0, after: request.contextAfter?.length || 0 });
      
      // 触发请求事件
      this._onActionRequest.fire(request);
      
      // 执行操作（预览模式）
      this.executeActionWithPreview(request);
    };
    
    window.addEventListener('message', this.messageListener);
  }
  
  /**
   * 设置预览决策消息监听器
   */
  private setupPreviewDecisionListener(): void {
    this.previewDecisionListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.type !== 'OVERLEAF_PREVIEW_DECISION_RESULT') return;
      
      const decisionData = data.data;
      console.log('[TextActionService] 收到预览决策结果:', decisionData.accepted ? '接受' : '拒绝');
      
      // 触发预览决策事件
      this._onPreviewDecision.fire({
        id: decisionData.id,
        accepted: decisionData.accepted,
        success: decisionData.success
      });
      
      // 如果有当前预览且 ID 匹配，触发完成事件
      if (this.currentPreview && this.currentPreview.id === decisionData.id) {
        const result: TextActionResult = {
          success: decisionData.accepted && decisionData.success,
          action: this.currentPreview.action,
          originalText: this.currentPreview.originalText,
          resultText: decisionData.accepted ? this.currentPreview.newText : undefined
        };
        
        this._onActionComplete.fire(result);
        this.currentPreview = null;
      }
    };
    
    window.addEventListener('message', this.previewDecisionListener);
  }
  
  /**
   * 注册操作处理器
   * @param action 操作类型
   * @param handler 处理函数，返回处理后的文本，返回 null 表示取消操作
   */
  registerHandler(action: TextActionType, handler: TextActionHandler): Disposable {
    this.handlers.set(action, handler);
    
    return {
      dispose: () => {
        if (this.handlers.get(action) === handler) {
          this.handlers.delete(action);
        }
      }
    };
  }
  
  /**
   * 执行文本操作（带预览模式）
   * 生成新文本后，显示预览让用户确认
   */
  async executeActionWithPreview(request: TextActionRequest): Promise<void> {
    const handler = this.handlers.get(request.action);
    
    if (!handler) {
      console.warn(`[TextActionService] 未找到操作处理器: ${request.action}`);
      
      // 没有处理器时，仅触发事件，由外部处理
      const result: TextActionResult = {
        success: false,
        action: request.action,
        originalText: request.text,
        error: `操作 "${request.action}" 暂未实现`
      };
      this._onActionComplete.fire(result);
      return;
    }
    
    try {
      // 调用处理器生成新文本
      // 注意：处理器现在使用流式预览模式，会自己发送预览消息
      const context = (request.contextBefore || request.contextAfter) 
        ? { before: request.contextBefore, after: request.contextAfter }
        : undefined;
      const resultText = await handler(request.action, request.text, request.from, request.to, request.modelId, request.customPrompt, context);
      
      if (resultText === null) {
        // 操作被取消或失败
        console.log('[TextActionService] 操作已取消或失败');
        
        // 触发完成事件，通知 UI 重置状态
        const result: TextActionResult = {
          success: false,
          action: request.action,
          originalText: request.text,
          error: '操作已取消'
        };
        this._onActionComplete.fire(result);
        return;
      }
      
      // 创建预览信息（用于内部状态跟踪）
      const preview: TextActionPreview = {
        id: this.generatePreviewId(),
        action: request.action,
        originalText: request.text,
        newText: resultText,
        from: request.from,
        to: request.to,
        state: 'previewing' as PreviewState
      };
      
      this.currentPreview = preview;
      
      // 触发预览显示事件（供内部使用）
      this._onPreviewShow.fire(preview);
      
      // 注意：不再发送 OVERLEAF_SHOW_PREVIEW_REQUEST 消息
      // 因为现在使用流式预览模式，预览消息由 TextActionProvider 在流式过程中发送
      
      console.log('[TextActionService] 流式预览已处理:', request.action);
      
    } catch (error) {
      console.error('[TextActionService] 操作失败:', error);
      
      this._onActionError.fire({
        request,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      const result: TextActionResult = {
        success: false,
        action: request.action,
        originalText: request.text,
        error: error instanceof Error ? error.message : String(error)
      };
      this._onActionComplete.fire(result);
    }
  }
  
  /**
   * 执行文本操作（直接替换，不使用预览模式）
   * 保留此方法以支持旧的使用方式
   */
  async executeAction(request: TextActionRequest): Promise<void> {
    // 委托给预览模式执行
    return this.executeActionWithPreview(request);
  }
  
  /**
   * 获取当前预览信息
   */
  getCurrentPreview(): TextActionPreview | null {
    return this.currentPreview;
  }
  
  /**
   * 手动触发操作（用于测试或程序化调用）
   */
  async triggerAction(action: TextActionType, text: string, from: number, to: number): Promise<TextActionResult> {
    const request: TextActionRequest = { action, text, from, to };
    
    return new Promise((resolve) => {
      const disposable = this.onActionComplete((result) => {
        if (result.action === action && result.originalText === text) {
          disposable.dispose();
          resolve(result);
        }
      });
      
      this.executeActionWithPreview(request);
    });
  }
  
  dispose(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    if (this.previewDecisionListener) {
      window.removeEventListener('message', this.previewDecisionListener);
      this.previewDecisionListener = null;
    }
    this._onActionRequest.dispose();
    this._onActionComplete.dispose();
    this._onActionError.dispose();
    this._onPreviewShow.dispose();
    this._onPreviewDecision.dispose();
    this.handlers.clear();
    this.currentPreview = null;
    super.dispose();
  }
}

// 导出单例
export const textActionService = TextActionService.getInstance();

