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
   * 获取默认配置
   */
  getDefaultConfig(): APIConfig {
    return {
      apiKey: '',
      baseUrl: 'https://api.silicondream.top/v1',
      models: [],
      isVerified: false,
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
      
      // 强制使用固定的 Base URL
      return {
        ...config,
        baseUrl: 'https://api.silicondream.top/v1'
      };
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
   * 获取所有模型
   */
  async getModels(): Promise<AIModelConfig[]> {
    const config = await this.getAPIConfig();
    return config?.models || [];
  }

  /**
   * 测试 API 连通性
   */
  async testConnectivity(apiKey: string, baseUrl: string): Promise<ConnectivityTestResult> {
    const startTime = Date.now();

    try {
      // 规范化 URL
      const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const testUrl = `${normalizedUrl}/models`;

      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

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
      const availableModels = data.data?.map((model: any) => model.id) || [];

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
