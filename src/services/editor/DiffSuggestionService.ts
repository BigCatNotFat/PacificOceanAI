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

  /** DiffAPI readiness tracking */
  private readyFile: string | null = null;
  private readyResolvers: Array<{ resolve: (file: string) => void; targetFile: string }> = [];
  
  private constructor() {
    super();
    this.setupMessageListener();
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
      
      if (data.type === 'DIFF_SUGGESTION_RESOLVED') {
        this.handleSuggestionResolved(data.data);
      }
      
      if (data.type === 'OVERLEAF_TEXT_ACTION_DECISION') {
        this.handleTextActionDecision(data.data);
      }
      
      if (data.type === 'DIFF_READY' || data.type === 'DIFF_PONG') {
        this.handleDiffReady(data.data?.file ?? null);
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
        return;
      }
      return;
    }
    
    // 更新建议状态
    suggestion.status = data.accepted ? 'accepted' : 'rejected';
    
    
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
    
    
    return ids;
  }
  
  /**
   * 接受指定建议
   */
  async acceptSuggestion(id: string): Promise<void> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      return;
    }
    
    if (suggestion.status !== 'pending') {
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
      return;
    }
    
    if (suggestion.status !== 'pending') {
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
   * Handle DiffAPI readiness signal (DIFF_READY / DIFF_PONG).
   *
   * Only resolves waiters whose target file matches the reported file.
   * This prevents a stale PONG (from a previous file) from prematurely
   * resolving a waiter that is waiting for a different file.
   */
  private handleDiffReady(file: string | null): void {
    this.readyFile = file;

    const remaining: Array<{ resolve: (file: string) => void; targetFile: string }> = [];
    for (const waiter of this.readyResolvers) {
      if (this.fileNamesMatch(waiter.targetFile, file)) {
        waiter.resolve(file ?? '');
      } else {
        remaining.push(waiter);
      }
    }
    this.readyResolvers = remaining;
  }

  /**
   * Check whether two file identifiers refer to the same file.
   * Handles cases like "main.tex" vs "sections/main.tex", or null.
   */
  private fileNamesMatch(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const baseA = a.split('/').pop() || a;
    const baseB = b.split('/').pop() || b;
    return baseA === baseB;
  }

  /**
   * Wait until the DiffAPI is ready for the given file.
   * Sends DIFF_PING and listens for DIFF_READY/DIFF_PONG.
   * Resolves `true` when ready, `false` on timeout.
   *
   * The resolver now checks that the reported file actually matches
   * `targetFile`, so stale PONGs from a previous file won't cause
   * a premature resolve.
   */
  async waitForReady(targetFile: string, timeoutMs = 8000): Promise<boolean> {
    // Already ready for this file
    if (this.fileNamesMatch(this.readyFile, targetFile)) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const waiter = {
        targetFile,
        resolve: (_file: string) => {
          if (settled) return;
          settled = true;
          resolve(true);
        }
      };

      this.readyResolvers.push(waiter);

      // Send a ping to trigger an immediate response if DiffAPI is already ready
      window.postMessage({ type: 'DIFF_PING' }, '*');

      // Also retry pings periodically in case the first one was too early
      const pingInterval = setInterval(() => {
        if (settled) { clearInterval(pingInterval); return; }
        window.postMessage({ type: 'DIFF_PING' }, '*');
      }, 500);

      setTimeout(() => {
        clearInterval(pingInterval);
        if (!settled) {
          settled = true;
          this.readyResolvers = this.readyResolvers.filter(w => w !== waiter);
          resolve(false);
        }
      }, timeoutMs);
    });
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

