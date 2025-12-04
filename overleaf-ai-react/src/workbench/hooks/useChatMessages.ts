import { useMemo } from 'react';
import { ChatMessage } from '../types/chat';
import { useService } from './useService';
import { useServiceEvent } from './useServiceEvent';
import type { IChatService, ChatMessage as ServiceChatMessage } from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';

/**
 * 将 Service 层的 ChatMessage 映射为 UI 层的 ChatMessage
 */
function mapServiceMessageToUI(message: ServiceChatMessage): ChatMessage {
  const role: ChatMessage['role'] = message.role === 'user' ? 'user' : 'bot';

  return {
    id: message.id,
    role,
    content: message.content,
    isHtml: false
  };
}

/**
 * 订阅 ChatService 的消息事件，并转换为 UI 可用的消息列表
 */
export function useChatMessages(initialMessages: ChatMessage[] = []) {
  const chatService = useService<IChatService>(IChatServiceId);
  const serviceMessages = useServiceEvent<ServiceChatMessage[]>(chatService.onDidMessageUpdate, []);

  const messages = useMemo<ChatMessage[]>(() => {
    const uiMessages = serviceMessages.map(mapServiceMessageToUI);
    return [...initialMessages, ...uiMessages];
  }, [initialMessages, serviceMessages]);

  return { messages };
}

