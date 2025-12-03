import React, { useCallback, useEffect, useRef } from 'react';
import { ELEMENTS } from '../../base/common/constants';
import { useChatMessages } from '../hooks/useChatMessages';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { ChatMessage } from '../types/chat';

type SidebarProps = {
  isOpen: boolean;
  width: number;
  onToggle: () => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'bot',
    content: '你好！现在这看起来是不是更像 Overleaf 原生的面板了？'
  },
  {
    id: 'm2',
    role: 'bot',
    content: '你可以拖动左边的灰条，也可以点击灰条中间的小按钮来收起我。'
  }
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, width, onToggle, onClose, onWidthChange }) => {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { messages, appendMessage } = useChatMessages(initialMessages);

  useSidebarResize({ sidebarRef, handleRef, onWidthChange });

  useEffect(() => {
    const chat = chatHistoryRef.current;
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(() => {
    const value = inputRef.current?.value?.trim() ?? '';
    if (!value) return;

    appendMessage('user', value);
    if (inputRef.current) {
      inputRef.current.value = '';
    }

    setTimeout(() => {
      appendMessage('bot', '收到');
    }, 500);
  }, [appendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

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
        <div className="ai-header">
          <span>✨ AI 助手</span>
          <button className="ai-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ai-chat-history" ref={chatHistoryRef}>
          {messages.map((msg) => {
            const className = `ai-message ${msg.role === 'user' ? 'ai-user' : 'ai-bot'}`;
            if (msg.isHtml) {
              return (
                <div
                  key={msg.id}
                  className={className}
                  dangerouslySetInnerHTML={{ __html: msg.content }}
                />
              );
            }
            return (
              <div key={msg.id} className={className}>
                {msg.content}
              </div>
            );
          })}
        </div>

        <div className="ai-input-area">
          <textarea
            className="ai-input"
            placeholder="输入..."
            ref={inputRef}
            onKeyDown={handleKeyDown}
          />
          <button className="ai-send-btn" onClick={sendMessage}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
