import { useMemo } from 'react';
import { ChatMessage } from '../types/chat';
import { useService } from './useService';
import { useServiceEvent } from './useServiceEvent';
import type { IChatService, ChatMessage as ServiceChatMessage } from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';

/**
 * 将 Service 层的 ChatMessage 映射为一个或多个 UI 层的 ChatMessage
 * - user 消息：直接映射为一条 normal 消息
 * - assistant 消息：
 *   - 如果存在 thinking，则生成一条 type = 'thinking' 的思考块消息
 *   - 始终生成一条 type = 'normal' 的回答消息
 * - tool 消息：
 *   - 显示为一个类似思考块的折叠区域，展示工具调用结果
 */
function mapServiceMessageToUI(message: ServiceChatMessage): ChatMessage[] {
  const uiMessages: ChatMessage[] = [];

  // 工具消息：展示为单独的工具调用折叠区域
  if (message.role === 'tool') {
    const toolCall = message.toolCalls && message.toolCalls[0];

    // 尝试对内容做 JSON 美化，便于阅读
    let prettyContent = message.content || '';
    if (prettyContent) {
      try {
        const parsed = JSON.parse(prettyContent);
        prettyContent = JSON.stringify(parsed, null, 2);
      } catch {
        // 非 JSON 字符串，保持原样
      }
    }

    uiMessages.push({
      id: `${message.id}:tool`,
      role: 'bot',
      content: prettyContent,
      isHtml: false,
      type: 'tool',
      metadata: {
        toolName: toolCall?.name
      }
    });

    return uiMessages;
  }

  const role: ChatMessage['role'] = message.role === 'user' ? 'user' : 'bot';

  // 思考内容：仅对 assistant 消息生效
  if (message.role === 'assistant' && message.thinking) {
    uiMessages.push({
      id: `${message.id}:thinking`,
      role: 'bot',
      content: message.thinking,
      isHtml: false,
      type: 'thinking',
      metadata: {}
    });
  }

  // 对于还在生成中的 assistant 消息，给一个占位提示，避免用户误以为没有响应
  let mainContent = message.content;
  if (
    message.role === 'assistant' &&
    !mainContent &&
    !message.thinking &&
    (message.status === 'pending' || message.status === 'streaming')
  ) {
    mainContent = '正在发送...';
  }

  // 主消息内容
  uiMessages.push({
    id: message.id,
    role,
    content: mainContent,
    isHtml: false,
    type: 'normal'
  });

  return uiMessages;
}

/**
 * 订阅 ChatService 的消息事件，并转换为 UI 可用的消息列表
 */
export function useChatMessages(initialMessages: ChatMessage[] = []) {
  const chatService = useService<IChatService>(IChatServiceId);
  const serviceMessages = useServiceEvent<ServiceChatMessage[]>(chatService.onDidMessageUpdate, []);

  const messages = useMemo<ChatMessage[]>(() => {
    const uiMessages: ChatMessage[] = [...initialMessages];

    for (const msg of serviceMessages) {
      uiMessages.push(...mapServiceMessageToUI(msg));
    }

    return uiMessages;
  }, [initialMessages, serviceMessages]);

  return { messages };
}

