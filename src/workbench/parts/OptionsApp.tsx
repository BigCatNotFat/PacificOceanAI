import React, { useState, useEffect } from 'react';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService, AIModelConfig, APIConfig } from '../../platform/configuration/configuration';
import { codexOAuthService } from '../../services/auth/CodexOAuthService';

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
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 当前选中的设置分类
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'ai'>('general');

  // 添加模型表单
  const [formProvider, setFormProvider] = useState<'openai' | 'gemini' | 'deepseek' | 'moonshot' | 'qwen'>('openai');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('https://api.openai.com/v1');
  const [formModelName, setFormModelName] = useState('');
  const [showFormKey, setShowFormKey] = useState(false);

  // 模型列表拉取
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // 每个模型的 key 可见性
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Codex OAuth 状态
  const [codexLoggedIn, setCodexLoggedIn] = useState(false);
  const [codexLoggingIn, setCodexLoggingIn] = useState(false);
  const [codexError, setCodexError] = useState('');
  const [codexModelName, setCodexModelName] = useState('');
  const [codexAddResult, setCodexAddResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // 加载 Codex OAuth 登录状态
  useEffect(() => {
    codexOAuthService.isLoggedIn().then(setCodexLoggedIn);
  }, []);

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

  // Codex OAuth 登录
  const handleCodexLogin = async () => {
    setCodexLoggingIn(true);
    setCodexError('');
    try {
      await codexOAuthService.login();
      setCodexLoggedIn(true);
    } catch (error) {
      setCodexError(error instanceof Error ? error.message : String(error));
    } finally {
      setCodexLoggingIn(false);
    }
  };

  // Codex OAuth 登出
  const handleCodexLogout = async () => {
    await codexOAuthService.logout();
    setCodexLoggedIn(false);
    setCodexError('');
  };

  // 添加 Codex OAuth 模型
  const addCodexModel = async () => {
    const name = codexModelName.trim();
    if (!name) { alert('请输入模型名称'); return; }

    setCodexAddResult(null);
    try {
      await configService.addModel({
        id: name,
        name,
        enabled: true,
        provider: 'codex-oauth',
        apiKey: '',
        baseUrl: 'https://chatgpt.com/backend-api'
      });
      const updated = await configService.getAPIConfig();
      setApiConfig(updated);
      setCodexModelName('');
      setCodexAddResult({ success: true, message: `模型 "${name}" 添加成功` });
    } catch (error) {
      setCodexAddResult({ success: false, message: '添加失败：' + (error instanceof Error ? error.message : String(error)) });
    }
  };

  // 供应商切换时自动填充默认 Base URL 并清空模型列表
  const providerDefaultUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  };

  const handleProviderChange = (p: 'openai' | 'gemini' | 'deepseek' | 'moonshot' | 'qwen') => {
    setFormProvider(p);
    setFormBaseUrl(providerDefaultUrls[p] || 'https://api.openai.com/v1');
    setFetchedModels([]);
    setFormModelName('');
    setFetchError('');
  };

  // 从 API 拉取可用模型列表
  const fetchModelList = async () => {
    const key = formApiKey.trim();
    const url = formBaseUrl.trim();
    if (!key || !url) { setFetchError('请先填写 API Key 和 Base URL'); return; }

    setFetching(true);
    setFetchError('');
    setFetchedModels([]);

    try {
      const result = await configService.testConnectivity(key, url);
      if (!result.success) {
        setFetchError(`连接失败：${result.error}`);
        return;
      }
      const models = result.availableModels || [];
      if (models.length === 0) {
        setFetchError('连接成功，但未检测到可用模型');
        return;
      }
      setFetchedModels(models);
      setFormModelName(models[0]);
    } catch (error) {
      setFetchError('获取失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setFetching(false);
    }
  };

  // 添加模型（模型列表已通过获取验证连通性，直接保存）
  const addModel = async () => {
    const name = formModelName.trim();
    const key = formApiKey.trim();
    const url = formBaseUrl.trim();
    if (!name) { alert('请先选择模型'); return; }
    if (!key) { alert('请输入 API Key'); return; }
    if (!url) { alert('请输入 Base URL'); return; }

    setAdding(true);
    setAddResult(null);

    try {
      await configService.addModel({
        id: name,
        name,
        enabled: true,
        provider: formProvider,
        apiKey: key,
        baseUrl: url
      });
      const updated = await configService.getAPIConfig();
      setApiConfig(updated);
      // 从可选列表中移除已添加的模型
      setFetchedModels(prev => prev.filter(m => m !== name));
      const remaining = fetchedModels.filter(m => m !== name);
      setFormModelName(remaining[0] || '');
      setAddResult({ success: true, message: `模型 "${name}" 添加成功` });
    } catch (error) {
      setAddResult({ success: false, message: '添加失败：' + (error instanceof Error ? error.message : String(error)) });
    } finally {
      setAdding(false);
    }
  };

  // 删除模型
  const removeModel = async (modelId: string) => {
    if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return;
    try {
      await configService.removeModel(modelId);
      const updated = await configService.getAPIConfig();
      setApiConfig(updated);
    } catch (error) {
      alert('删除失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 切换模型启用 / 禁用
  const toggleModel = async (modelId: string, enabled: boolean) => {
    try {
      await configService.updateModel(modelId, { enabled });
      const updated = await configService.getAPIConfig();
      setApiConfig(updated);
    } catch (error) {
      alert('更新失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 切换单个模型 key 可见性
  const toggleKeyVisibility = (modelId: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId); else next.add(modelId);
      return next;
    });
  };

  // 遮蔽 API Key 显示
  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
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
            <p style={styles.contentSubtitle}>添加模型并配置对应的供应商、API Key，添加后的模型才可以在对话中使用</p>
            
            {apiConfig && (
              <>
                {/* Codex OAuth 登录区域 */}
                <div style={styles.providerSection}>
                  <h3 style={styles.providerTitle}>ChatGPT 订阅登录</h3>
                  <p style={styles.providerDesc}>使用 ChatGPT Plus/Pro/Business 订阅直接访问 OpenAI 模型，无需 API Key 额外计费</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 登录状态 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: codexLoggedIn ? '#28a745' : '#dc3545',
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '14px', color: '#333', fontWeight: 500 }}>
                        {codexLoggedIn ? '已登录 ChatGPT' : '未登录'}
                      </span>
                      {codexLoggedIn ? (
                        <button onClick={handleCodexLogout} style={{
                          ...styles.deleteButton,
                          marginLeft: 'auto'
                        }}>
                          退出登录
                        </button>
                      ) : (
                        <button
                          onClick={handleCodexLogin}
                          disabled={codexLoggingIn}
                          style={{
                            ...styles.submitButton,
                            marginLeft: 'auto',
                            backgroundColor: '#10a37f',
                            opacity: codexLoggingIn ? 0.6 : 1,
                            cursor: codexLoggingIn ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {codexLoggingIn ? '登录中...' : '登录 ChatGPT'}
                        </button>
                      )}
                    </div>

                    {codexError && (
                      <div style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' }}>
                        {codexError}
                      </div>
                    )}

                    {/* 登录后：添加 Codex 模型 */}
                    {codexLoggedIn && (
                      <>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
                          <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', minWidth: '70px' }}>模型名称</label>
                          <input
                            type="text"
                            value={codexModelName}
                            onChange={(e) => setCodexModelName(e.target.value)}
                            placeholder="例如: o3, gpt-4.1, codex-mini"
                            style={{ ...styles.formInput, flex: 1 }}
                          />
                          <button
                            onClick={addCodexModel}
                            disabled={!codexModelName.trim()}
                            style={{
                              ...styles.submitButton,
                              whiteSpace: 'nowrap',
                              opacity: !codexModelName.trim() ? 0.6 : 1,
                              cursor: !codexModelName.trim() ? 'not-allowed' : 'pointer'
                            }}
                          >
                            添加模型
                          </button>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
                          输入你的订阅可用的模型名称，添加后即可在对话中使用。常用模型：o3, o4-mini, gpt-4.1, codex-mini
                        </p>

                        {codexAddResult && (
                          <div style={{
                            padding: '10px 14px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            backgroundColor: codexAddResult.success ? '#d4edda' : '#f8d7da',
                            color: codexAddResult.success ? '#155724' : '#721c24',
                            border: `1px solid ${codexAddResult.success ? '#c3e6cb' : '#f5c6cb'}`
                          }}>
                            {codexAddResult.success ? '✓ ' : '✗ '}{codexAddResult.message}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 添加模型表单 */}
                <div style={styles.providerSection}>
                  <h3 style={styles.providerTitle}>添加模型</h3>
                  <p style={styles.providerDesc}>每个模型需要指定供应商、API Key 和模型名称</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', minWidth: '70px' }}>供应商</label>
                      <select
                        value={formProvider}
                        onChange={(e) => handleProviderChange(e.target.value as 'openai' | 'gemini' | 'deepseek' | 'moonshot' | 'qwen')}
                        style={{ ...styles.select, flex: 1 }}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="moonshot">Moonshot / Kimi</option>
                        <option value="qwen">Qwen / 通义千问</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', minWidth: '70px' }}>API Key</label>
                      <div style={{ ...styles.inputWithButton, flex: 1 }}>
                        <input
                          type={showFormKey ? 'text' : 'password'}
                          value={formApiKey}
                          onChange={(e) => setFormApiKey(e.target.value)}
                          placeholder={formProvider === 'gemini' ? 'AIza...' : formProvider === 'qwen' ? 'sk-...' : 'sk-...'}
                          style={{ ...styles.formInput, width: '100%', paddingRight: '40px' }}
                        />
                        <button onClick={() => setShowFormKey(!showFormKey)} style={styles.visibilityButton} title={showFormKey ? '隐藏' : '显示'}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {showFormKey
                              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                            }
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', minWidth: '70px' }}>Base URL</label>
                      <input
                        type="text"
                        value={formBaseUrl}
                        onChange={(e) => setFormBaseUrl(e.target.value)}
                        placeholder="API 端点地址"
                        style={{ ...styles.formInput, flex: 1 }}
                      />
                    </div>

                    {/* 选择模型：先获取列表，再从下拉框选 */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', fontWeight: 600, color: '#333', minWidth: '70px' }}>选择模型</label>
                      {fetchedModels.length > 0 ? (
                        <select
                          value={formModelName}
                          onChange={(e) => setFormModelName(e.target.value)}
                          style={{ ...styles.select, flex: 1 }}
                        >
                          {fetchedModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ flex: 1, fontSize: '13px', color: '#999' }}>
                          {fetching ? '正在获取模型列表...' : '请先点击右侧按钮获取可用模型'}
                        </span>
                      )}
                      <button
                        onClick={fetchModelList}
                        disabled={fetching || !formApiKey.trim() || !formBaseUrl.trim()}
                        style={{
                          ...styles.testButton,
                          whiteSpace: 'nowrap',
                          opacity: (fetching || !formApiKey.trim() || !formBaseUrl.trim()) ? 0.6 : 1,
                          cursor: (fetching || !formApiKey.trim() || !formBaseUrl.trim()) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {fetching ? '获取中...' : '获取模型列表'}
                      </button>
                    </div>

                    {fetchError && (
                      <div style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' }}>
                        {fetchError}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={addModel}
                        disabled={adding || !formModelName.trim() || !formApiKey.trim()}
                        style={{
                          ...styles.submitButton,
                          opacity: (adding || !formModelName.trim() || !formApiKey.trim()) ? 0.6 : 1,
                          cursor: (adding || !formModelName.trim() || !formApiKey.trim()) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {adding ? '添加中...' : '添加模型'}
                      </button>
                      {adding && (
                        <span style={{ fontSize: '13px', color: '#888' }}>正在添加</span>
                      )}
                    </div>

                    {addResult && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        backgroundColor: addResult.success ? '#d4edda' : '#f8d7da',
                        color: addResult.success ? '#155724' : '#721c24',
                        border: `1px solid ${addResult.success ? '#c3e6cb' : '#f5c6cb'}`
                      }}>
                        {addResult.success ? '✓ ' : '✗ '}{addResult.message}
                      </div>
                    )}
                  </div>
                </div>

                {/* 已添加的模型列表 */}
                <div style={{ marginTop: '32px' }}>
                  <h3 style={{ ...styles.contentTitle, fontSize: '20px', marginBottom: '8px' }}>已添加的模型</h3>
                  <p style={{ ...styles.contentSubtitle, marginTop: 0, marginBottom: '16px' }}>
                    {apiConfig.models.length > 0
                      ? `共 ${apiConfig.models.length} 个模型，${apiConfig.models.filter(m => m.enabled).length} 个已启用`
                      : '暂无模型，请在上方添加'}
                  </p>

                  <div style={styles.modelList}>
                    {apiConfig.models.map((model) => (
                      <div key={model.id} style={styles.modelItem}>
                        <div style={styles.modelInfo}>
                          <div style={styles.modelHeader}>
                            <strong style={styles.modelName}>{model.name}</strong>
                            <span style={{
                              ...styles.modelId,
                              backgroundColor:
                                model.provider === 'gemini' ? '#e8f0fe'
                                : model.provider === 'codex-oauth' ? '#e8f5e9'
                                : model.provider === 'deepseek' ? '#e3f2fd'
                                : model.provider === 'moonshot' ? '#fce4ec'
                                : model.provider === 'qwen' ? '#fff8e1'
                                : '#fff3e0',
                              color:
                                model.provider === 'gemini' ? '#1a73e8'
                                : model.provider === 'codex-oauth' ? '#2e7d32'
                                : model.provider === 'deepseek' ? '#0d47a1'
                                : model.provider === 'moonshot' ? '#c62828'
                                : model.provider === 'qwen' ? '#ff6f00'
                                : '#e65100',
                            }}>
                              {model.provider === 'gemini' ? 'Gemini'
                                : model.provider === 'codex-oauth' ? 'Codex OAuth'
                                : model.provider === 'deepseek' ? 'DeepSeek'
                                : model.provider === 'moonshot' ? 'Moonshot'
                                : model.provider === 'qwen' ? 'Qwen'
                                : 'OpenAI'}
                            </span>
                          </div>
                          <p style={styles.modelDescription}>
                            {model.provider === 'codex-oauth' ? (
                              <span style={{ color: '#2e7d32' }}>ChatGPT 订阅认证</span>
                            ) : (
                              <>
                                Key: {visibleKeys.has(model.id) ? model.apiKey : maskKey(model.apiKey)}
                                <button
                                  onClick={() => toggleKeyVisibility(model.id)}
                                  style={{ background: 'none', border: 'none', color: '#4a90e2', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' }}
                                >
                                  {visibleKeys.has(model.id) ? '隐藏' : '显示'}
                                </button>
                              </>
                            )}
                          </p>
                          <p style={{ ...styles.modelDescription, marginTop: '2px', fontSize: '12px', color: '#999' }}>
                            {model.baseUrl}
                          </p>
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
  inputWithButton: {
    position: 'relative' as const,
    minWidth: '300px',
  },
  visibilityButton: {
    position: 'absolute' as const,
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    padding: '4px',
    borderRadius: '4px',
    zIndex: 1,
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
  providerSection: {
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: 'white',
    borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  providerTitle: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  providerDesc: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: '#888',
  },
  addModelInline: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
};

export default OptionsApp;
