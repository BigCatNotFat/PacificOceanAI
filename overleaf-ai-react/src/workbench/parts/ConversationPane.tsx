/**
 * ConversationPane - 单个对话面板组件
 * 
 * 从 Sidebar 中抽取的核心对话区域，支持多列并行对话。
 * 每个 Pane 独立维护自己的对话状态。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChatMessages } from '../hooks/useChatMessages';
import { useUIStreamUpdates } from '../hooks/useUIStreamUpdates';
import { useConversations } from '../hooks/useConversations';
import { ChatMessage } from '../types/chat';
import { useService } from '../hooks/useService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService, AIModelConfig } from '../../platform/configuration/configuration';
import { IChatServiceId } from '../../platform/agent/IChatService';
import type { IChatService, ContextItem } from '../../platform/agent/IChatService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { ToolResultRenderer } from './ToolResultRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import RichTextInput, { RichTextInputHandle } from './RichTextInput';

// 扩展消息类型以支持更多UI元素
interface ExtendedChatMessage extends ChatMessage {
  type?: 'normal' | 'action' | 'thinking' | 'tool' | 'tool_status' | 'error' | 'warning';
  metadata?: {
    thinkingTime?: number;
    actionIcon?: string;
    fileName?: string;
    collapsed?: boolean;
    toolName?: string;
  };
}

interface ConversationPaneProps {
  /** 当前显示的对话 ID */
  conversationId: string;
  /** 对话切换时的回调 */
  onConversationChange: (newId: string) => void;
  /** 是否显示关闭按钮 */
  showCloseButton?: boolean;
  /** 关闭面板时的回调 */
  onClose?: () => void;
  /** 是否是紧凑模式（多列时使用） */
  compact?: boolean;
}

// ==================== 辅助函数 ====================

function truncateForPreview(text: string, maxChars: number = 1400): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.floor(maxChars * 0.25);
  return (
    text.slice(0, head) +
    `\n\n... ✂️ 中间省略 ${(text.length - head - tail).toLocaleString()} 字符 ...\n\n` +
    text.slice(text.length - tail)
  );
}

function safeJsonParse(str: string): any | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractStringField(raw: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'm');
  const m = raw.match(re);
  return m?.[1];
}

function summarizeLongText(text: string | undefined, maxPreview: number = 160): { preview: string; length: number } | null {
  if (!text) return null;
  if (text.length <= maxPreview) return { preview: text, length: text.length };
  const head = Math.floor(maxPreview * 0.6);
  const tail = Math.floor(maxPreview * 0.25);
  return {
    preview: text.slice(0, head) + ' ... ' + text.slice(text.length - tail),
    length: text.length
  };
}

// ==================== 工具参数预览组件 ====================

const ToolArgsPreview: React.FC<{ toolName?: string; args: string }> = ({ toolName, args }) => {
  const normalized = (toolName || '').toLowerCase().replace(/[_-]/g, '');
  const parsed = safeJsonParse(args);

  const getStr = (key: string): string | undefined =>
    parsed && typeof parsed === 'object' && parsed[key] != null ? String(parsed[key]) : extractStringField(args, key);

  const targetFile = getStr('target_file') || getStr('file') || getStr('path');

  if (normalized.includes('editfile')) {
    const oldStr = getStr('old_string');
    const newStr = getStr('new_string');
    const instructions = getStr('instructions');
    const oldSum = summarizeLongText(oldStr);
    const newSum = summarizeLongText(newStr);
    const insSum = summarizeLongText(instructions);

    return (
      <div className="tool-result-default">
        <div className="tool-result-header">
          <span className="material-symbols">edit_document</span>
          <span>{targetFile || '编辑文件'}</span>
          <span className="tool-result-count">{args.length.toLocaleString()} 字符</span>
        </div>

        {insSum && (
          <div className="tool-result-instructions">
            <span className="material-symbols">info</span>
            <span>instructions（{insSum.length.toLocaleString()} 字符）：{insSum.preview}</span>
          </div>
        )}

        {(oldSum || newSum) && (
          <div className="tool-result-file-info">
            {oldSum && (
              <span className="info-item">
                <span className="material-symbols">content_copy</span>
                old（{oldSum.length.toLocaleString()}）
              </span>
            )}
            {newSum && (
              <span className="info-item">
                <span className="material-symbols">content_paste</span>
                new（{newSum.length.toLocaleString()}）
              </span>
            )}
          </div>
        )}

        <details>
          <summary className="tool-result-message">查看原始参数（截断）</summary>
          <pre className="tool-result-raw">{truncateForPreview(args, 1800)}</pre>
        </details>
      </div>
    );
  }

  const query = getStr('query') || getStr('search_term') || getStr('pattern');
  return (
    <div className="tool-result-default">
      <div className="tool-result-header">
        <span className="material-symbols">terminal</span>
        <span>{toolName || '工具参数'}</span>
        <span className="tool-result-count">{args.length.toLocaleString()} 字符</span>
      </div>
      {(targetFile || query) && (
        <div className="tool-result-message">
          {targetFile && <div>目标：{targetFile}</div>}
          {query && <div>查询：{query}</div>}
        </div>
      )}
      <details>
        <summary className="tool-result-message">查看原始参数（截断）</summary>
        <pre className="tool-result-raw">{truncateForPreview(args, 1800)}</pre>
      </details>
    </div>
  );
};

// ==================== 主组件 ====================

const ConversationPane: React.FC<ConversationPaneProps> = ({
  conversationId,
  onConversationChange,
  showCloseButton = false,
  onClose,
  compact = false
}) => {
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<RichTextInputHandle | null>(null);
  const lastInputRef = useRef<string>('');
  
  // 使用基于 conversationId 的 Hook
  const { messages } = useChatMessages(conversationId);
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  
  const {
    conversations,
    createConversation,
    switchConversation
  } = useConversations();

  // 加载可用模型列表
  const loadModels = useCallback(async () => {
    try {
      const models = await configService.getModels();
      const enabledModels = models.filter(m => m.enabled);
      setAvailableModels(enabledModels);
      
      // 如果当前没有选中模型，或者选中的模型不再可用列表里，则重新选择
      if (!selectedModel || !enabledModels.find(m => m.id === selectedModel)) {
        const preferred = enabledModels.find(m => m.id === 'deepseek-reasoner');
        const defaultModel = preferred ? preferred.id : (enabledModels[0]?.id ?? '');
        if (defaultModel) {
          setSelectedModel(defaultModel);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  }, [configService, selectedModel]);

  // 初始加载及监听配置变化
  useEffect(() => {
    loadModels();

    const disposable = configService.onDidChangeConfiguration(() => {
      loadModels();
    });

    return () => disposable.dispose();
  }, [configService, loadModels]);

  // 检查是否配置了 API Key
  useEffect(() => {
    const checkApiKey = async () => {
      // setIsCheckingApiKey(true); // 移除这行，避免不必要的重新渲染
      try {
        const config = await configService.getAPIConfig();
        // 只要有 apiKey 且 models 列表不为空，就认为已配置
        // 我们不强求 model.enabled，因为用户可能手动禁用了所有模型但 key 是有效的
        // 何况上面 loadModels 会处理默认选中逻辑
        const hasValidConfig = !!(config?.apiKey && config?.models?.length > 0);
        
        setHasApiKey(hasValidConfig);
      } catch (error) {
        console.error('[ConversationPane] 检查 API Key 失败:', error);
        setHasApiKey(false);
      } finally {
        setIsCheckingApiKey(false);
      }
    };

    checkApiKey();

    const disposable = configService.onDidChangeConfiguration(() => {
      checkApiKey();
    });

    return () => disposable.dispose();
  }, [configService]);

  // 监听 thinking 流式更新
  useEffect(() => {
    if (!uiStreamService) return;

    const disposable = uiStreamService.onDidThinkingUpdate((event) => {
      const thinkingMessageId = `${event.messageId}:thinking`;
      setThinkingStates((prev) => {
        const shouldExpand = !event.done;
        if (prev[thinkingMessageId] !== shouldExpand) {
          return { ...prev, [thinkingMessageId]: shouldExpand };
        }
        return prev;
      });
    });

    return () => disposable.dispose();
  }, [uiStreamService]);

  // 监听是否正在生成（针对当前 conversationId）
  useEffect(() => {
    if (!chatService) return;
    
    // 初始化检查
    setIsGenerating(chatService.isProcessing(conversationId));

    const disposable = chatService.onDidMessageUpdate((event) => {
      if (event.conversationId === conversationId) {
        const hasStreamingMessage = event.messages.some(
          (msg) => msg.status === 'streaming' || msg.status === 'pending'
        );
        setIsGenerating(hasStreamingMessage);
      }
    });

    return () => disposable.dispose();
  }, [chatService, conversationId]);

  // 自动滚动到底部
  useEffect(() => {
    const chat = chatHistoryRef.current;
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  }, [messages]);

  // 发送消息
  const sendMessage = useCallback(async () => {
    const { text, references } = inputRef.current?.getValueWithReferences() ?? { text: '', references: [] };
    const value = text.trim();
    if (!value) return;
    
    if (!hasApiKey) {
      console.warn('[ConversationPane] 未配置 API Key，请求用户激活');
      window.dispatchEvent(new CustomEvent('SHOW_ACTIVATION_MODAL'));
      return;
    }

    let finalMessage = value;
    if (references.length > 0) {
      references.forEach((ref, index) => {
        const placeholder = `{{REF_${index}}}`;
        const refMarker = ref.startLine === ref.endLine
          ? `[${ref.fileName}:第${ref.startLine}行]`
          : `[${ref.fileName}:第${ref.startLine}-${ref.endLine}行]`;
        finalMessage = finalMessage.replace(placeholder, refMarker);
      });
    }

    lastInputRef.current = finalMessage;
    inputRef.current?.clear();

    // 确保有对话 ID
    let convId = conversationId;
    if (!convId) {
      console.log('[ConversationPane] 没有当前对话，先创建一个');
      convId = await createConversation();
      onConversationChange(convId);
    }

    const contextItems: ContextItem[] = references.map(ref => ({
      type: 'reference' as const,
      reference: {
        fileName: ref.fileName,
        startLine: ref.startLine,
        endLine: ref.endLine,
        originalText: ref.originalText
      }
    }));

    setIsGenerating(true);
    try {
      await chatService.sendMessage(finalMessage, {
        mode: chatMode,
        modelId: selectedModel,
        contextItems,
        maxIterations: chatMode === 'agent' ? 100 : 10,
        conversationId: convId
      });
    } catch (error) {
      console.error('[ConversationPane] 发送消息失败:', error);
      setIsGenerating(false);
    }
  }, [chatService, chatMode, selectedModel, conversationId, hasApiKey, createConversation, onConversationChange]);

  // 停止生成
  const stopGeneration = useCallback(() => {
    chatService.abort(conversationId);
    setIsGenerating(false);
    const currentValue = inputRef.current?.getValue() ?? '';
    if (!currentValue.trim() && lastInputRef.current && inputRef.current) {
      inputRef.current.setValue(lastInputRef.current);
    }
  }, [chatService, conversationId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage, isGenerating]
  );

  const toggleThinking = useCallback((messageId: string) => {
    setThinkingStates(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  }, []);

  const copyMessageToClipboard = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => {
        setCopiedMessageId(prev => prev === messageId ? null : prev);
      }, 2000);
    } catch (error) {
      console.error('[ConversationPane] 复制失败:', error);
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

  // 渲染用户消息内容（包含引用标签）
  const renderUserMessageContent = (text: string) => {
    const refPattern = /\[([^:]+):第(\d+)(?:-(\d+))?行\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = refPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const fileName = match[1];
      const startLine = match[2];
      const endLine = match[3];
      const displayText = endLine 
        ? `${fileName}:L${startLine}-${endLine}`
        : `${fileName}:L${startLine}`;

      parts.push(
        <span key={match.index} className="ai-file-reference ai-file-reference-inline">
          <span className="ai-ref-icon">📄</span>
          <span className="ai-ref-text">{displayText}</span>
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

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
      if (!target.closest('.ai-pane-header-left') && !target.closest('.ai-conversation-dropdown')) {
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

  const hasModels = availableModels.length > 0;
  const currentModel = availableModels.find((m) => m.id === selectedModel);
  const currentModelName = hasModels ? (currentModel?.name || '选择模型') : '暂无可用模型';
  
  const currentConversation = conversations.find(c => c.id === conversationId);
  const currentConversationName = currentConversation?.name || '新对话';

  // 切换对话
  const handleSwitchConversation = useCallback(async (newConvId: string) => {
    // 先调用 switchConversation 加载对话数据，触发 ChatService 更新
    await switchConversation(newConvId);
    // 然后通知父组件更新 UI
    onConversationChange(newConvId);
    setIsConversationMenuOpen(false);
  }, [switchConversation, onConversationChange]);

  // 创建新对话
  const handleCreateConversation = useCallback(async () => {
    const newId = await createConversation();
    onConversationChange(newId);
    setIsConversationMenuOpen(false);
  }, [createConversation, onConversationChange]);

  return (
    <div className={`conversation-pane ${compact ? 'compact' : ''}`}>
      {/* Pane Header */}
      <div className="ai-pane-header">
        <div className="ai-pane-header-left">
          <button
            type="button"
            className="ai-conversation-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setIsConversationMenuOpen(!isConversationMenuOpen);
            }}
          >
            <span className="material-symbols ai-conversation-icon">chat</span>
            <span className="ai-conversation-title">{currentConversationName}</span>
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
                      className={`ai-conversation-dropdown-item ${conversationId === conv.id ? 'active' : ''}`}
                      onClick={() => handleSwitchConversation(conv.id)}
                    >
                      <span className="material-symbols ai-conv-item-icon">
                        {conversationId === conv.id ? 'chat' : 'chat_bubble_outline'}
                      </span>
                      <div className="ai-conv-item-content">
                        <span className="ai-conv-item-name">{conv.name}</span>
                        <span className="ai-conv-item-meta">
                          {formatTime(conv.updatedAt)} · {conv.messageCount} 条消息
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="ai-pane-header-actions">
          <button 
            className="ai-icon-btn" 
            onClick={handleCreateConversation} 
            title="新建对话"
          >
            <span className="material-symbols">add</span>
          </button>
          {showCloseButton && onClose && (
            <button className="ai-icon-btn ai-close-btn" onClick={onClose} title="关闭此列">
              <span className="material-symbols">close</span>
            </button>
          )}
        </div>
      </div>

      {/* 聊天历史 */}
      <div className="ai-chat-history" ref={chatHistoryRef}>
        {/* 欢迎界面 */}
        {messages.length === 0 && (
          <div className="ai-welcome ai-welcome-compact">
            <div className="ai-welcome-header">
              <div className="ai-welcome-logo ai-welcome-logo-small">
                <span className="material-symbols">smart_toy</span>
              </div>
              <h2>PacificOceanAI</h2>
              <p>开始对话...</p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const extMsg = msg as ExtendedChatMessage;
          const msgType = extMsg.type || 'normal';
          
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="ai-message-block">
                <div className="ai-message ai-user">
                  {renderUserMessageContent(msg.content)}
                </div>
              </div>
            );
          }
          
          return (
            <div key={msg.id} className="ai-message-block">
              {msgType === 'warning' && (
                <div className="ai-warning-box">
                  <p className="ai-warning-text">{renderInlineCode(msg.content)}</p>
                </div>
              )}
              
              {msgType === 'normal' && (() => {
                const isTemporaryMessage = msg.content === '正在发送...' || msg.content === '正在思考...';
                const shouldShowCopyButton =
                  !isTemporaryMessage && !isGenerating && msg.content.trim().length > 0;
                
                return (
                  <div className="ai-message ai-bot">
                    <div className="ai-bot-content">
                      {msg.isHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                      ) : isTemporaryMessage ? (
                        renderInlineCode(msg.content)
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
                    </div>
                    {shouldShowCopyButton && (
                      <div className="ai-bot-actions">
                        <button
                          className={`ai-copy-btn ${copiedMessageId === msg.id ? 'copied' : ''}`}
                          onClick={() => copyMessageToClipboard(msg.id, msg.content)}
                          title={copiedMessageId === msg.id ? '已复制' : '复制回答'}
                        >
                          <span className="material-symbols">
                            {copiedMessageId === msg.id ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {msgType === 'thinking' && (() => {
                const isExpanded = thinkingStates[msg.id] !== undefined 
                  ? thinkingStates[msg.id] 
                  : isGenerating;
                
                const buffer = streamingBuffers.get(msg.id.replace(':thinking', ''));
                const isThinking = buffer && !buffer.content;
                
                return (
                  <div className={`ai-thinking-block ${!isExpanded ? 'collapsed' : ''}`}>
                    <div 
                      className="ai-thinking-header"
                      onClick={() => toggleThinking(msg.id)}
                    >
                      <span className="ai-thinking-label">
                        {isThinking ? '思考中' : '思考过程'}
                        {extMsg.metadata?.thinkingTime && (
                          <span className="ai-thinking-time">{extMsg.metadata.thinkingTime}s</span>
                        )}
                      </span>
                      <span className={`material-symbols ai-thinking-chevron ${isExpanded ? 'expanded' : ''}`}>
                        chevron_right
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="ai-thinking-content">
                        <MarkdownRenderer content={msg.content} />
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

              {/* 工具调用 */}
              {(() => {
                const buffer = streamingBuffers.get(msg.id);
                if (!buffer || buffer.toolCalls.size === 0) return null;
                
                const visibleTools = Array.from(buffer.toolCalls.entries())
                  .filter(([_, tc]) => tc.status === 'running' || tc.status === 'completed' || tc.status === 'error');
                
                if (visibleTools.length === 0) return null;
                
                return visibleTools.map(([toolCallId, toolCall]) => {
                  const toolMsgId = `${msg.id}:${toolCallId}`;
                  const canExpand = toolCall.status === 'completed' || toolCall.status === 'error' || toolCall.status === 'running';
                  const isExpanded = canExpand && !!thinkingStates[toolMsgId];

                  let statusLabel = '';
                  switch (toolCall.status) {
                    case 'running': statusLabel = '执行中...'; break;
                    case 'completed': statusLabel = '完成'; break;
                    case 'error': statusLabel = '失败'; break;
                  }

                  const statusClass = toolCall.status === 'running' ? 'running' : 
                                     toolCall.status === 'error' ? 'error' : '';

                  const friendlyToolName = toolCall.name
                    ?.replace(/_/g, ' ')
                    ?.replace(/([A-Z])/g, ' $1')
                    ?.trim()
                    ?.toLowerCase() || '工具';

                  return (
                    <div key={toolCallId} className={`ai-tool-block ${statusClass}`}>
                      <div
                        className="ai-tool-header"
                        onClick={() => {
                          if (!canExpand) return;
                          toggleThinking(toolMsgId);
                        }}
                        style={{ cursor: canExpand ? 'pointer' : 'default' }}
                      >
                        <span className="ai-tool-label">{friendlyToolName}</span>
                        {statusLabel && <span className="ai-tool-status-label">{statusLabel}</span>}
                        {canExpand && (
                          <span className={`material-symbols ai-tool-chevron ${isExpanded ? 'expanded' : ''}`}>
                            chevron_right
                          </span>
                        )}
                      </div>
                      {canExpand && isExpanded && (
                        <div className="ai-tool-content">
                          {toolCall.status === 'running' ? (
                            toolCall.args ? (
                              <ToolArgsPreview toolName={toolCall.name} args={toolCall.args} />
                            ) : (
                              <div className="tool-result-empty">正在生成工具参数...</div>
                            )
                          ) : toolCall.status === 'error' ? (
                            <ToolResultRenderer toolName={toolCall.name} result={toolCall.result || toolCall.error} />
                          ) : (
                            <ToolResultRenderer toolName={toolCall.name} result={toolCall.result} />
                          )}
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

      {/* 输入区域 */}
      <div className="ai-input-area">
        <div className="ai-input-wrapper">
          <RichTextInput
            ref={inputRef}
            className="ai-input"
            placeholder={isGenerating ? "正在生成..." : "Ask anything..."}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
          />
        </div>
        
        <div className="ai-input-toolbar">
          <div className="ai-input-toolbar-left">
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
                    onClick={() => { setChatMode('agent'); setIsModeMenuOpen(false); }}
                  >
                    Agent
                  </button>
                  <button
                    type="button"
                    className={`ai-inline-dropdown-item ${chatMode === 'chat' ? 'active' : ''}`}
                    onClick={() => { setChatMode('chat'); setIsModeMenuOpen(false); }}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    className={`ai-inline-dropdown-item ${chatMode === 'normal' ? 'active' : ''}`}
                    onClick={() => { setChatMode('normal'); setIsModeMenuOpen(false); }}
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
                {compact ? (currentModel?.name?.split('-')[0] || '模型') : currentModelName}
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
  );
};

export default ConversationPane;

