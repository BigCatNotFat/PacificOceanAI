/**
 * DiffSuggestionService - Diff 建议服务实现
 * 
 * 管理编辑器中的 diff 建议，与注入脚本的 diffAPI 通信
 * 
 * 通信协议：
 * - Content Script -> Injected Script: DIFF_CREATE_SUGGESTION, DIFF_ACCEPT, DIFF_REJECT 等
 * - Injected Script -> Content Script: DIFF_SUGGESTION_RESOLVED
 */

import { Disposable } from '../../base/common/disposable';
import { Emitter, Event } from '../../base/common/event';
import { injectable } from '../../platform/instantiation/descriptors';
import type {
  IDiffSuggestionService,
  DiffSuggestion,
  CreateSuggestionInput,
  CreateSegmentSuggestionInput,
  SuggestionResolvedEvent
} from '../../platform/editor/IDiffSuggestionService';
import { logger } from '../../utils/logger';

/**
 * DiffSuggestionService 实现
 */
@injectable()
export class DiffSuggestionService extends Disposable implements IDiffSuggestionService {
  private static instance: DiffSuggestionService | null = null;
  
  /** 建议存储 */
  private suggestions: Map<string, DiffSuggestion> = new Map();
  
  /** ID 计数器 */
  private idCounter = 0;
  
  /** 消息监听器 */
  private messageListener: ((event: MessageEvent) => void) | null = null;
  
  /** 建议决策事件发射器 */
  private readonly _onSuggestionResolved = new Emitter<SuggestionResolvedEvent>();
  readonly onSuggestionResolved: Event<SuggestionResolvedEvent> = this._onSuggestionResolved.event;

  
  private constructor() {
    super();
    this.setupMessageListener();
    logger.debug('[DiffSuggestionService] 初始化完成');
  }
  
  static getInstance(): DiffSuggestionService {
    if (!DiffSuggestionService.instance) {
      DiffSuggestionService.instance = new DiffSuggestionService();
    }
    return DiffSuggestionService.instance;
  }

  /**
   * 生成唯一建议 ID
   */
  private generateId(): string {
    return `diff_${Date.now()}_${++this.idCounter}`;
  }
  
  /**
   * 设置消息监听器，接收来自注入脚本的决策结果
   */
  private setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data) return;
      
      // 处理建议决策消息（工具调用的 diff 建议）
      if (data.type === 'DIFF_SUGGESTION_RESOLVED') {
        this.handleSuggestionResolved(data.data);
      }
      
      // 处理文本操作决策消息（expand, translate 等的 diff 建议）
      if (data.type === 'OVERLEAF_TEXT_ACTION_DECISION') {
        this.handleTextActionDecision(data.data);
      }
    };
    
    window.addEventListener('message', this.messageListener);
  }
  
  /**
   * 处理文本操作决策结果
   * 用于统计 expand, translate, polish 等操作的接受/拒绝
   */
  private handleTextActionDecision(data: {
    action: string;
    accepted: boolean;
  }): void {
    logger.debug(`[DiffSuggestionService] 文本操作 ${data.action} 被${data.accepted ? '接受' : '拒绝'}`);
    
  }
  
  /**
   * 处理建议决策结果
   */
  private handleSuggestionResolved(data: {
    id: string;
    accepted: boolean;
    oldContent?: string;
    newContent?: string;
  }): void {
    const suggestion = this.suggestions.get(data.id);
    
    // 检查是否是文本操作的建议（ID 以 text-action- 开头）
    // 这些建议是通过 diffAPI 直接创建的，不在 DiffSuggestionService 中
    // 它们的统计通过 OVERLEAF_TEXT_ACTION_DECISION 消息处理
    if (!suggestion) {
      if (data.id.startsWith('text-action-')) {
        // 文本操作的统计已通过 OVERLEAF_TEXT_ACTION_DECISION 消息处理
        // 这里只输出日志
        logger.debug(`[DiffSuggestionService] 文本操作建议 ${data.id} 被${data.accepted ? '接受' : '拒绝'}（统计由 OVERLEAF_TEXT_ACTION_DECISION 处理）`);
        return;
      }
      console.warn('[DiffSuggestionService] 未找到建议:', data.id);
      return;
    }
    
    // 更新建议状态
    suggestion.status = data.accepted ? 'accepted' : 'rejected';
    
    logger.debug(`[DiffSuggestionService] 建议 ${data.id} 被${data.accepted ? '接受' : '拒绝'}`);
    
    // 触发事件
    this._onSuggestionResolved.fire({
      id: data.id,
      accepted: data.accepted,
      targetFile: suggestion.targetFile
    });
    
    // 已处理的建议从 pending 列表移除（保留在 suggestions 中用于查询）
  }
  
  /**
   * 创建单个行级 diff 建议
   */
  async createSuggestion(input: CreateSuggestionInput): Promise<string> {
    const id = this.generateId();
    
    const suggestion: DiffSuggestion = {
      id,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      targetFile: input.targetFile,
      type: 'line',
      startLine: input.startLine,
      endLine: input.endLine,
      oldContent: input.oldContent,
      newContent: input.newContent,
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.suggestions.set(id, suggestion);
    
    // 发送消息到注入脚本创建 UI
    window.postMessage({
      type: 'DIFF_CREATE_SUGGESTION',
      data: {
        id,
        targetFile: input.targetFile,
        startLine: input.startLine,
        endLine: input.endLine,
        oldContent: input.oldContent,
        newContent: input.newContent
      }
    }, '*');
    
    logger.debug(`[DiffSuggestionService] 创建行级建议 ${id}: 行 ${input.startLine}-${input.endLine} 文件: ${input.targetFile}`);
    
    return id;
  }
  
  /**
   * 批量创建行级 diff 建议
   */
  async createBatchSuggestions(inputs: CreateSuggestionInput[]): Promise<string[]> {
    const ids: string[] = [];
    const batchData: Array<{
      id: string;
      targetFile: string;
      startLine: number;
      endLine: number;
      oldContent: string;
      newContent: string;
    }> = [];
    
    for (const input of inputs) {
      const id = this.generateId();
      ids.push(id);
      
      const suggestion: DiffSuggestion = {
        id,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        targetFile: input.targetFile,
        type: 'line',
        startLine: input.startLine,
        endLine: input.endLine,
        oldContent: input.oldContent,
        newContent: input.newContent,
        status: 'pending',
        createdAt: Date.now()
      };
      
      this.suggestions.set(id, suggestion);
      
      batchData.push({
        id,
        targetFile: input.targetFile,
        startLine: input.startLine,
        endLine: input.endLine,
        oldContent: input.oldContent,
        newContent: input.newContent
      });
    }
    
    // 发送批量创建消息到注入脚本
    window.postMessage({
      type: 'DIFF_CREATE_BATCH',
      data: {
        suggestions: batchData
      }
    }, '*');
    
    logger.debug(`[DiffSuggestionService] 批量创建 ${ids.length} 个行级建议`);
    
    return ids;
  }
  
  /**
   * 创建单个片段级 diff 建议
   */
  async createSegmentSuggestion(input: CreateSegmentSuggestionInput): Promise<string> {
    const id = this.generateId();
    
    const suggestion: DiffSuggestion = {
      id,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      targetFile: input.targetFile,
      type: 'segment',
      startLine: 0, // segment 类型不使用行号
      endLine: 0,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      oldContent: input.oldContent,
      newContent: input.newContent,
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.suggestions.set(id, suggestion);
    
    // 发送消息到注入脚本创建 UI
    window.postMessage({
      type: 'DIFF_CREATE_SEGMENT_SUGGESTION',
      data: {
        id,
        targetFile: input.targetFile,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        oldContent: input.oldContent,
        newContent: input.newContent
      }
    }, '*');
    
    logger.debug(`[DiffSuggestionService] 创建片段级建议 ${id}: 偏移 ${input.startOffset}-${input.endOffset} 文件: ${input.targetFile}`);
    
    return id;
  }
  
  /**
   * 批量创建片段级 diff 建议
   */
  async createBatchSegmentSuggestions(inputs: CreateSegmentSuggestionInput[]): Promise<string[]> {
    const ids: string[] = [];
    const batchData: Array<{
      id: string;
      targetFile: string;
      startOffset: number;
      endOffset: number;
      oldContent: string;
      newContent: string;
    }> = [];
    
    for (const input of inputs) {
      const id = this.generateId();
      ids.push(id);
      
      const suggestion: DiffSuggestion = {
        id,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        targetFile: input.targetFile,
        type: 'segment',
        startLine: 0,
        endLine: 0,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        oldContent: input.oldContent,
        newContent: input.newContent,
        status: 'pending',
        createdAt: Date.now()
      };
      
      this.suggestions.set(id, suggestion);
      
      batchData.push({
        id,
        targetFile: input.targetFile,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        oldContent: input.oldContent,
        newContent: input.newContent
      });
    }
    
    // 发送批量创建消息到注入脚本
    window.postMessage({
      type: 'DIFF_CREATE_SEGMENT_BATCH',
      data: {
        suggestions: batchData
      }
    }, '*');
    
    logger.debug(`[DiffSuggestionService] 批量创建 ${ids.length} 个片段级建议`);
    
    return ids;
  }
  
  /**
   * 接受指定建议
   */
  async acceptSuggestion(id: string): Promise<void> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      console.warn('[DiffSuggestionService] 未找到建议:', id);
      return;
    }
    
    if (suggestion.status !== 'pending') {
      console.warn('[DiffSuggestionService] 建议已处理:', id);
      return;
    }
    
    // 发送接受消息到注入脚本
    window.postMessage({
      type: 'DIFF_ACCEPT',
      data: { id }
    }, '*');
  }
  
  /**
   * 拒绝指定建议
   */
  async rejectSuggestion(id: string): Promise<void> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      console.warn('[DiffSuggestionService] 未找到建议:', id);
      return;
    }
    
    if (suggestion.status !== 'pending') {
      console.warn('[DiffSuggestionService] 建议已处理:', id);
      return;
    }
    
    // 发送拒绝消息到注入脚本
    window.postMessage({
      type: 'DIFF_REJECT',
      data: { id }
    }, '*');
  }
  
  /**
   * 接受所有待处理的建议
   */
  async acceptAll(): Promise<void> {
    // 发送全部接受消息到注入脚本
    window.postMessage({
      type: 'DIFF_ACCEPT_ALL',
      data: {}
    }, '*');
    
    logger.debug('[DiffSuggestionService] 发送接受全部建议请求');
  }
  
  /**
   * 拒绝所有待处理的建议
   */
  async rejectAll(): Promise<void> {
    // 发送全部拒绝消息到注入脚本
    window.postMessage({
      type: 'DIFF_REJECT_ALL',
      data: {}
    }, '*');
    
    logger.debug('[DiffSuggestionService] 发送拒绝全部建议请求');
  }
  
  /**
   * 获取所有待处理的建议
   */
  getPendingSuggestions(): DiffSuggestion[] {
    return Array.from(this.suggestions.values())
      .filter(s => s.status === 'pending');
  }
  
  /**
   * 获取指定建议
   */
  getSuggestion(id: string): DiffSuggestion | undefined {
    return this.suggestions.get(id);
  }
  
  /**
   * 清除所有建议
   */
  clearAll(): void {
    // 发送清除消息到注入脚本
    window.postMessage({
      type: 'DIFF_CLEAR_ALL',
      data: {}
    }, '*');
    
    this.suggestions.clear();
    logger.debug('[DiffSuggestionService] 清除所有建议');
  }
  
  /**
   * 释放资源
   */
  override dispose(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    this._onSuggestionResolved.dispose();
    this.suggestions.clear();
    super.dispose();
  }
}

// 导出单例
export const diffSuggestionService = DiffSuggestionService.getInstance();

