import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ELEMENTS } from '../../base/common/constants';
import { useChatMessages } from '../hooks/useChatMessages';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { ChatMessage } from '../types/chat';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService, AIModelConfig } from '../../platform/configuration/configuration';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type { IChatService } from '../../platform/agent/IChatService';

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
  const { messages } = useChatMessages(initialMessages);
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  const chatService = useService<IChatService>(IChatServiceId);
  
  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [thinkingStates, setThinkingStates] = useState<Record<string, boolean>>({});
  const [chatMode, setChatMode] = useState<'agent' | 'chat' | 'normal'>('chat');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingApiKey, setIsCheckingApiKey] = useState<boolean>(true);
  const [conversations] = useState([
    { id: '1', name: '新对话' },
    { id: '2', name: 'React组件优化' },
    { id: '3', name: 'TypeScript类型问题' }
  ]);
  const [currentConversation, setCurrentConversation] = useState('1');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);

  useSidebarResize({ sidebarRef, handleRef, onWidthChange });

  // 加载可用模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await configService.getModels();
        const enabledModels = models.filter(m => m.enabled);
        setAvailableModels(enabledModels);
        if (enabledModels.length > 0 && !selectedModel) {
          setSelectedModel(enabledModels[0].id);
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

    // 清空输入框
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    // TODO: 从 UI 收集上下文条目
    // - 用户选中的文件
    // - 用户选中的代码片段
    // - 其他附加信息
    const contextItems = [];

    // 调用 ChatService 发送消息
    await chatService.sendMessage(value, {
      mode: chatMode,
      modelId: selectedModel,
      contextItems,
      conversationId: currentConversation
    });
  }, [chatService, chatMode, selectedModel, currentConversation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
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
    conversations.find((c) => c.id === currentConversation)?.name || '新对话';

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
              onClick={() => setIsConversationMenuOpen(!isConversationMenuOpen)}
            >
              {currentConversationName}
            </button>
            <span className="material-symbols ai-header-dropdown">expand_more</span>
            {isConversationMenuOpen && (
              <div className="ai-inline-dropdown ai-conversation-dropdown">
                {conversations.map((conv) => (
                  <button
                    type="button"
                    key={conv.id}
                    className={`ai-inline-dropdown-item ${currentConversation === conv.id ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentConversation(conv.id);
                      setIsConversationMenuOpen(false);
                    }}
                  >
                    {conv.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ai-header-actions">
            <button className="ai-icon-btn" title="新对话">
              <span className="material-symbols">add</span>
            </button>
            <button className="ai-icon-btn" title="历史记录">
              <span className="material-symbols">list_alt</span>
            </button>
            <button className="ai-icon-btn" onClick={openSettings} title="设置">
              <span className="material-symbols">settings</span>
            </button>
            <button className="ai-icon-btn" title="更多">
              <span className="material-symbols">more_horiz</span>
            </button>
            <button className="ai-icon-btn ai-close-btn" onClick={onClose} title="关闭">
              <span className="material-symbols">close</span>
            </button>
          </div>
        </div>

        <div className="ai-chat-history" ref={chatHistoryRef}>
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
                
                {msgType === 'thinking' && (
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
                      <span className={`material-symbols ai-thinking-chevron ${thinkingStates[msg.id] ? 'expanded' : ''}`}>
                        chevron_right
                      </span>
                    </div>
                    {thinkingStates[msg.id] && (
                      <div className="ai-thinking-content">
                        {renderInlineCode(msg.content)}
                      </div>
                    )}
                  </div>
                )}

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
              placeholder="Ask anything (Ctrl+L)"
              ref={inputRef}
              onKeyDown={handleKeyDown}
              rows={1}
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
                onClick={sendMessage} 
                disabled={!hasApiKey || isCheckingApiKey}
                title={!hasApiKey ? '请先配置 API Key' : '发送'}
                style={{ opacity: (!hasApiKey || isCheckingApiKey) ? 0.5 : 1, cursor: (!hasApiKey || isCheckingApiKey) ? 'not-allowed' : 'pointer' }}
              >
                <span className="material-symbols">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
