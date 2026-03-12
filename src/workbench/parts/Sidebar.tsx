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
import LiteraturePanel from './LiteraturePanel';
import 'katex/dist/katex.min.css';
import '../styles/literature.css';

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
  const [columnCount, setColumnCount] = useState(1);
  const [selectionTooltipEnabled, setSelectionTooltipEnabled] = useState(true);
  const [citeTooltipEnabled, setCiteTooltipEnabled] = useState(true);
  const [isTooltipMenuOpen, setIsTooltipMenuOpen] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isLiteratureOpen, setIsLiteratureOpen] = useState(false);
  // 记录 AI 对话面板的宽度，当文献库打开时生效
  const [chatPanelWidth, setChatPanelWidth] = useState(0);
  const literatureResizeRef = useRef<HTMLDivElement>(null);
  
  const DEFAULT_LITERATURE_WIDTH = 400;

  // 切换文献库面板
  const toggleLiterature = () => {
    if (isLiteratureOpen) {
      // 如果对话框已隐藏（宽度为 0），此时关闭文献库意味着关闭整个 Sidebar
      if (chatPanelWidth === 0) {
        onClose();
        setIsLiteratureOpen(false);
        return;
      }

      // 关闭文献库：恢复总宽度为当前的 chatPanelWidth
      // 为了防止太窄，设置一个最小值
      const newWidth = Math.max(300, chatPanelWidth);
      onWidthChange(newWidth);
    } else {
      // 打开文献库：
      // 1. 记录当前 Sidebar 宽度作为 chatPanelWidth
      setChatPanelWidth(width);
      // 2. 总宽度增加 400px (给文献库)
      onWidthChange(width + DEFAULT_LITERATURE_WIDTH);
    }
    setIsLiteratureOpen(!isLiteratureOpen);
  };

  // 中间拖拽条调整宽度
  // 逻辑：拖动中间条改变 chatPanelWidth，总宽度不变 -> 文献库宽度自适应变化
  useEffect(() => {
    const handle = literatureResizeRef.current;
    if (!handle || !isLiteratureOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startChatWidth = chatPanelWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        
        // 计算新的 Chat 面板宽度
        // 向右拖动 (deltaX > 0) -> 鼠标右移 -> Chat 面板变窄
        // 向左拖动 (deltaX < 0) -> 鼠标左移 -> Chat 面板变宽
        let newChatWidth = startChatWidth - deltaX;
        
        // 自动隐藏逻辑：如果宽度小于 100，则自动吸附到 0（隐藏）
        if (newChatWidth < 100) {
          newChatWidth = 0;
        } else {
          // 否则保持最小宽度 300，避免过窄影响体验
          newChatWidth = Math.max(300, newChatWidth);
        }
        
        // 限制 Chat 面板不能把 Literature 面板挤得太小 (最小 200px)
        const maxChatWidth = width - 200;
        
        setChatPanelWidth(Math.min(newChatWidth, maxChatWidth));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);
    return () => handle.removeEventListener('mousedown', onMouseDown);
  }, [isLiteratureOpen, chatPanelWidth, width]);
  
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
    
  }, [citeTooltipEnabled]);
  
  useSidebarResize({ sidebarRef, handleRef, onWidthChange });

  // 打开设置页面
  const openSettings = useCallback(() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        // 尝试使用标准 API 打开
        chrome.runtime.openOptionsPage(() => {
          // 如果出错（例如在不支持的环境），尝试回退
          if (chrome.runtime.lastError) {
            window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
          }
        });
      } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
      }
    } catch (e) {
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
              <button 
                className={`ai-icon-btn ${isLiteratureOpen ? 'active' : ''}`}
                onClick={toggleLiterature}
                title={isLiteratureOpen ? "关闭文献库" : "打开文献库"}
                style={{ marginLeft: '8px' }}
              >
                <span className="material-symbols">menu_book</span>
              </button>
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

          {/* 内容区域 */}
          <div className="sidebar-content-container" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* 文献库面板 */}
            {isLiteratureOpen && (
              <>
                <div 
                  className="literature-panel-wrapper" 
                  style={{ 
                    flex: 1, // 文献库自适应，吸收总宽度的变化
                    minWidth: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                >
                  <LiteraturePanel />
                </div>
                {/* 内部拖拽条 */}
                <div
                  ref={literatureResizeRef}
                  className="literature-resize-handle"
                  style={{
                    width: '4px',
                    cursor: 'col-resize',
                    backgroundColor: 'var(--border-primary)',
                    flexShrink: 0,
                    transition: 'background-color 0.2s',
                    zIndex: 10
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--border-primary)'}
                />
              </>
            )}
            
            {/* AI 对话面板 */}
            <div 
              className="chat-panel-wrapper" 
              style={{ 
                // 如果文献库打开，Chat 面板固定宽度；否则自适应占满
                width: isLiteratureOpen ? `${chatPanelWidth}px` : 'auto',
                flex: isLiteratureOpen ? 'none' : 1,
                // 如果宽度为 0 且文献库打开，才允许隐藏；否则强制显示（最小宽度 300px）
                minWidth: (isLiteratureOpen && chatPanelWidth === 0) ? '0px' : '300px',
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden', // 确保隐藏时内容不溢出
                opacity: (isLiteratureOpen && chatPanelWidth === 0) ? 0 : 1, // 隐藏时完全透明
                transition: 'opacity 0.2s'
              }}
            >
              <MultiPaneContainer 
                ref={multiPaneRef}
                onColumnCountChange={handleColumnCountChange} 
              />
            </div>
          </div>
        </div>
      </div>

    </>
  );
};

export default Sidebar;
