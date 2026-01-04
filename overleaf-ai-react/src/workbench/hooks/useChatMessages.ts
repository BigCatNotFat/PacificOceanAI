import { useMemo } from 'react';
import { ChatMessage } from '../types/chat';
import { useService } from './useService';
import { useServiceEvent } from './useServiceEvent';
import { useUIStreamUpdates } from './useUIStreamUpdates';
import type { IChatService, ChatMessage as ServiceChatMessage } from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';

/**
 * 将 Service 层的 ChatMessage 映射为一个或多个 UI 层的 ChatMessage
 * - user 消息：直接映射为一条 normal 消息
 * - assistant 消息：
 *   - 如果存在 thinking，则生成一条 type = 'thinking' 的思考块消息
 *   - 如果有内容，则生成一条 type = 'normal' 的回答消息
 *   - 如果正在调用工具且没有内容，则不生成空消息
 * - tool 消息：
 *   - 显示为一个类似思考块的折叠区域，展示工具调用结果
 * 
 * @param message - Service layer message
 * @param streamingContent - Optional streaming content override (from UIStreamService)
 * @param streamingThinking - Optional streaming thinking override (from UIStreamService)
 * @param hasActiveToolCalls - Whether there are active tool calls for this message
 */
function mapServiceMessageToUI(
  message: ServiceChatMessage,
  streamingContent?: string,
  streamingThinking?: string,
  hasActiveToolCalls?: boolean,
  hasStreamingBuffer?: boolean
): ChatMessage[] {
  const uiMessages: ChatMessage[] = [];

  // 工具消息：展示为单独的工具调用折叠区域
  if (message.role === 'tool') {
    // 工具执行结果改由 Sidebar 中的流式 Tool 调用 UI 展示
    return uiMessages;
  }

  const role: ChatMessage['role'] = message.role === 'user' ? 'user' : 'bot';

  // 思考内容：仅对 assistant 消息生效
  // Prioritize streaming thinking if available
  const thinkingContent = streamingThinking || message.thinking;
  if (message.role === 'assistant' && thinkingContent) {
    uiMessages.push({
      id: `${message.id}:thinking`,
      role: 'bot',
      content: thinkingContent,
      isHtml: false,
      type: 'thinking',
      metadata: {}
    });
  }

  // Prioritize streaming content if available
  let mainContent = streamingContent !== undefined ? streamingContent : message.content;
  
  // 对于还在生成中的 assistant 消息的处理逻辑：
  // 1. 如果有 thinking 内容且正在调用工具，不显示空消息（工具块会展示进度）
  // 2. 如果还没有收到任何流式数据，显示"正在发送..."
  // 3. 如果已经开始接收流式数据但内容为空，显示"正在思考..."
  // 4. 如果有工具调用但没有 thinking，也不显示空消息
  const isStreaming = message.status === 'pending' || message.status === 'streaming';
  
  if (message.role === 'assistant' && !mainContent && isStreaming) {
    // 如果有活跃的工具调用或有 thinking 内容，不需要显示占位符
    // 工具调用块会展示当前进度
    if (hasActiveToolCalls || thinkingContent) {
      // 不添加空的主消息，让工具调用块显示进度
      return uiMessages;
    }
    // 根据是否已有流式数据来决定显示文本：
    // - 还没有收到任何数据 → "正在发送..."
    // - 已开始接收数据但内容为空 → "正在思考..."
    mainContent = hasStreamingBuffer ? '正在思考...' : '正在发送...';
  }

  // 主消息内容：只有当有实际内容时才添加
  if (mainContent || message.status === 'completed' || message.status === 'error') {
    uiMessages.push({
      id: message.id,
      role,
      content: mainContent,
      isHtml: false,
      type: 'normal'
    });
  }

  return uiMessages;
}

/**
 * 订阅 ChatService 的消息事件，并转换为 UI 可用的消息列表
 * 
 * This hook now integrates real-time streaming updates from UIStreamService
 * to provide a smooth, character-by-character streaming experience.
 */
export function useChatMessages(initialMessages: ChatMessage[] = []) {
  const chatService = useService<IChatService>(IChatServiceId);
  const serviceMessages = useServiceEvent<ServiceChatMessage[]>(chatService.onDidMessageUpdate, []);
  const { streamingBuffers } = useUIStreamUpdates();

  const messages = useMemo<ChatMessage[]>(() => {
    const uiMessages: ChatMessage[] = [...initialMessages];

    for (const msg of serviceMessages) {
      const streamingBuffer = streamingBuffers.get(msg.id);
      // 检查是否有活跃的工具调用（running 状态）
      const hasActiveToolCalls = streamingBuffer?.toolCalls 
        ? Array.from(streamingBuffer.toolCalls.values()).some(tc => tc.status === 'running' || tc.status === 'pending')
        : false;
      // 检查是否已经有流式数据（用于区分"正在发送"和"正在思考"）
      const hasStreamingBuffer = streamingBuffer !== undefined;
      
      uiMessages.push(
        ...mapServiceMessageToUI(
          msg,
          streamingBuffer?.content,
          streamingBuffer?.thinking,
          hasActiveToolCalls,
          hasStreamingBuffer
        )
      );
    }

    return uiMessages;
  }, [initialMessages, serviceMessages, streamingBuffers]);

  return { messages };
}

