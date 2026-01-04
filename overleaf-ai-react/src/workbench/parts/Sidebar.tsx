import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ELEMENTS } from '../../base/common/constants';
import { useChatMessages } from '../hooks/useChatMessages';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useUIStreamUpdates } from '../hooks/useUIStreamUpdates';
import { useConversations } from '../hooks/useConversations';
import { ChatMessage } from '../types/chat';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService, AIModelConfig } from '../../platform/configuration/configuration';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type { IChatService } from '../../platform/agent/IChatService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { overleafEditor } from '../../services/editor/OverleafEditor';

type SidebarProps = {
  isOpen: boolean;
  width: number;
  onToggle: () => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
};

// 扩展消息类型以支持更多UI元素
interface ExtendedChatMessage extends ChatMessage {
  type?: 'normal' | 'action' | 'thinking' | 'tool' | 'error' | 'warning';
  metadata?: {
    thinkingTime?: number;
    actionIcon?: string;
    fileName?: string;
    collapsed?: boolean;
    toolName?: string;
  };
}

const initialMessages: ExtendedChatMessage[] = [];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, width, onToggle, onClose, onWidthChange }) => {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastInputRef = useRef<string>('');
  const { messages } = useChatMessages(initialMessages);
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  const chatService = useService<IChatService>(IChatServiceId);
  const uiStreamService = useService<IUIStreamService>(IUIStreamServiceId);
  const { streamingBuffers } = useUIStreamUpdates();
  
  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [thinkingStates, setThinkingStates] = useState<Record<string, boolean>>({});
  const [chatMode, setChatMode] = useState<'agent' | 'chat' | 'normal'>('agent');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingApiKey, setIsCheckingApiKey] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  
  // 使用对话管理 Hook
  const {
    conversations,
    currentConversationId,
    isLoading: isConversationsLoading,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation
  } = useConversations();

  useSidebarResize({ sidebarRef, handleRef, onWidthChange });

  // 加载可用模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await configService.getModels();
        const enabledModels = models.filter(m => m.enabled);
        setAvailableModels(enabledModels);
        if (!selectedModel) {
          const preferred = enabledModels.find(m => m.id === 'deepseek-reasoner');
          setSelectedModel(preferred ? preferred.id : (enabledModels[0]?.id ?? ''));
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();
  }, [configService, selectedModel]);

  // 检查是否配置了 API Key
  useEffect(() => {
    const checkApiKey = async () => {
      setIsCheckingApiKey(true);
      try {
        // TODO: 实现真实的 API Key 检查
        // const configured = await configService.hasApiKey();
        
        // 临时：检查是否有已启用的模型
        // 真实实现时，应该检查每个模型对应的 API Key 是否配置
        const models = await configService.getModels();
        const hasConfiguredModel = models.some(m => m.enabled);
        setHasApiKey(hasConfiguredModel);
        
        if (!hasConfiguredModel) {
          console.warn('[Sidebar] 未检测到已启用的模型，请前往设置配置');
        }
      } catch (error) {
        console.error('[Sidebar] 检查 API Key 失败:', error);
        setHasApiKey(false);
      } finally {
        setIsCheckingApiKey(false);
      }
    };
    checkApiKey();
  }, [configService]);

  // 监听thinking流式更新，自动控制展开/折叠
  useEffect(() => {
    if (!uiStreamService) {
      return;
    }

    const disposable = uiStreamService.onDidThinkingUpdate((event) => {
      // thinking消息的ID格式为 `${messageId}:thinking`
      const thinkingMessageId = `${event.messageId}:thinking`;
      
      setThinkingStates((prev) => {
        // 如果已完成，则折叠；否则展开
        const shouldExpand = !event.done;
        
        // 只有在状态需要改变时才更新
        if (prev[thinkingMessageId] !== shouldExpand) {
          console.log(`[Sidebar] Thinking state change for ${thinkingMessageId}: ${shouldExpand}`, {
            fullTextLength: event.fullText?.length || 0,
            done: event.done
          });
          return {
            ...prev,
            [thinkingMessageId]: shouldExpand
          };
        }
        return prev;
      });
    });

    return () => {
      disposable.dispose();
    };
  }, [uiStreamService]);

  // 监听 Service 层消息变化，检测是否正在生成
  useEffect(() => {
    if (!chatService) {
      return;
    }

    const disposable = chatService.onDidMessageUpdate((serviceMessages) => {
      const hasStreamingMessage = serviceMessages.some(
        (msg) => msg.status === 'streaming' || msg.status === 'pending'
      );
      setIsGenerating(hasStreamingMessage);
    });

    return () => {
      disposable.dispose();
    };
  }, [chatService]);

  // 自动滚动到底部
  useEffect(() => {
    const chat = chatHistoryRef.current;
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const value = inputRef.current?.value?.trim() ?? '';
    if (!value) return;
    
    // 检查 API Key
    if (!hasApiKey) {
      console.error('[Sidebar] 未配置 API Key，无法发送消息');
      return;
    }

    lastInputRef.current = value;

    // 清空输入框
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    // 🔧 确保在发送消息前有当前对话
    // 如果没有当前对话，先创建一个
    // 这样可以避免在 saveMessages 时创建对话导致消息被清空
    let conversationId = currentConversationId;
    if (!conversationId) {
      console.log('[Sidebar] 没有当前对话，先创建一个');
      conversationId = await createConversation();
    }

    // TODO: 从 UI 收集上下文条目
    // - 用户选中的文件
    // - 用户选中的代码片段
    // - 其他附加信息
    const contextItems = [];

    // 调用 ChatService 发送消息
    setIsGenerating(true);
    try {
      await chatService.sendMessage(value, {
        mode: chatMode,
        modelId: selectedModel,
        contextItems,
        conversationId
      });
    } catch (error) {
      console.error('[Sidebar] 发送消息失败:', error);
      setIsGenerating(false);
    }
  }, [chatService, chatMode, selectedModel, currentConversationId, hasApiKey, createConversation]);

  const stopGeneration = useCallback(() => {
    chatService.abort();
    setIsGenerating(false);
    const currentValue = inputRef.current?.value ?? '';
    if (!currentValue.trim() && lastInputRef.current && inputRef.current) {
      inputRef.current.value = lastInputRef.current;
    }
  }, [chatService]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage, isGenerating]
  );

  const openSettings = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Fallback: 在新标签页打开设置页面，与 manifest.options_page 保持一致
      window.open(chrome.runtime.getURL('src/extension/options/index.html'), '_blank');
    }
  }, []);

  const toggleThinking = useCallback((messageId: string) => {
    setThinkingStates(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  }, []);

  // 测试按钮：获取文档行数和内容
  const testGetDocLines = useCallback(async () => {
    try {
      console.log('[Test] 开始获取文档信息...');
      
      // 1. 获取文件信息
      const fileInfo = await overleafEditor.file.getInfo();
      console.log('[Test] ✅ 文件信息:', fileInfo);
      
      // 2. 获取前10行内容
      const lines = await overleafEditor.document.readLines(1, 10);
      console.log('[Test] ✅ 前10行内容:', lines);
      
      // 格式化显示
      const formattedLines = lines.lines
        .map(l => `${l.lineNumber}: ${l.text}`)
        .join('\n');
      
      console.log('[Test] 格式化内容:\n' + formattedLines);
      
      alert(
        `文件: ${fileInfo.fileName || '当前文件'}\n` +
        `总行数: ${fileInfo.totalLines}\n` +
        `总字符: ${fileInfo.totalLength}\n\n` +
        `前10行已打印到控制台`
      );
    } catch (error) {
      console.error('[Test] ❌ 获取失败:', error);
      alert(`获取失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  // 渲染内联代码
  const renderInlineCode = (text: string) => {
    return text.split(/(`[^`]+`)/).map((part, idx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="inline-code">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const hasModels = availableModels.length > 0;
  const currentModel = availableModels.find((m) => m.id === selectedModel);
  const currentModelName = hasModels
    ? (currentModel?.name || '选择模型')
    : '暂无可用模型';

  const currentConversationName =
    conversations.find((c) => c.id === currentConversationId)?.name || '新对话';

  // 处理创建新对话
  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  // 处理切换对话
  const handleSwitchConversation = useCallback(async (conversationId: string) => {
    await switchConversation(conversationId);
    setIsConversationMenuOpen(false);
    setIsHistoryPanelOpen(false);
  }, [switchConversation]);

  // 处理删除对话
  const handleDeleteConversation = useCallback(async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      await deleteConversation(conversationId);
    }
  }, [deleteConversation]);

  // 格式化时间
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return date.toLocaleDateString();
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ai-header-left') && !target.closest('.ai-conversation-dropdown')) {
        setIsConversationMenuOpen(false);
      }
      if (!target.closest('.ai-mode-selector-inline')) {
        setIsModeMenuOpen(false);
      }
      if (!target.closest('.ai-model-selector-inline')) {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div
      id={ELEMENTS.SIDEBAR_ID}
      ref={sidebarRef}
      style={{
        width: `${width}px`,
        display: isOpen ? 'flex' : 'none'
      }}
    >
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
        {/* 现代化Header */}
        <div className="ai-header">
          <div className="ai-header-left">
            <button
              type="button"
              className="ai-conversation-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setIsConversationMenuOpen(!isConversationMenuOpen);
              }}
              disabled={isConversationsLoading}
            >
              <span className="material-symbols ai-conversation-icon">chat</span>
              <span className="ai-conversation-title">
                {isConversationsLoading ? '加载中...' : currentConversationName}
              </span>
              <span className={`material-symbols ai-header-dropdown ${isConversationMenuOpen ? 'open' : ''}`}>
                expand_more
              </span>
            </button>
            {isConversationMenuOpen && (
              <div className="ai-conversation-dropdown">
                <div className="ai-conversation-dropdown-header">
                  <span>对话列表</span>
                  <button 
                    className="ai-new-chat-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateConversation();
                      setIsConversationMenuOpen(false);
                    }}
                    title="新建对话"
                  >
                    <span className="material-symbols">add</span>
                    新建
                  </button>
                </div>
                <div className="ai-conversation-dropdown-list">
                  {conversations.length === 0 ? (
                    <div className="ai-conversation-dropdown-empty">
                      <span className="material-symbols">chat_bubble_outline</span>
                      <p>暂无对话记录</p>
                    </div>
                  ) : (
                    conversations.slice(0, 8).map((conv) => (
                      <button
                        type="button"
                        key={conv.id}
                        className={`ai-conversation-dropdown-item ${currentConversationId === conv.id ? 'active' : ''}`}
                        onClick={() => handleSwitchConversation(conv.id)}
                      >
                        <span className="material-symbols ai-conv-item-icon">
                          {currentConversationId === conv.id ? 'chat' : 'chat_bubble_outline'}
                        </span>
                        <div className="ai-conv-item-content">
                          <span className="ai-conv-item-name">{conv.name}</span>
                          <span className="ai-conv-item-meta">
                            {formatTime(conv.updatedAt)} · {conv.messageCount} 条消息
                          </span>
                        </div>
                        <button
                          className="ai-conv-item-delete"
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          title="删除"
                        >
                          <span className="material-symbols">close</span>
                        </button>
                      </button>
                    ))
                  )}
                </div>
                {conversations.length > 8 && (
                  <button
                    type="button"
                    className="ai-conversation-dropdown-footer"
                    onClick={() => {
                      setIsConversationMenuOpen(false);
                      setIsHistoryPanelOpen(true);
                    }}
                  >
                    <span className="material-symbols">history</span>
                    查看全部历史 ({conversations.length})
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="ai-header-actions">
            <button 
              className="ai-header-new-btn" 
              onClick={handleCreateConversation} 
              title="新建对话 (Ctrl+Shift+N)"
            >
              <span className="material-symbols">edit_square</span>
            </button>
            <button 
              className={`ai-icon-btn ${isHistoryPanelOpen ? 'active' : ''}`} 
              onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)} 
              title="历史记录"
            >
              <span className="material-symbols">history</span>
            </button>
            <button className="ai-icon-btn" onClick={openSettings} title="设置">
              <span className="material-symbols">settings</span>
            </button>
            <button className="ai-icon-btn ai-close-btn" onClick={onClose} title="关闭">
              <span className="material-symbols">close</span>
            </button>
          </div>
        </div>

        {/* 历史记录面板 */}
        {isHistoryPanelOpen && (
          <div className="ai-history-panel">
            <div className="ai-history-panel-header">
              <div className="ai-history-panel-title">
                <span className="material-symbols">history</span>
                <span>对话历史</span>
                <span className="ai-history-count">{conversations.length}</span>
              </div>
              <div className="ai-history-panel-actions">
                <button 
                  className="ai-history-new-btn" 
                  onClick={() => {
                    handleCreateConversation();
                    setIsHistoryPanelOpen(false);
                  }}
                  title="新建对话"
                >
                  <span className="material-symbols">add</span>
                  新建对话
                </button>
                <button 
                  className="ai-icon-btn" 
                  onClick={() => setIsHistoryPanelOpen(false)}
                  title="关闭"
                >
                  <span className="material-symbols">close</span>
                </button>
              </div>
            </div>
            <div className="ai-history-panel-list">
              {conversations.length === 0 ? (
                <div className="ai-history-empty">
                  <div className="ai-history-empty-icon">
                    <span className="material-symbols">forum</span>
                  </div>
                  <h3>还没有对话记录</h3>
                  <p>开始一个新对话，与 AI 助手交流</p>
                  <button className="ai-btn-primary" onClick={() => {
                    handleCreateConversation();
                    setIsHistoryPanelOpen(false);
                  }}>
                    <span className="material-symbols">add</span>
                    开始新对话
                  </button>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`ai-history-item ${currentConversationId === conv.id ? 'active' : ''}`}
                    onClick={() => handleSwitchConversation(conv.id)}
                  >
                    <div className="ai-history-item-icon">
                      <span className="material-symbols">
                        {currentConversationId === conv.id ? 'chat' : 'chat_bubble_outline'}
                      </span>
                    </div>
                    <div className="ai-history-item-content">
                      <div className="ai-history-item-name">{conv.name}</div>
                      {conv.previewText && (
                        <div className="ai-history-item-preview">{conv.previewText}</div>
                      )}
                      <div className="ai-history-item-meta">
                        <span className="ai-history-item-time">
                          <span className="material-symbols">schedule</span>
                          {formatTime(conv.updatedAt)}
                        </span>
                        <span className="ai-history-item-count">
                          <span className="material-symbols">chat_bubble</span>
                          {conv.messageCount}
                        </span>
                      </div>
                    </div>
                    <button
                      className="ai-history-item-delete"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      title="删除对话"
                    >
                      <span className="material-symbols">delete_outline</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="ai-chat-history" ref={chatHistoryRef}>
          {/* 欢迎界面 - 没有消息时显示 */}
          {messages.length === 0 && !isHistoryPanelOpen && (
            <div className="ai-welcome">
              <div className="ai-welcome-header">
                <div className="ai-welcome-logo">
                  <span className="material-symbols">smart_toy</span>
                </div>
                <h2>Overleaf AI 助手</h2>
                <p>我可以帮助你编写、编辑和优化 LaTeX 文档</p>
              </div>
              
              <div className="ai-welcome-actions">
                <button 
                  className="ai-welcome-action"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = '帮我优化这段文字的学术表达';
                      inputRef.current.focus();
                    }
                  }}
                >
                  <span className="material-symbols">edit_note</span>
                  <span>优化学术表达</span>
                </button>
                <button 
                  className="ai-welcome-action"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = '检查并修正 LaTeX 语法错误';
                      inputRef.current.focus();
                    }
                  }}
                >
                  <span className="material-symbols">spellcheck</span>
                  <span>检查语法错误</span>
                </button>
                <button 
                  className="ai-welcome-action"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = '帮我写一个数学公式';
                      inputRef.current.focus();
                    }
                  }}
                >
                  <span className="material-symbols">function</span>
                  <span>生成数学公式</span>
                </button>
                <button 
                  className="ai-welcome-action"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = '为这个表格添加标题和注释';
                      inputRef.current.focus();
                    }
                  }}
                >
                  <span className="material-symbols">table_chart</span>
                  <span>处理表格</span>
                </button>
              </div>

              {conversations.length > 0 && (
                <div className="ai-welcome-history">
                  <div className="ai-welcome-history-header">
                    <span className="material-symbols">history</span>
                    <span>最近对话</span>
                  </div>
                  <div className="ai-welcome-history-list">
                    {conversations.slice(0, 3).map((conv) => (
                      <button
                        key={conv.id}
                        className="ai-welcome-history-item"
                        onClick={() => handleSwitchConversation(conv.id)}
                      >
                        <span className="material-symbols">chat_bubble_outline</span>
                        <span className="ai-welcome-history-name">{conv.name}</span>
                        <span className="ai-welcome-history-time">{formatTime(conv.updatedAt)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => {
            const extMsg = msg as ExtendedChatMessage;
            const msgType = extMsg.type || 'normal';
            
            // User message
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="ai-message-block">
                  <div className="ai-message ai-user">
                    {renderInlineCode(msg.content)}
                  </div>
                </div>
              );
            }
            
            // Bot message with different types
            return (
              <div key={msg.id} className="ai-message-block">
                {msgType === 'warning' && (
                  <div className="ai-warning-box">
                    <p className="ai-warning-text">{renderInlineCode(msg.content)}</p>
                  </div>
                )}
                
                {msgType === 'normal' && (
                  <div className="ai-message ai-bot">
                    {msg.isHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                    ) : (
                      renderInlineCode(msg.content)
                    )}
                  </div>
                )}
                
                {msgType === 'action' && (
                  <div className="ai-action-item">
                    <span className="material-symbols ai-action-icon">
                      {extMsg.metadata?.actionIcon || 'code'}
                    </span>
                    <span className="ai-action-text">
                      {msg.content}
                      {extMsg.metadata?.fileName && (
                        <span className="ai-action-file"> {extMsg.metadata.fileName}</span>
                      )}
                    </span>
                  </div>
                )}
                
                {msgType === 'thinking' && (() => {
                  // 如果状态未定义，默认在生成中展开，生成完毕后折叠
                  const isExpanded = thinkingStates[msg.id] !== undefined 
                    ? thinkingStates[msg.id] 
                    : isGenerating;
                  
                  return (
                    <div className="ai-thinking-block">
                      <div 
                        className="ai-thinking-header"
                        onClick={() => toggleThinking(msg.id)}
                      >
                        <span className="ai-thinking-label">
                          Thinking
                          {extMsg.metadata?.thinkingTime && (
                            <span className="ai-thinking-time"> for {extMsg.metadata.thinkingTime}s</span>
                          )}
                        </span>
                        <span className={`material-symbols ai-thinking-chevron ${isExpanded ? 'expanded' : ''}`}>
                          chevron_right
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="ai-thinking-content">
                          {renderInlineCode(msg.content)}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {msgType === 'tool' && (
                  <div className="ai-tool-block">
                    <div
                      className="ai-tool-header"
                      onClick={() => toggleThinking(msg.id)}
                    >
                      <span className="ai-tool-label">
                        Tool
                        {extMsg.metadata?.toolName && (
                          <span className="ai-tool-name"> ({extMsg.metadata.toolName})</span>
                        )}
                      </span>
                      <span className={`material-symbols ai-tool-chevron ${thinkingStates[msg.id] ? 'expanded' : ''}`}>
                        chevron_right
                      </span>
                    </div>
                    {thinkingStates[msg.id] && (
                      <div className="ai-tool-content">
                        <pre className="ai-tool-pre">{msg.content}</pre>
                      </div>
                    )}
                  </div>
                )}

                {msgType === 'error' && (
                  <div className="ai-error-item">
                    <span className="ai-error-text">Error: {msg.content}</span>
                  </div>
                )}

                {/* 显示正在执行的工具调用（仅显示 running 状态） */}
                {(() => {
                  const buffer = streamingBuffers.get(msg.id);
                  if (!buffer || buffer.toolCalls.size === 0) return null;
                  
                  // 显示所有已触发的工具（running/completed/error），并使用可折叠的 Tool 样式块
                  const visibleTools = Array.from(buffer.toolCalls.entries())
                    .filter(([_, tc]) => tc.status === 'running' || tc.status === 'completed' || tc.status === 'error');
                  
                  if (visibleTools.length === 0) return null;
                  
                  return visibleTools.map(([toolCallId, toolCall]) => {
                    const toolMsgId = `${msg.id}:${toolCallId}`;
                    const canExpand = toolCall.status === 'completed' || toolCall.status === 'error';
                    const isExpanded = canExpand && !!thinkingStates[toolMsgId];

                    let statusLabel = '';
                    switch (toolCall.status) {
                      case 'running':
                        statusLabel = '执行中...';
                        break;
                      case 'completed':
                        statusLabel = '执行成功';
                        break;
                      case 'error':
                        statusLabel = '执行失败';
                        break;
                    }

                    // 结果内容：优先使用 result，其次使用 args，并尝试做 JSON 美化
                    let detailText: string | undefined;
                    const rawDetail = toolCall.result || toolCall.args;
                    if (rawDetail) {
                      try {
                        const parsed = JSON.parse(rawDetail);
                        detailText = JSON.stringify(parsed, null, 2);
                      } catch {
                        detailText = rawDetail;
                      }
                    }

                    return (
                      <div key={toolCallId} className="ai-tool-block">
                        <div
                          className="ai-tool-header"
                          onClick={() => {
                            if (!canExpand) return;
                            toggleThinking(toolMsgId);
                          }}
                        >
                          <span className="ai-tool-label">
                            Tool
                            {toolCall.name && (
                              <span className="ai-tool-name"> ({toolCall.name})</span>
                            )}
                          </span>
                          {statusLabel && (
                            <span className="ai-tool-status-label">
                              {statusLabel}
                            </span>
                          )}
                          <span className={`material-symbols ai-tool-chevron ${isExpanded ? 'expanded' : ''}`}>
                            chevron_right
                          </span>
                        </div>
                        {canExpand && isExpanded && detailText && (
                          <div className="ai-tool-content">
                            <pre className="ai-tool-pre">{detailText}</pre>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            );
          })}
        </div>

        {/* API Key 警告提示 */}
        {!isCheckingApiKey && !hasApiKey && (
          <div className="ai-warning-banner">
            <span className="material-symbols" style={{ color: '#ff9800', marginRight: '8px' }}>warning</span>
            <span style={{ flex: 1 }}>未检测到 API Key 配置，请先</span>
            <button 
              className="ai-toolbar-btn" 
              onClick={openSettings}
              style={{ marginLeft: '8px', textDecoration: 'underline' }}
            >
              前往设置
            </button>
          </div>
        )}

        <div className="ai-input-area">
          <div className="ai-input-wrapper">
            <textarea
              className="ai-input"
              placeholder={isGenerating ? "正在生成..." : "Ask anything (Ctrl+L)"}
              ref={inputRef}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isGenerating}
            />
          </div>
          
          <div className="ai-input-toolbar">
            <div className="ai-input-toolbar-left">
              <button className="ai-toolbar-btn" title="添加附件">
                <span className="material-symbols">add</span>
              </button>
              
              <div className="ai-mode-selector-inline">
                <button
                  type="button"
                  className="ai-mode-select-inline"
                  onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                >
                  {chatMode === 'agent' ? 'Agent' : chatMode === 'chat' ? 'Chat' : 'Normal'}
                </button>
                {isModeMenuOpen && (
                  <div className="ai-inline-dropdown">
                    <button
                      type="button"
                      className={`ai-inline-dropdown-item ${chatMode === 'agent' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('agent');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      Agent
                    </button>
                    <button
                      type="button"
                      className={`ai-inline-dropdown-item ${chatMode === 'chat' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('chat');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      className={`ai-inline-dropdown-item ${chatMode === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        setChatMode('normal');
                        setIsModeMenuOpen(false);
                      }}
                    >
                      Normal
                    </button>
                  </div>
                )}
              </div>
              
              <div className="ai-model-selector-inline">
                <button
                  type="button"
                  className="ai-model-select-inline"
                  onClick={() => hasModels && setIsModelMenuOpen(!isModelMenuOpen)}
                  disabled={!hasModels}
                >
                  {currentModelName}
                </button>
                {isModelMenuOpen && hasModels && (
                  <div className="ai-inline-dropdown">
                    {availableModels.map((model) => (
                      <button
                        type="button"
                        key={model.id}
                        className={`ai-inline-dropdown-item ${selectedModel === model.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setIsModelMenuOpen(false);
                        }}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="ai-input-toolbar-right">
              <button className="ai-toolbar-btn" title="语音输入">
                <span className="material-symbols">mic</span>
              </button>
              <button 
                className="ai-send-btn-new" 
                onClick={isGenerating ? stopGeneration : sendMessage} 
                disabled={!hasApiKey || isCheckingApiKey}
                title={
                  !hasApiKey ? '请先配置 API Key' : 
                  isGenerating ? '停止生成' : '发送'
                }
                style={{ 
                  opacity: (!hasApiKey || isCheckingApiKey) ? 0.5 : 1, 
                  cursor: (!hasApiKey || isCheckingApiKey) ? 'not-allowed' : 'pointer',
                  backgroundColor: isGenerating ? '#dc2626' : undefined
                }}
              >
                <span className="material-symbols">{isGenerating ? 'stop' : 'send'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
