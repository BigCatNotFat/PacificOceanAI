import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import { injectable } from '../../platform/instantiation';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { IStorageService } from '../../platform/storage/storage';
import type {
  IConfigurationService,
  APIConfig,
  AIModelConfig,
  ConnectivityTestResult,
  ConfigurationChangeEvent
} from '../../platform/configuration/configuration';
import { API_ENDPOINTS } from '../../base/common/apiConfig';

/**
 * 配置服务实现
 * 
 * 职责：
 * - 管理 API 配置（API Key、Base URL）
 * - 管理自定义模型列表
 * - 测试 API 连通性
 * - 持久化配置到存储
 * - 发射配置变化事件
 */
@injectable(IStorageServiceId)
export class ConfigurationService extends Disposable implements IConfigurationService {
  private readonly _onDidChangeConfiguration = new Emitter<ConfigurationChangeEvent>();
  readonly onDidChangeConfiguration: Event<ConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

  private static readonly STORAGE_KEY = 'ai.api.config';

  constructor(
    private readonly storageService: IStorageService
  ) {
    super();
    
    // 监听存储变化
    this._register(
      this.storageService.onDidChangeStorage((change) => {
        if (change.key === ConfigurationService.STORAGE_KEY) {
          this._onDidChangeConfiguration.fire({
            key: 'apiConfig',
            oldValue: change.oldValue,
            newValue: change.newValue
          });
        }
      })
    );
  }

  /**
   * 根据连通性测试结果同步模型列表
   */
  async syncModelsFromConnectivityResult(availableModels: string[]): Promise<{ added: number; enabled: number; disabled: number }> {
    let added = 0;
    let enabled = 0;
    let disabled = 0;

    if (!availableModels || availableModels.length === 0) {
      return { added, enabled, disabled };
    }

    const currentConfig = await this.getAPIConfig();
    if (!currentConfig) {
      return { added, enabled, disabled };
    }

    const availableModelSet = new Set(availableModels);
    
    // 先对现有模型列表去重（修复历史数据中可能存在的重复）
    const seenIds = new Set<string>();
    const deduplicatedModels: AIModelConfig[] = [];
    for (const model of currentConfig.models) {
      if (!seenIds.has(model.id)) {
        seenIds.add(model.id);
        deduplicatedModels.push(model);
      }
    }
    
    // 如果去重后数量变少了，说明有重复数据
    const hadDuplicates = deduplicatedModels.length < currentConfig.models.length;
    if (hadDuplicates) {
      console.log(`[ConfigurationService] Removed ${currentConfig.models.length - deduplicatedModels.length} duplicate models`);
    }
    currentConfig.models = deduplicatedModels;
    
    const existingModelIds = new Set(currentConfig.models.map(m => m.id));
    let configChanged = hadDuplicates;  // 如果有去重，标记为已变更

    // 1. 添加新检测到的模型（设为启用）
    for (const modelId of availableModels) {
      if (!existingModelIds.has(modelId)) {
        currentConfig.models.push({
          id: modelId,
          name: modelId,
          description: '自动检测的模型',
          enabled: true
        });
        existingModelIds.add(modelId);  // 同步更新 Set，防止在同一次调用中重复添加
        added++;
        configChanged = true;
      }
    }

    // 2. 更新所有模型的启用状态
    for (let i = 0; i < currentConfig.models.length; i++) {
      const model = currentConfig.models[i];
      const shouldBeEnabled = availableModelSet.has(model.id);

      if (model.enabled !== shouldBeEnabled) {
        currentConfig.models[i] = { ...model, enabled: shouldBeEnabled };
        if (shouldBeEnabled) {
          enabled++;
        } else {
          disabled++;
        }
        configChanged = true;
      }
    }

    if (configChanged) {
      await this.setAPIConfig(currentConfig);
    }

    return { added, enabled, disabled };
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): APIConfig {
    return {
      apiKey: '',
      baseUrl: '',
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 获取 API 配置
   */
  async getAPIConfig(): Promise<APIConfig | null> {
    try {
      const config = await this.storageService.get<APIConfig>(
        ConfigurationService.STORAGE_KEY
      );
      
      if (!config) {
        return this.getDefaultConfig();
      }
      
      return config;
    } catch (error) {
      console.error('[ConfigurationService] Failed to get API config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * 设置 API 配置
   */
  async setAPIConfig(config: APIConfig): Promise<void> {
    try {
      const updatedConfig: APIConfig = {
        ...config,
        updatedAt: Date.now()
      };
      
      await this.storageService.set(ConfigurationService.STORAGE_KEY, updatedConfig);
    } catch (error) {
      console.error('[ConfigurationService] Failed to set API config:', error);
      throw error;
    }
  }

  /**
   * 添加自定义模型
   */
  async addModel(model: AIModelConfig): Promise<void> {
    const config = await this.getAPIConfig();
    if (!config) return;

    // 检查是否已存在
    const exists = config.models.some(m => m.id === model.id);
    if (exists) {
      throw new Error(`Model with id "${model.id}" already exists`);
    }

    config.models.push(model);
    await this.setAPIConfig(config);
  }

  /**
   * 更新模型配置
   */
  async updateModel(modelId: string, updates: Partial<AIModelConfig>): Promise<void> {
    const config = await this.getAPIConfig();
    if (!config) return;

    const modelIndex = config.models.findIndex(m => m.id === modelId);
    if (modelIndex === -1) {
      throw new Error(`Model with id "${modelId}" not found`);
    }

    config.models[modelIndex] = {
      ...config.models[modelIndex],
      ...updates
    };

    await this.setAPIConfig(config);
  }

  /**
   * 删除模型
   */
  async removeModel(modelId: string): Promise<void> {
    const config = await this.getAPIConfig();
    if (!config) return;

    config.models = config.models.filter(m => m.id !== modelId);
    await this.setAPIConfig(config);
  }

  /**
   * 获取所有模型（已去重）
   */
  async getModels(): Promise<AIModelConfig[]> {
    const config = await this.getAPIConfig();
    const models = config?.models || [];
    
    // 去重：根据 id 保留第一个出现的模型
    const seen = new Set<string>();
    const uniqueModels: AIModelConfig[] = [];
    for (const model of models) {
      if (!seen.has(model.id)) {
        seen.add(model.id);
        uniqueModels.push(model);
      }
    }
    
    return uniqueModels;
  }

  /**
   * 测试 API 连通性
   */
  async testConnectivity(apiKey: string, baseUrl: string): Promise<ConnectivityTestResult> {
    const startTime = Date.now();

    try {
      const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const isGemini = normalizedUrl.includes('generativelanguage.googleapis.com');

      let testUrl: string;
      let fetchOptions: RequestInit;

      if (isGemini) {
        // Gemini 原生 API：key 在查询参数中
        const base = normalizedUrl.replace(/\/openai\/?$/, '');
        testUrl = `${base}/models?key=${apiKey}`;
        fetchOptions = {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        };
      } else {
        // OpenAI 及兼容 API：Bearer token
        testUrl = `${normalizedUrl}/models`;
        fetchOptions = {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        };
      }

      const response = await fetch(testUrl, fetchOptions);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          latency,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`
        };
      }

      const data = await response.json();

      // OpenAI 返回 data.data[]，Gemini 返回 data.models[]
      let availableModels: string[] = [];
      if (data.data) {
        availableModels = data.data.map((m: any) => m.id);
      } else if (data.models) {
        availableModels = data.models.map((m: any) => {
          const name: string = m.name || '';
          return name.startsWith('models/') ? name.slice(7) : name;
        });
      }

      return {
        success: true,
        latency,
        availableModels
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  override dispose(): void {
    this._onDidChangeConfiguration.dispose();
    super.dispose();
  }
}
