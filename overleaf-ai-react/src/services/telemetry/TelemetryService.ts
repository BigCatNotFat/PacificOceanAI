/**
 * TelemetryService - 统计服务实现
 * 
 * 采用客户端聚合策略：
 * - 在客户端维护统计计数器
 * - 每 120 秒上报一次聚合后的统计数据
 * - 页面关闭时使用 sendBeacon 确保最后的数据能发送
 * - 支持离线队列，网络恢复后自动重试
 */

import { Disposable } from '../../base/common/disposable';
import { Emitter, Event } from '../../base/common/event';
import { injectable } from '../../platform/instantiation';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { IStorageService } from '../../platform/storage/storage';
import type {
  ITelemetryService,
  TelemetryPayload,
  TelemetryUploadResult,
  TelemetryConfig,
  AggregatedStatistics,
} from '../../platform/telemetry/ITelemetryService';

// ==================== 常量定义 ====================

/** 默认上报间隔：120 秒 */
const DEFAULT_UPLOAD_INTERVAL = 120 * 1000;

/** 存储键：用户匿名 ID */
const STORAGE_KEY_USER_ID = 'telemetry.anonymousId';

/** 存储键：离线队列 */
const STORAGE_KEY_OFFLINE_QUEUE = 'telemetry.offlineQueue';

/** 存储键：统计开关 */
const STORAGE_KEY_ENABLED = 'telemetry.enabled';

// ==================== 工具函数 ====================

/**
 * 生成 UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 创建空的统计对象
 */
function createEmptyStatistics(): AggregatedStatistics {
  return {
    chat: {},
    tools: {},
    toolApproval: {},
    textActions: {},
    session: {
      started: 0,
      ended: 0,
    },
    ui: {
      branchCreated: 0,
      paneCount: 0,
    },
  };
}

/**
 * 检查值是否为空（空对象、空数组、0、null、undefined）
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value === 0) return true;
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * 递归清理对象中的空字段
 * 移除值为 空对象{}、空数组[]、0、null、undefined 的字段
 * 返回清理后的对象（如果整个对象为空则返回 undefined）
 */
function cleanEmptyFields<T>(obj: T): T | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') {
    return obj === 0 ? undefined : obj;
  }
  if (Array.isArray(obj)) {
    return obj.length === 0 ? undefined : obj as T;
  }

  const result: Record<string, unknown> = {};
  let hasValue = false;

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    
    const value = (obj as Record<string, unknown>)[key];
    const cleanedValue = cleanEmptyFields(value);
    
    if (cleanedValue !== undefined && !isEmpty(cleanedValue)) {
      result[key] = cleanedValue;
      hasValue = true;
    }
  }

  return hasValue ? (result as T) : undefined;
}

/**
 * 计算统计数据的总操作数
 */
function calculateTotalCount(stats: AggregatedStatistics): number {
  let total = 0;

  // 聊天统计
  for (const modelId in stats.chat) {
    for (const mode in stats.chat[modelId]) {
      total += stats.chat[modelId][mode];
    }
  }

  // 工具统计
  for (const toolName in stats.tools) {
    total += stats.tools[toolName].success + stats.tools[toolName].failed;
  }

  // 工具审批
  for (const toolName in stats.toolApproval) {
    total += stats.toolApproval[toolName].approved + stats.toolApproval[toolName].rejected;
  }

  // 文本操作
  for (const action in stats.textActions) {
    total += stats.textActions[action].used;
  }

  // 会话
  total += stats.session.started + stats.session.ended;

  // UI 交互（branchCreated 计入，paneCount 不计入因为是瞬时值）
  total += stats.ui.branchCreated;

  return total;
}

// ==================== 服务实现 ====================

@injectable(IStorageServiceId)
export class TelemetryService extends Disposable implements ITelemetryService {
  // 事件发射器
  private readonly _onDidUpload = new Emitter<TelemetryUploadResult>();
  readonly onDidUpload: Event<TelemetryUploadResult> = this._onDidUpload.event;

  // 配置
  private readonly config: Required<TelemetryConfig>;

  // 状态
  private userId: string = '';
  private sessionId: string = '';
  private enabled: boolean = true;
  private initialized: boolean = false;

  // 统计数据（聚合）
  private statistics: AggregatedStatistics = createEmptyStatistics();

  // 获取当前 pane 数量的回调函数
  private paneCountGetter: (() => number) | null = null;

  // 定时器
  private uploadTimer: ReturnType<typeof setInterval> | null = null;

  // 依赖的服务
  private readonly storageService: IStorageService;

  constructor(storageService: IStorageService) {
    super();
    this.storageService = storageService;

    // 默认配置
    this.config = {
      uploadInterval: DEFAULT_UPLOAD_INTERVAL,
      endpoint: '',
      version: '1.0.0',
    };

    // 异步初始化
    this.initialize();
  }

  /**
   * 异步初始化
   */
  private async initialize(): Promise<void> {
    try {
      // 加载或生成用户 ID
      let storedUserId = await this.storageService.get<string>(STORAGE_KEY_USER_ID);
      if (!storedUserId) {
        storedUserId = generateUUID();
        await this.storageService.set(STORAGE_KEY_USER_ID, storedUserId);
      }
      this.userId = storedUserId;

      // 生成会话 ID
      this.sessionId = generateUUID();

      // 加载统计开关状态
      const storedEnabled = await this.storageService.get<boolean>(STORAGE_KEY_ENABLED);
      this.enabled = storedEnabled !== false; // 默认启用

      // 启动定时上传
      this.startUploadTimer();

      // 注册页面关闭处理
      this.registerExitHandler();

      // 处理离线队列
      this.processOfflineQueue();

      this.initialized = true;
      console.log('[TelemetryService] Initialized with userId:', this.userId);
    } catch (error) {
      console.error('[TelemetryService] Failed to initialize:', error);
    }
  }

  /**
   * 配置服务
   * 必须在使用前调用此方法设置 endpoint
   */
  public configure(config: Partial<TelemetryConfig>): void {
    Object.assign(this.config, config);
    
    // 如果上报间隔变化，重启定时器
    if (config.uploadInterval && this.uploadTimer) {
      this.stopUploadTimer();
      this.startUploadTimer();
    }
  }

  // ==================== 公开 API ====================

  public trackChat(modelId: string, mode: string): void {
    if (!this.enabled) return;

    if (!this.statistics.chat[modelId]) {
      this.statistics.chat[modelId] = {};
    }
    if (!this.statistics.chat[modelId][mode]) {
      this.statistics.chat[modelId][mode] = 0;
    }
    this.statistics.chat[modelId][mode]++;
  }

  public trackToolExecution(toolName: string, success: boolean): void {
    if (!this.enabled) return;

    if (!this.statistics.tools[toolName]) {
      this.statistics.tools[toolName] = { success: 0, failed: 0 };
    }
    if (success) {
      this.statistics.tools[toolName].success++;
    } else {
      this.statistics.tools[toolName].failed++;
    }
  }

  public trackToolApproval(toolName: string, approved: boolean): void {
    if (!this.enabled) return;

    if (!this.statistics.toolApproval[toolName]) {
      this.statistics.toolApproval[toolName] = { approved: 0, rejected: 0 };
    }
    if (approved) {
      this.statistics.toolApproval[toolName].approved++;
    } else {
      this.statistics.toolApproval[toolName].rejected++;
    }
  }

  public trackTextActionUsed(action: string): void {
    if (!this.enabled) return;

    if (!this.statistics.textActions[action]) {
      this.statistics.textActions[action] = { used: 0, accepted: 0, rejected: 0 };
    }
    this.statistics.textActions[action].used++;
  }

  public trackTextActionDecision(action: string, accepted: boolean): void {
    if (!this.enabled) return;

    if (!this.statistics.textActions[action]) {
      this.statistics.textActions[action] = { used: 0, accepted: 0, rejected: 0 };
    }
    if (accepted) {
      this.statistics.textActions[action].accepted++;
    } else {
      this.statistics.textActions[action].rejected++;
    }
  }

  public trackSessionStart(): void {
    if (!this.enabled) return;
    this.statistics.session.started++;
  }

  public trackSessionEnd(): void {
    if (!this.enabled) return;
    this.statistics.session.ended++;
  }

  public trackBranchCreated(): void {
    if (!this.enabled) return;
    this.statistics.ui.branchCreated++;
  }

  public setPaneCountGetter(getter: () => number): void {
    this.paneCountGetter = getter;
  }

  public async flush(): Promise<void> {
    await this.upload();
  }

  public setUserId(id: string): void {
    this.userId = id;
    this.storageService.set(STORAGE_KEY_USER_ID, id);
  }

  public getUserId(): string {
    return this.userId;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.storageService.set(STORAGE_KEY_ENABLED, enabled);
    
    if (enabled) {
      this.startUploadTimer();
    } else {
      this.stopUploadTimer();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // ==================== 内部方法 ====================

  /**
   * 上传统计数据到服务器
   */
  private async upload(): Promise<void> {
    // 在复制数据前，获取当前 pane 数量（瞬时值）
    if (this.paneCountGetter) {
      this.statistics.ui.paneCount = this.paneCountGetter();
    }
    
    // 复制当前统计数据
    const statsToUpload = JSON.parse(JSON.stringify(this.statistics)) as AggregatedStatistics;
    
    // 重置统计数据（为下一个周期准备）
    this.statistics = createEmptyStatistics();

    // 计算操作总数（即使为 0 也上传，用于追踪用户活跃但未使用功能的情况）
    const totalCount = calculateTotalCount(statsToUpload);

    // 清理空字段，节省带宽（服务器会默认没有的字段为空或 0）
    const cleanedStats = cleanEmptyFields(statsToUpload) || {};

    const payload: TelemetryPayload = {
      userId: this.userId,
      sessionId: this.sessionId,
      version: this.config.version,
      timestamp: Date.now(),
      statistics: cleanedStats as AggregatedStatistics,
    };

    // 如果 endpoint 为空或为 'console'，则只在控制台打印（调试模式）
    if (!this.config.endpoint || this.config.endpoint === 'console') {
      console.log('%c[TelemetryService] 📊 模拟上报 (Debug Mode)', 'color: #00bcd4; font-weight: bold; font-size: 14px');
      console.log('═'.repeat(80));
      console.log('📤 上报数据:', JSON.stringify(payload, null, 2));
      console.log('═'.repeat(80));
      console.log(`✅ 模拟上报成功: ${totalCount} 个操作${totalCount === 0 ? ' (用户活跃但未使用功能)' : ''}`);
      console.log('');

      // 触发成功事件
      this._onDidUpload.fire({
        success: true,
        totalCount,
      });
      return;
    }

    // 真实上报模式
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 上传成功
      this._onDidUpload.fire({
        success: true,
        totalCount,
      });

      console.log(`[TelemetryService] Uploaded statistics with ${totalCount} operations`);
    } catch (error) {
      // 上传失败，存入离线队列
      console.error('[TelemetryService] Upload failed:', error);
      
      await this.addToOfflineQueue(payload);

      this._onDidUpload.fire({
        success: false,
        totalCount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 使用 sendBeacon 发送数据（页面关闭时使用）
   */
  private sendBeacon(): boolean {
    // 记录会话结束
    this.trackSessionEnd();

    // 获取当前 pane 数量（瞬时值）
    if (this.paneCountGetter) {
      this.statistics.ui.paneCount = this.paneCountGetter();
    }

    const totalCount = calculateTotalCount(this.statistics);
    if (totalCount === 0) {
      return true; // 没有数据，直接返回成功
    }

    // 清理空字段，节省带宽（服务器会默认没有的字段为空或 0）
    const cleanedStats = cleanEmptyFields(this.statistics) || {};

    const payload: TelemetryPayload = {
      userId: this.userId,
      sessionId: this.sessionId,
      version: this.config.version,
      timestamp: Date.now(),
      statistics: cleanedStats as AggregatedStatistics,
    };

    // 如果 endpoint 为空或为 'console'，则只在控制台打印（调试模式）
    if (!this.config.endpoint || this.config.endpoint === 'console') {
      console.log('%c[TelemetryService] 📊 模拟 Beacon 上报 (Debug Mode)', 'color: #ff9800; font-weight: bold; font-size: 14px');
      console.log('═'.repeat(80));
      console.log('📤 Beacon 数据:', JSON.stringify(payload, null, 2));
      console.log('═'.repeat(80));
      console.log(`✅ 模拟 Beacon 成功: ${totalCount} 个操作`);
      console.log('');
      return true;
    }

    // 真实 Beacon 模式
    try {
      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json',
      });
      
      const success = navigator.sendBeacon(this.config.endpoint, blob);
      
      if (success) {
        console.log(`[TelemetryService] Beacon sent with ${totalCount} operations`);
      } else {
        console.warn('[TelemetryService] Beacon failed, adding to offline queue');
        this.addToOfflineQueue(payload);
      }
      
      return success;
    } catch (error) {
      console.error('[TelemetryService] Beacon error:', error);
      return false;
    }
  }

  /**
   * 添加到离线队列
   */
  private async addToOfflineQueue(payload: TelemetryPayload): Promise<void> {
    try {
      let queue = await this.storageService.get<TelemetryPayload[]>(STORAGE_KEY_OFFLINE_QUEUE) || [];
      
      // 添加新数据
      queue.push(payload);
      
      // 限制队列大小（最多保留 10 个）
      if (queue.length > 10) {
        queue = queue.slice(-10);
      }
      
      await this.storageService.set(STORAGE_KEY_OFFLINE_QUEUE, queue);
    } catch (error) {
      console.error('[TelemetryService] Failed to add to offline queue:', error);
    }
  }

  /**
   * 处理离线队列
   */
  private async processOfflineQueue(): Promise<void> {
    try {
      const queue = await this.storageService.get<TelemetryPayload[]>(STORAGE_KEY_OFFLINE_QUEUE);
      
      if (!queue || queue.length === 0) {
        return;
      }

      console.log(`[TelemetryService] Processing ${queue.length} offline payloads`);
      
      // 清空队列
      await this.storageService.remove(STORAGE_KEY_OFFLINE_QUEUE);
      
      // 尝试上传每个 payload
      for (const payload of queue) {
        if (this.config.endpoint && this.config.endpoint !== 'console') {
          try {
            await fetch(this.config.endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            });
          } catch (error) {
            console.error('[TelemetryService] Failed to upload offline payload:', error);
          }
        }
      }
    } catch (error) {
      console.error('[TelemetryService] Failed to process offline queue:', error);
    }
  }

  /**
   * 启动定时上传
   */
  private startUploadTimer(): void {
    if (this.uploadTimer) {
      return;
    }

    this.uploadTimer = setInterval(() => {
      this.flush();
    }, this.config.uploadInterval);

    console.log(`[TelemetryService] Upload timer started (${this.config.uploadInterval}ms interval)`);
  }

  /**
   * 停止定时上传
   */
  private stopUploadTimer(): void {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
      this.uploadTimer = null;
      console.log('[TelemetryService] Upload timer stopped');
    }
  }

  /**
   * 注册页面关闭处理
   */
  private registerExitHandler(): void {
    const handler = () => {
      // 使用 sendBeacon 发送最后的数据
      this.sendBeacon();
    };

    window.addEventListener('beforeunload', handler);

    // 注册清理
    this._register({
      dispose: () => {
        window.removeEventListener('beforeunload', handler);
      },
    });
  }

  // ==================== 生命周期 ====================

  override dispose(): void {
    // 停止定时器
    this.stopUploadTimer();

    // 最后一次上传
    this.sendBeacon();

    // 清理事件发射器
    this._onDidUpload.dispose();

    super.dispose();
  }
}
