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
import MultiPaneContainer, { MultiPaneContainerHandle } from './MultiPaneContainer';
import ActivationModal from './ActivationModal';
import 'katex/dist/katex.min.css';

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
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  
  const [columnCount, setColumnCount] = useState(1);
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
      const result = await configService.testConnectivity(code, 'https://api.silicondream.top/v1');
      
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
              {/* 列数控制按钮 */}
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
              <button className="ai-icon-btn" type="button" onClick={openSettings} title="设置">
                <span className="material-symbols">settings</span>
              </button>
              <button className="ai-icon-btn ai-close-btn" onClick={onClose} title="关闭">
                <span className="material-symbols">close</span>
              </button>
            </div>
          </div>

          {/* 多列对话容器 */}
          <MultiPaneContainer 
            ref={multiPaneRef}
            onColumnCountChange={handleColumnCountChange} 
          />
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
