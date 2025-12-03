import { useCallback, useState } from 'react';
import { ChatMessage } from '../types/chat';

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function useChatMessages(initialMessages: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const appendMessage = useCallback(
    (role: ChatMessage['role'], content: string, isHtml = false) => {
      setMessages((prev) => [...prev, { id: generateId(), role, content, isHtml }]);
    },
    []
  );

  return { messages, appendMessage };
}

