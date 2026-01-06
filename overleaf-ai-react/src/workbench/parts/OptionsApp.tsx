import React, { useState, useEffect } from 'react';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService, AIModelConfig, APIConfig } from '../../platform/configuration/configuration';

/**
 * Options 设置页面主组件
 * 在独立的标签页中显示完整的设置界面
 */
const OptionsApp: React.FC = () => {
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  
  const [settings, setSettings] = useState({
    autoStart: false,
    notifications: true,
    theme: 'auto',
    fontSize: 14,
  });

  const [apiConfig, setApiConfig] = useState<APIConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 新模型表单状态
  const [newModel, setNewModel] = useState<Partial<AIModelConfig>>({
    id: '',
    name: '',
    description: '',
    enabled: true
  });
  const [showAddModel, setShowAddModel] = useState(false);
  
  // 当前选中的设置分类
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'ai'>('general');

  // 加载保存的设置
  useEffect(() => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings(prev => ({ ...prev, ...result.settings }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载 API 配置
  useEffect(() => {
    configService.getAPIConfig().then(config => {
      setApiConfig(config);
    });
  }, [configService]);

  // 保存通用设置
  const saveSettings = () => {
    chrome.storage.sync.set({ settings }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  // 更新单个设置项
  const updateSetting = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  // 保存 API 配置
  const saveAPIConfig = async () => {
    if (!apiConfig) return;
    
    try {
      await configService.setAPIConfig(apiConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      // 同步激活状态到注入脚本（根据 isVerified 字段）
      const isActivated = !!(apiConfig.apiKey && apiConfig.isVerified);
      window.postMessage({
        type: 'OVERLEAF_ACTIVATION_STATUS_UPDATE',
        data: { isActivated }
      }, '*');
      console.log('[OptionsApp] Config saved, activation status:', isActivated);
    } catch (error) {
      console.error('Failed to save API config:', error);
      alert('保存失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 测试连通性
  const testConnection = async () => {
    if (!apiConfig) return;
    
    setTestingConnection(true);
    setTestResult(null);
    
    // 保存当前的 API Key 和 Base URL（防止被覆盖）
    const currentApiKey = apiConfig.apiKey;
    const currentBaseUrl = apiConfig.baseUrl;
    
    try {
      const result = await configService.testConnectivity(apiConfig.apiKey, apiConfig.baseUrl);
      
      if (result.success) {
        let addedCount = 0;
        let enabledCount = 0;
        let disabledCount = 0;
        
        if (result.availableModels && result.availableModels.length > 0) {
          const availableModelSet = new Set(result.availableModels);
          
          console.log('[测试连通性] 检测到的可用模型:', result.availableModels);
          console.log('[测试连通性] 当前配置的模型:', apiConfig.models.map(m => `${m.id} (${m.enabled ? '启用' : '禁用'})`));
          
          const existingModelIds = new Set(apiConfig.models.map(m => m.id));
          
          // 1. 添加新检测到的模型（设为启用）
          for (const modelId of result.availableModels) {
            if (!existingModelIds.has(modelId)) {
              try {
                await configService.addModel({
                  id: modelId,
                  name: modelId,
                  description: '自动检测的模型',
                  enabled: true
                });
                addedCount++;
                console.log(`[测试连通性] 添加新模型: ${modelId}`);
              } catch (error) {
                console.warn(`Failed to add model ${modelId}:`, error);
              }
            }
          }
          
          // 2. 重新加载配置（包含新添加的模型）
          let currentConfig = await configService.getAPIConfig();
          if (!currentConfig) return;
          
          console.log('[测试连通性] 重新加载后的模型:', currentConfig.models.map(m => `${m.id} (${m.enabled ? '启用' : '禁用'})`));
          
          // 3. 更新所有模型的启用状态
          for (const model of currentConfig.models) {
            const shouldBeEnabled = availableModelSet.has(model.id);
            
            console.log(`[测试连通性] 检查模型 ${model.id}: 当前=${model.enabled}, 应为=${shouldBeEnabled}`);
            
            // 只在状态需要改变时才更新
            if (model.enabled !== shouldBeEnabled) {
              try {
                await configService.updateModel(model.id, { enabled: shouldBeEnabled });
                if (shouldBeEnabled) {
                  enabledCount++;
                  console.log(`[测试连通性] ✓ 启用模型: ${model.id}`);
                } else {
                  disabledCount++;
                  console.log(`[测试连通性] ✗ 禁用模型: ${model.id}`);
                }
              } catch (error) {
                console.warn(`Failed to update model ${model.id}:`, error);
              }
            } else if (shouldBeEnabled) {
              enabledCount++;
              console.log(`[测试连通性] = 模型已是正确状态(启用): ${model.id}`);
            } else {
              console.log(`[测试连通性] = 模型已是正确状态(禁用): ${model.id}`);
            }
          }
          
          // 4. 再次加载配置以显示最终状态
          const updatedConfig = await configService.getAPIConfig();
          
          // 恢复 API Key 和 Base URL（保持用户输入的值）
          if (updatedConfig) {
            updatedConfig.apiKey = currentApiKey;
            updatedConfig.baseUrl = currentBaseUrl;
            updatedConfig.isVerified = true;  // 测试成功，标记为已验证
            setApiConfig(updatedConfig);
            
            console.log('[测试连通性] 最终状态:', updatedConfig.models.map(m => `${m.id} (${m.enabled ? '启用' : '禁用'})`));
            
            // 5. 自动保存 API 配置（包含 API Key 和 Base URL）
            await configService.setAPIConfig(updatedConfig);
            
            // 同步激活状态到注入脚本
            window.postMessage({
              type: 'OVERLEAF_ACTIVATION_STATUS_UPDATE',
              data: { isActivated: true }
            }, '*');
            console.log('[OptionsApp] Test successful, sent activation status update');
          }
        }
        
        // 构建详细的结果消息
        const messages = [
          `连接成功！延迟 ${result.latency}ms`,
          `检测到 ${result.availableModels?.length || 0} 个可用模型`
        ];
        
        if (addedCount > 0) {
          messages.push(`新增 ${addedCount} 个模型`);
        }
        if (enabledCount > 0) {
          messages.push(`已启用 ${enabledCount} 个模型`);
        }
        if (disabledCount > 0) {
          messages.push(`已禁用 ${disabledCount} 个不可用模型`);
        }
        
        messages.push('配置已自动保存');
        
        setTestResult({
          success: true,
          message: messages.join('\n')
        });
        
        // 显示保存成功提示
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setTestResult({
          success: false,
          message: `连接失败：${result.error}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: '测试失败：' + (error instanceof Error ? error.message : String(error))
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // 添加新模型
  const addModel = async () => {
    if (!apiConfig || !newModel.id || !newModel.name) {
      alert('请填写模型 ID 和名称');
      return;
    }
    
    try {
      await configService.addModel({
        id: newModel.id,
        name: newModel.name,
        description: newModel.description || '',
        enabled: newModel.enabled ?? true
      });
      
      // 重新加载配置
      const updatedConfig = await configService.getAPIConfig();
      setApiConfig(updatedConfig);
      
      // 重置表单
      setNewModel({
        id: '',
        name: '',
        description: '',
        enabled: true
      });
      setShowAddModel(false);
    } catch (error) {
      alert('添加失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 删除模型
  const removeModel = async (modelId: string) => {
    if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return;
    
    try {
      await configService.removeModel(modelId);
      
      // 重新加载配置
      const updatedConfig = await configService.getAPIConfig();
      setApiConfig(updatedConfig);
    } catch (error) {
      alert('删除失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 切换模型启用状态
  const toggleModel = async (modelId: string, enabled: boolean) => {
    try {
      await configService.updateModel(modelId, { enabled });
      
      // 重新加载配置
      const updatedConfig = await configService.getAPIConfig();
      setApiConfig(updatedConfig);
    } catch (error) {
      alert('更新失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 渲染不同标签页的内容
  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div>
            <h2 style={styles.contentTitle}>通用设置</h2>
            <p style={styles.contentSubtitle}>配置扩展的基本行为和功能</p>
            
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <div style={styles.settingName}>自动启动助手</div>
                <div style={styles.settingDescription}>在打开 Overleaf 页面时自动激活 AI 助手功能</div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.autoStart}
                  onChange={(e) => updateSetting('autoStart', e.target.checked)}
                  style={styles.checkbox}
                />
              </label>
            </div>

            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <div style={styles.settingName}>显示通知</div>
                <div style={styles.settingDescription}>接收重要的操作提示和状态更新</div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => updateSetting('notifications', e.target.checked)}
                  style={styles.checkbox}
                />
              </label>
            </div>
          </div>
        );
      
      case 'appearance':
        return (
          <div>
            <h2 style={styles.contentTitle}>外观设置</h2>
            <p style={styles.contentSubtitle}>自定义扩展的视觉样式</p>
            
            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <div style={styles.settingName}>主题</div>
                <div style={styles.settingDescription}>选择你喜欢的界面主题风格</div>
              </div>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting('theme', e.target.value)}
                style={styles.select}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="auto">跟随系统</option>
              </select>
            </div>

            <div style={styles.settingRow}>
              <div style={styles.settingInfo}>
                <div style={styles.settingName}>字体大小</div>
                <div style={styles.settingDescription}>调整界面文字的显示大小（12-20px）</div>
              </div>
              <input
                type="number"
                min="12"
                max="20"
                value={settings.fontSize}
                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </div>
          </div>
        );
      
      case 'ai':
        return (
          <div>
            <h2 style={styles.contentTitle}>AI 配置</h2>
            <p style={styles.contentSubtitle}>配置 AI 服务的连接参数</p>
            
            {apiConfig && (
              <>
                <div style={styles.settingRow}>
                  <div style={styles.settingInfo}>
                    <div style={styles.settingName}>启动码</div>
                    <div style={styles.settingDescription}>请输入获取的启动码以使用 AI 服务（修改后需重新测试）</div>
                  </div>
                  <input
                    type="password"
                    value={apiConfig.apiKey}
                    onChange={(e) => setApiConfig({ 
                      ...apiConfig, 
                      apiKey: e.target.value,
                      isVerified: false  // 修改后需要重新验证
                    })}
                    placeholder="请输入启动码"
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.settingRow}>
                  <div style={styles.settingInfo}>
                    <div style={styles.settingName}>查询额度</div>
                    <div style={styles.settingDescription}>
                      查询启动码的剩余使用额度，请访问：
                      <a 
                        href="https://api.silicondream.top/query" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={styles.link}
                      >
                        https://api.silicondream.top/query
                      </a>
                    </div>
                  </div>
                </div>

                <div style={styles.settingRow}>
                  <div style={styles.settingInfo}>
                    <div style={styles.settingName}>连接测试</div>
                    <div style={styles.settingDescription}>验证 API 配置是否正确并检测可用模型</div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={testConnection}
                      disabled={testingConnection || !apiConfig.apiKey || !apiConfig.baseUrl}
                      style={{
                        ...styles.testButton,
                        ...(testingConnection ? styles.testButtonDisabled : {})
                      }}
                    >
                      {testingConnection ? '测试中...' : '测试连通性'}
                    </button>
                    <button
                      onClick={saveAPIConfig}
                      style={styles.saveButton}
                    >
                      保存配置
                    </button>
                  </div>
                </div>
                
                {testResult && (
                  <div style={{
                    ...styles.testResult,
                    ...(testResult.success ? styles.testResultSuccess : styles.testResultError)
                  }}>
                    <strong>{testResult.success ? '✓' : '✗'}</strong>
                    <span style={{ whiteSpace: 'pre-line' }}>{testResult.message}</span>
                  </div>
                )}

                {/* 自定义模型管理 */}
                <div style={{ marginTop: '40px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ ...styles.contentTitle, fontSize: '20px', marginBottom: '8px' }}>自定义模型</h3>
                      <p style={{ ...styles.contentSubtitle, marginTop: 0, marginBottom: 0 }}>管理可用的 AI 模型列表</p>
                    </div>
                    <button
                      onClick={() => setShowAddModel(!showAddModel)}
                      style={styles.addButton}
                    >
                      {showAddModel ? '取消' : '+ 添加模型'}
                    </button>
                  </div>

                  {showAddModel && (
                    <div style={styles.addModelForm}>
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>模型 ID *</label>
                        <input
                          type="text"
                          value={newModel.id}
                          onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                          placeholder="例如: gpt-4, claude-3-opus"
                          style={styles.formInput}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>模型名称 *</label>
                        <input
                          type="text"
                          value={newModel.name}
                          onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                          placeholder="例如: GPT-4"
                          style={styles.formInput}
                        />
                      </div>
                      
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>描述（可选）</label>
                        <input
                          type="text"
                          value={newModel.description}
                          onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                          placeholder="模型描述信息"
                          style={styles.formInput}
                        />
                      </div>
                      
                      <button onClick={addModel} style={styles.submitButton}>
                        添加模型
                      </button>
                    </div>
                  )}

                  <div style={styles.modelList}>
                    {apiConfig.models.map((model) => (
                      <div key={model.id} style={styles.modelItem}>
                        <div style={styles.modelInfo}>
                          <div style={styles.modelHeader}>
                            <strong style={styles.modelName}>{model.name}</strong>
                            <span style={styles.modelId}>{model.id}</span>
                          </div>
                          {model.description && (
                            <p style={styles.modelDescription}>{model.description}</p>
                          )}
                        </div>
                        
                        <div style={styles.modelActions}>
                          <label style={styles.switchLabel}>
                            <input
                              type="checkbox"
                              checked={model.enabled}
                              onChange={(e) => toggleModel(model.id, e.target.checked)}
                              style={styles.checkbox}
                            />
                            <span style={styles.switchText}>
                              {model.enabled ? '启用' : '禁用'}
                            </span>
                          </label>
                          
                          <button
                            onClick={() => removeModel(model.id)}
                            style={styles.deleteButton}
                            title="删除模型"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {(!apiConfig.models || apiConfig.models.length === 0) && (
                      <div style={styles.emptyState}>
                        暂无自定义模型，点击"添加模型"开始配置
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>PacificOceanAI</h1>
        <div style={styles.headerActions}>
          <button
            onClick={saveSettings}
            style={{
              ...styles.headerButton,
              ...(saved ? styles.headerButtonSuccess : {})
            }}
          >
            {saved ? '✓ 已保存' : '保存设置'}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div style={styles.mainLayout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <nav style={styles.nav}>
            <button
              onClick={() => setActiveTab('general')}
              style={{
                ...styles.navItem,
                ...(activeTab === 'general' ? styles.navItemActive : {})
              }}
            >
              通用设置
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              style={{
                ...styles.navItem,
                ...(activeTab === 'appearance' ? styles.navItemActive : {})
              }}
            >
              外观设置
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              style={{
                ...styles.navItem,
                ...(activeTab === 'ai' ? styles.navItemActive : {})
              }}
            >
              AI 配置
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main style={styles.content}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

// Inline styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: '240px',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
  },
  headerButton: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#4a90e2',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  headerButtonSuccess: {
    backgroundColor: '#28a745',
  },
  mainLayout: {
    display: 'flex',
    flex: 1,
  },
  sidebar: {
    width: '240px',
    backgroundColor: 'white',
    borderRight: '1px solid #e0e0e0',
    padding: '24px 0',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    overflowY: 'auto',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
  },
  navItem: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    backgroundColor: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navItemActive: {
    color: '#4a90e2',
    backgroundColor: '#f0f7ff',
    borderLeftColor: '#4a90e2',
  },
  content: {
    flex: 1,
    padding: '40px',
    overflowY: 'auto',
    backgroundColor: '#f5f5f5',
    height: '100%',
  },
  contentTitle: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: '600',
    color: '#333',
  },
  contentSubtitle: {
    margin: '0 0 32px 0',
    fontSize: '14px',
    color: '#666',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    gap: '20px',
  },
  settingInfo: {
    flex: 1,
  },
  settingName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px',
  },
  settingDescription: {
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5',
  },
  switch: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  select: {
    minWidth: '200px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  textInput: {
    minWidth: '300px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box',
  },
  numberInput: {
    width: '100px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    textAlign: 'center',
  },
  saveButton: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#4a90e2',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  testButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#28a745',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  testButtonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  testResult: {
    marginTop: '15px',
    padding: '12px 15px',
    borderRadius: '6px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  testResultSuccess: {
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  testResultError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
  },
  addButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#4a90e2',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  addModelForm: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
  },
  formInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box',
  },
  submitButton: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#28a745',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modelList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  modelItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease',
  },
  modelInfo: {
    flex: 1,
  },
  modelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '6px',
  },
  modelName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333',
  },
  modelId: {
    fontSize: '12px',
    color: '#666',
    backgroundColor: '#f0f0f0',
    padding: '3px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  modelDescription: {
    margin: 0,
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5',
  },
  modelActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  switchLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  switchText: {
    fontSize: '14px',
    color: '#333',
    userSelect: 'none',
  },
  deleteButton: {
    padding: '6px 12px',
    fontSize: '13px',
    color: '#dc3545',
    backgroundColor: 'transparent',
    border: '1px solid #dc3545',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999',
    fontSize: '14px',
    backgroundColor: 'white',
    borderRadius: '8px',
  },
  link: {
    color: '#4a90e2',
    textDecoration: 'none',
    fontWeight: '500',
    marginLeft: '4px',
  },
};

export default OptionsApp;
