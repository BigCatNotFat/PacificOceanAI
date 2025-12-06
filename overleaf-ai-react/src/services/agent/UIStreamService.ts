import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import { injectable } from '../../platform/instantiation/descriptors';
import type {
  IUIStreamService,
  ThinkingDeltaInput,
  ContentDeltaInput,
  ToolCallUpdateInput,
  ThinkingUpdateEvent,
  ContentUpdateEvent,
  ToolCallUpdateEvent
} from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';

/**
 * UIStreamService - UI 流式更新服务实现
 *
 * 核心思路：
 * - 内部维护简单的 buffer（按 messageId / toolCallId 累积文本）
 * - 对外暴露 pushXXX 方法，供 LLM/Agent 在流式解析时调用
 * - 对 UI 暴露事件，事件中同时包含 delta 和 full，方便 UI 选择覆盖 or 追加
 */
@injectable()
export class UIStreamService extends Disposable implements IUIStreamService {
  // ==================== 事件定义 ====================

  private readonly _onDidThinkingUpdate = new Emitter<ThinkingUpdateEvent>();
  readonly onDidThinkingUpdate: Event<ThinkingUpdateEvent> = this._onDidThinkingUpdate.event;

  private readonly _onDidContentUpdate = new Emitter<ContentUpdateEvent>();
  readonly onDidContentUpdate: Event<ContentUpdateEvent> = this._onDidContentUpdate.event;

  private readonly _onDidToolCallUpdate = new Emitter<ToolCallUpdateEvent>();
  readonly onDidToolCallUpdate: Event<ToolCallUpdateEvent> = this._onDidToolCallUpdate.event;

  // ==================== 内部缓存 ====================

  /** 按消息累积思考内容 */
  private readonly thinkingBuffers = new Map<string, string>(); // key: messageId

  /** 按消息累积正文内容 */
  private readonly contentBuffers = new Map<string, string>(); // key: messageId

  /** 按工具调用累积参数文本 */
  private readonly toolArgsBuffers = new Map<string, string>(); // key: toolCallId

  /** 按工具调用累积结果文本 */
  private readonly toolResultBuffers = new Map<string, string>(); // key: toolCallId

  // ==================== 公共方法 ====================

  pushThinking(update: ThinkingDeltaInput): void {
    const key = update.messageId;
    const prev = this.thinkingBuffers.get(key) || '';
    const next = prev + (update.delta || '');

    this.thinkingBuffers.set(key, next);
    this._onDidThinkingUpdate.fire({
      ...update,
      fullText: next
    });

    // 如果当前思考已结束，可以释放缓存
    if (update.done) {
      this.thinkingBuffers.delete(key);
    }
  }

  pushContent(update: ContentDeltaInput): void {
    const key = update.messageId;
    const prev = this.contentBuffers.get(key) || '';
    const next = prev + (update.delta || '');

    this.contentBuffers.set(key, next);
    this._onDidContentUpdate.fire({
      ...update,
      fullText: next
    });

    if (update.done) {
      this.contentBuffers.delete(key);
    }
  }

  pushToolCall(update: ToolCallUpdateInput): void {
    const { toolCallId, phase, argsDelta, resultDelta } = update;

    let fullArgs = this.toolArgsBuffers.get(toolCallId);
    let fullResult = this.toolResultBuffers.get(toolCallId);

    if (typeof argsDelta === 'string' && argsDelta.length > 0) {
      const prev = fullArgs || '';
      fullArgs = prev + argsDelta;
      this.toolArgsBuffers.set(toolCallId, fullArgs);
    }

    if (typeof resultDelta === 'string' && resultDelta.length > 0) {
      const prev = fullResult || '';
      fullResult = prev + resultDelta;
      this.toolResultBuffers.set(toolCallId, fullResult);
    }

    this._onDidToolCallUpdate.fire({
      ...update,
      fullArgs,
      fullResult
    });

    // 工具调用结束或出错，释放缓存
    if (phase === 'end' || phase === 'error') {
      this.toolArgsBuffers.delete(toolCallId);
      this.toolResultBuffers.delete(toolCallId);
    }
  }

  // ==================== 生命周期 ====================

  override dispose(): void {
    this._onDidThinkingUpdate.dispose();
    this._onDidContentUpdate.dispose();
    this._onDidToolCallUpdate.dispose();

    this.thinkingBuffers.clear();
    this.contentBuffers.clear();
    this.toolArgsBuffers.clear();
    this.toolResultBuffers.clear();

    super.dispose();
  }
}

// 导出服务标识符，方便上层统一从实现文件引入
export { IUIStreamServiceId };

