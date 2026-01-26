/**
 * Sidebar - AI 侧边栏主组件
 * 
 * 支持多列并行对话模式，通过 MultiPaneContainer 管理多个对话面板。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ELEMENTS } from '../../base/common/constants';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService } from '../../platform/configuration/configuration';
import { ITelemetryServiceId } from '../../platform/telemetry/ITelemetryService';
import type { ITelemetryService } from '../../platform/telemetry/ITelemetryService';
import MultiPaneContainer, { MultiPaneContainerHandle } from './MultiPaneContainer';
import LiteraturePanel from './LiteraturePanel';
import ActivationModal from './ActivationModal';
import 'katex/dist/katex.min.css';
import '../styles/literature.css';
import { API_ENDPOINTS } from '../../base/common/apiConfig';

/** 侧边栏标签页类型 */
type SidebarTab = 'chat' | 'literature';

type SidebarProps = {
  isOpen: boolean;
  width: number;
  onToggle: () => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, width, onToggle, onClose, onWidthChange }) => {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const multiPaneRef = useRef<MultiPaneContainerHandle | null>(null);
  const isOpenRef = useRef(isOpen); // 用于在 paneCountGetter 中获取最新的 isOpen 值
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  const telemetryService = useService<ITelemetryService>(ITelemetryServiceId);
  
  const [columnCount, setColumnCount] = useState(1);
  const [selectionTooltipEnabled, setSelectionTooltipEnabled] = useState(true);
  const [citeTooltipEnabled, setCiteTooltipEnabled] = useState(true);
  const [isTooltipMenuOpen, setIsTooltipMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  
  // 保持 isOpenRef 与 isOpen 同步
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // 初始化 selection tooltip 和 cite tooltip 状态
  useEffect(() => {
    // 从 localStorage 读取初始状态
    const savedSelectionState = localStorage.getItem('ol-ai-selection-tooltip-enabled');
    if (savedSelectionState !== null) {
      setSelectionTooltipEnabled(savedSelectionState === 'true');
    }
    
    const savedCiteState = localStorage.getItem('ol-ai-cite-tooltip-enabled');
    if (savedCiteState !== null) {
      setCiteTooltipEnabled(savedCiteState === 'true');
    }

    // 监听来自注入脚本的状态响应
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_SELECTION_TOOLTIP_STATE') {
        const enabled = event.data.data?.enabled;
        if (typeof enabled === 'boolean') {
          setSelectionTooltipEnabled(enabled);
        }
      }
      if (event.data?.type === 'OVERLEAF_CITE_TOOLTIP_STATE') {
        const enabled = event.data.data?.enabled;
        if (typeof enabled === 'boolean') {
          setCiteTooltipEnabled(enabled);
        }
      }
    };
    window.addEventListener('message', handleMessage);

    // 请求当前状态
    window.postMessage({ type: 'OVERLEAF_SELECTION_TOOLTIP_GET_STATE' }, '*');
    window.postMessage({ type: 'OVERLEAF_CITE_TOOLTIP_GET_STATE' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // 切换 selection tooltip 开关
  const handleToggleSelectionTooltip = useCallback(() => {
    const newState = !selectionTooltipEnabled;
    setSelectionTooltipEnabled(newState);
    
    // 保存到 localStorage
    localStorage.setItem('ol-ai-selection-tooltip-enabled', String(newState));
    
    // 通知注入脚本
    window.postMessage({
      type: 'OVERLEAF_SELECTION_TOOLTIP_TOGGLE',
      data: { enabled: newState }
    }, '*');
    
    console.log('[Sidebar] Selection tooltip toggled:', newState);
  }, [selectionTooltipEnabled]);
  
  // 切换 cite tooltip 开关
  const handleToggleCiteTooltip = useCallback(() => {
    const newState = !citeTooltipEnabled;
    setCiteTooltipEnabled(newState);
    
    // 保存到 localStorage
    localStorage.setItem('ol-ai-cite-tooltip-enabled', String(newState));
    
    // 通知注入脚本
    window.postMessage({
      type: 'OVERLEAF_CITE_TOOLTIP_TOGGLE',
      data: { enabled: newState }
    }, '*');
    
    console.log('[Sidebar] Cite tooltip toggled:', newState);
  }, [citeTooltipEnabled]);
  
  // 注册 paneCountGetter，让 telemetry 服务能在上报时获取当前列数
  // 如果侧边栏未打开，返回 0（用户没有使用对话功能）
  useEffect(() => {
    telemetryService.setPaneCountGetter(() => {
      if (!isOpenRef.current) {
        return 0; // 侧边栏未打开，统计为 0 列
      }
      return multiPaneRef.current?.getColumnCount() ?? 1;
    });
  }, [telemetryService]);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);

  useSidebarResize({ sidebarRef, handleRef, onWidthChange });

  // 检查启动码状态
  useEffect(() => {
    const checkActivation = async () => {
      const config = await configService.getAPIConfig();
      if (!config || !config.apiKey) {
        // 初始加载时不强制弹出，或者可以根据需求决定是否弹出
        // 这里我们选择初始检查并弹出，但允许用户关闭
        setIsActivationModalOpen(true);
      }
    };
    checkActivation();

    // 监听显示 Activation Modal 的自定义事件
    const handleShowActivation = () => {
      setIsActivationModalOpen(true);
    };
    window.addEventListener('SHOW_ACTIVATION_MODAL', handleShowActivation);

    return () => {
      window.removeEventListener('SHOW_ACTIVATION_MODAL', handleShowActivation);
    };
  }, [configService]);

  // 处理启动码提交
  const handleActivationSubmit = async (code: string) => {
    try {
      // 验证启动码（测试连通性）
      const result = await configService.testConnectivity(code, API_ENDPOINTS.LLM_BASE_URL);
      
      if (result.success) {
        // 验证成功，先保存基本配置
        let config = await configService.getAPIConfig();
        if (config) {
          await configService.setAPIConfig({
            ...config,
            apiKey: code,
            isVerified: true  // 标记为已验证
          });

          // 同步模型列表（这会根据最新的 apiKey 获取并更新模型）
          if (result.availableModels && result.availableModels.length > 0) {
            try {
              const syncResult = await configService.syncModelsFromConnectivityResult(result.availableModels);
              console.log('[Sidebar] Models synced:', syncResult);
            } catch (err) {
              console.error('[Sidebar] Failed to sync models:', err);
            }
          }

          setIsActivationModalOpen(false);
          
          // 同步激活状态到注入脚本
          window.postMessage({
            type: 'OVERLEAF_ACTIVATION_STATUS_UPDATE',
            data: { isActivated: true }
          }, '*');
          console.log('[Sidebar] Activation successful, sent status update');
          
          return true;
        }
      } else {
        console.warn('Activation failed:', result.error);
        return false;
      }
      return false;
    } catch (error) {
      console.error('Activation failed:', error);
      return false;
    }
  };

  // 打开设置页面
  const openSettings = useCallback(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        // 尝试使用标准 API 打开
        chrome.runtime.openOptionsPage(() => {
          // 如果出错（例如在不支持的环境），尝试回退
          if (chrome.runtime.lastError) {
            console.warn('openOptionsPage failed, falling back to window.open:', chrome.runtime.lastError);
            window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
          }
        });
      } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
      }
    } catch (e) {
      console.error('Error opening settings:', e);
      // 最后的尝试
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
      }
    }
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ai-column-selector')) {
        setIsColumnMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 处理列数变化回调
  const handleColumnCountChange = useCallback((count: number) => {
    setColumnCount(count);
  }, []);

  // 设置列数
  const handleSetColumnCount = useCallback((count: number) => {
    multiPaneRef.current?.setColumnCount(count);
    setIsColumnMenuOpen(false);
  }, []);

  // 添加一列
  const handleAddColumn = useCallback(() => {
    multiPaneRef.current?.addPane();
    setIsColumnMenuOpen(false);
  }, []);

  return (
    <>
      <div
        id={ELEMENTS.SIDEBAR_ID}
        ref={sidebarRef}
        style={{
          width: `${width}px`,
          display: isOpen ? 'flex' : 'none'
        }}
      >
        {/* 拖拽条 */}
        <div
          className={`horizontal-resize-handle horizontal-resize-handle-enabled ${ELEMENTS.RESIZE_HANDLE_CLASS}`}
          ref={handleRef}
          title="Resize"
        >
          <button
            className={`custom-toggler custom-toggler-east custom-toggler-open ${ELEMENTS.TOGGLER_BTN_CLASS}`}
            aria-label="Click to hide the AI panel"
            title="点击收起"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <span className="material-symbols ai-toggler-icon" aria-hidden="true" translate="no">
              chevron_right
            </span>
          </button>
        </div>

        <div className="ai-content-wrapper">
          {/* 顶部工具栏 - 只包含全局操作 */}
          <div className="ai-header ai-header-global">
            <div className="ai-header-left">
              <span className="ai-header-title">
                <span className="material-symbols">smart_toy</span>
                PacificOceanAI
              </span>
            </div>
            <div className="ai-header-actions">
              {/* 提示框设置菜单 */}
              <div className="ai-tooltip-settings">
                <button
                  className={`ai-icon-btn ai-toggle-btn ${selectionTooltipEnabled || citeTooltipEnabled ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTooltipMenuOpen(!isTooltipMenuOpen);
                  }}
                  title="提示框设置"
                >
                  <span className="material-symbols">
                    {selectionTooltipEnabled && citeTooltipEnabled ? 'toggle_on' : 
                     !selectionTooltipEnabled && !citeTooltipEnabled ? 'toggle_off' : 'tune'}
                  </span>
                </button>
                {isTooltipMenuOpen && (
                  <div className="ai-tooltip-dropdown">
                    <div className="ai-tooltip-dropdown-header">
                      <span>提示框设置</span>
                    </div>
                    <div className="ai-tooltip-dropdown-options">
                      <button
                        className={`ai-tooltip-option ${selectionTooltipEnabled ? 'active' : ''}`}
                        onClick={handleToggleSelectionTooltip}
                      >
                        <span className="material-symbols">
                          {selectionTooltipEnabled ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span className="ai-tooltip-option-text">
                          <span className="ai-tooltip-option-title">选区菜单</span>
                          <span className="ai-tooltip-option-desc">选中文本时显示 AI 操作菜单</span>
                        </span>
                      </button>
                      <button
                        className={`ai-tooltip-option ${citeTooltipEnabled ? 'active' : ''}`}
                        onClick={handleToggleCiteTooltip}
                      >
                        <span className="material-symbols">
                          {citeTooltipEnabled ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span className="ai-tooltip-option-text">
                          <span className="ai-tooltip-option-title">文献提示</span>
                          <span className="ai-tooltip-option-desc">光标在 \cite 时显示文献信息</span>
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* 列数控制按钮（仅在聊天标签页显示） */}
              {activeTab === 'chat' && (
                <div className="ai-column-selector">
                  <button
                    className="ai-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsColumnMenuOpen(!isColumnMenuOpen);
                    }}
                    title={`当前 ${columnCount} 列，点击调整`}
                  >
                    <span className="material-symbols">view_column</span>
                    {columnCount > 1 && <span className="ai-column-badge">{columnCount}</span>}
                  </button>
                  {isColumnMenuOpen && (
                    <div className="ai-column-dropdown">
                      <div className="ai-column-dropdown-header">
                        <span>列数设置</span>
                      </div>
                      <div className="ai-column-dropdown-options">
                        {[1, 2, 3, 4].map((count) => (
                          <button
                            key={count}
                            className={`ai-column-option ${columnCount === count ? 'active' : ''}`}
                            onClick={() => handleSetColumnCount(count)}
                          >
                            <span className="material-symbols">
                              {count === 1 ? 'view_agenda' : count === 2 ? 'view_column_2' : 'view_week'}
                            </span>
                            <span>{count} 列</span>
                            {columnCount === count && (
                              <span className="material-symbols ai-column-check">check</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="ai-column-dropdown-footer">
                        <button
                          className="ai-column-add-btn"
                          onClick={handleAddColumn}
                        >
                          <span className="material-symbols">add</span>
                          添加一列
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button className="ai-icon-btn" type="button" onClick={openSettings} title="设置">
                <span className="material-symbols">settings</span>
              </button>
              <button className="ai-icon-btn ai-close-btn" onClick={onClose} title="关闭">
                <span className="material-symbols">close</span>
              </button>
            </div>
          </div>

          {/* 标签切换 */}
          <div className="sidebar-tabs">
            <button 
              className={`sidebar-tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span className="material-symbols">chat</span>
              <span>AI 对话</span>
            </button>
            <button 
              className={`sidebar-tab ${activeTab === 'literature' ? 'active' : ''}`}
              onClick={() => setActiveTab('literature')}
            >
              <span className="material-symbols">menu_book</span>
              <span>文献库</span>
            </button>
          </div>

          {/* 内容区域 */}
          {activeTab === 'chat' ? (
            <MultiPaneContainer 
              ref={multiPaneRef}
              onColumnCountChange={handleColumnCountChange} 
            />
          ) : (
            <LiteraturePanel />
          )}
        </div>
      </div>

      {/* ActivationModal 放在 Sidebar div 外面，这样即使侧边栏隐藏，模态框也能显示 */}
      <ActivationModal
        isOpen={isActivationModalOpen}
        onSubmit={handleActivationSubmit}
        onClose={() => setIsActivationModalOpen(false)}
      />
    </>
  );
};

export default Sidebar;
