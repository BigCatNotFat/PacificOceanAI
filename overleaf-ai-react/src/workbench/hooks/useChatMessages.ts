import { useMemo, useState, useEffect } from 'react';
import { ChatMessage } from '../types/chat';
import { useService } from './useService';
import { useUIStreamUpdates } from './useUIStreamUpdates';
import type { IChatService, ChatMessage as ServiceChatMessage, MessageUpdateEvent } from '../../platform/agent/IChatService';
import { IChatServiceId } from '../../platform/agent/IChatService';

/**
 * 将 Service 层的 ChatMessage 映射为一个或多个 UI 层的 ChatMessage
 * - user 消息：直接映射为一条 normal 消息
 * - assistant 消息：
 *   - 如果存在 thinking，则生成一条 type = 'thinking' 的思考块消息
 *   - 如果有内容，则生成一条 type = 'normal' 的回答消息
 *   - 如果正在调用工具且没有内容，则不生成空消息
 *   - 如果有已存储的 toolCalls，会传递到 UI 消息中
 * - tool 消息：
 *   - 显示为一个类似思考块的折叠区域，展示工具调用结果
 * 
 * @param message - Service layer message
 * @param streamingContent - Optional streaming content override (from UIStreamService)
 * @param streamingThinking - Optional streaming thinking override (from UIStreamService)
 * @param hasActiveToolCalls - Whether there are active tool calls for this message
 * @param hasStreamingBuffer - Whether there is an active streaming buffer
 * @param hasStoredToolCalls - Whether the message has stored tool calls to display
 */
function mapServiceMessageToUI(
  message: ServiceChatMessage,
  streamingContent?: string,
  streamingThinking?: string,
  hasActiveToolCalls?: boolean,
  hasStreamingBuffer?: boolean,
  hasStoredToolCalls?: boolean
): ChatMessage[] {
  const uiMessages: ChatMessage[] = [];

  // 系统提示词消息：不在 UI 中显示（仅用于持久化和发送给 LLM）
  if (message.role === 'system') {
    return uiMessages;
  }

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
      // ✅ 关键：仍然需要一个"锚点消息"（id = message.id），否则 Sidebar 无法挂载工具调用块
      // 这个消息本身不展示正文，只用于承载 tool call 的 UI
      if (hasActiveToolCalls) {
        uiMessages.push({
          id: message.id,
          role,
          content: '',
          isHtml: false,
          type: 'tool_status'
        });
      }
      return uiMessages;
    }
    // 根据是否已有流式数据来决定显示文本：
    // - 还没有收到任何数据 → "正在发送..."
    // - 已开始接收数据但内容为空 → "正在思考..."
    mainContent = hasStreamingBuffer ? '正在思考...' : '正在发送...';
  }

  // 主消息内容：只有当有实际内容时才添加
  // 如果有已存储的 toolCalls，也需要添加这个消息作为工具调用 UI 的锚点
  if (mainContent || message.status === 'completed' || message.status === 'error' || hasStoredToolCalls) {
    const uiMessage: ChatMessage = {
      id: message.id,
      role,
      content: mainContent,
      isHtml: false,
      type: 'normal'
    };
    
    // 如果有已存储的工具调用，传递给 UI 层
    if (message.toolCalls && message.toolCalls.length > 0) {
      uiMessage.toolCalls = message.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        result: tc.result,
        status: tc.status
      }));
    }
    
    uiMessages.push(uiMessage);
  }

  return uiMessages;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * 订阅 ChatService 的消息事件，并转换为 UI 可用的消息列表
 * 
 * 支持按 conversationId 过滤消息，用于多列并行对话
 * 
 * @param conversationId - 会话 ID，用于过滤只属于该会话的消息
 * @param initialMessages - 初始消息列表
 */
export function useChatMessages(conversationId: string, initialMessages: ChatMessage[] = EMPTY_MESSAGES) {
  const chatService = useService<IChatService>(IChatServiceId);
  const { streamingBuffers } = useUIStreamUpdates();
  
  // 存储该 conversationId 的消息
  const [serviceMessages, setServiceMessages] = useState<ServiceChatMessage[]>(() => {
    // 初始化时尝试从 ChatService 获取已有消息
    return chatService.getMessages(conversationId);
  });

  // 订阅消息更新事件，只处理匹配的 conversationId
  useEffect(() => {
    // 切换会话时必须覆盖旧状态：新会话可能还没有任何消息（空数组也要写回）
    const existingMessages = chatService.getMessages(conversationId);
    setServiceMessages(existingMessages);
    
    // 如果当前 session 没有消息，尝试从 ConversationService 加载
    // 这对于多列对话场景很重要，比如打开分支对话时需要加载已有消息
    if (existingMessages.length === 0 && conversationId) {
      chatService.loadConversationMessages(conversationId).then((loadedMessages) => {
        if (loadedMessages.length > 0) {
          setServiceMessages(loadedMessages);
        }
      });
    }

    const disposable = chatService.onDidMessageUpdate((event: MessageUpdateEvent) => {
      if (event.conversationId === conversationId) {
        setServiceMessages(event.messages);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [chatService, conversationId]);

  const messages = useMemo<ChatMessage[]>(() => {
    const uiMessages: ChatMessage[] = [...initialMessages];

    for (const msg of serviceMessages) {
      // ========== plan/multi-agent：为每个子 messageId 生成独立的 UI 块 ==========
      // 约定：子 messageId 形如 `${rootId}::...`，其 thinking/toolCall 事件会挂在子 messageId 上
      // 如果我们只渲染 root，会出现：
      // - 工具调用 UI 不显示（ConversationPane 只看 buffer(messageId)）
      // - thinking 全部合并在一块
      if (msg.role === 'assistant') {
        const prefix = `${msg.id}::`;
        // 收集子 buffer（按 ts_<ms> 排序，其次按 iter_<n> 排序，保证跨 agent 串行执行时顺序正确）
        const children: Array<{ id: string; buf: any; ts: number; iter: number }> = [];
        for (const [key, buf] of streamingBuffers.entries()) {
          if (!key.startsWith(prefix)) continue;
          const mIter = key.match(/::iter_(\d+)$/);
          const iter = mIter ? Number(mIter[1]) : 0;
          const mTs = key.match(/::ts_(\d+)::/);
          const ts = mTs ? Number(mTs[1]) : 0;
          children.push({ id: key, buf, ts, iter });
        }
        children.sort((a, b) => (a.ts - b.ts) || (a.iter - b.iter));

        for (const child of children) {
          // 思考块：直接使用子 messageId 生成 `${childId}:thinking`，这样 ConversationPane 的展开逻辑能跟上流式事件
          if (child.buf?.thinking) {
            uiMessages.push({
              id: `${child.id}:thinking`,
              role: 'bot',
              content: child.buf.thinking,
              isHtml: false,
              type: 'thinking',
              metadata: {}
            });
          }

          // 工具块锚点：id = childId，让 ConversationPane 能通过 streamingBuffers.get(childId) 渲染工具调用
          if (child.buf?.toolCalls && child.buf.toolCalls.size > 0) {
            uiMessages.push({
              id: child.id,
              role: 'bot',
              content: '',
              isHtml: false,
              type: 'tool_status'
            });
          }
        }
      }

      // root 消息只使用 root 自己的 buffer（通常用于最终回答内容的流式输出）
      const streamingBuffer = streamingBuffers.get(msg.id);
      // 检查是否有活跃的工具调用（running 状态）
      const hasActiveToolCalls = streamingBuffer?.toolCalls 
        ? Array.from(streamingBuffer.toolCalls.values()).some(tc => tc.status === 'running' || tc.status === 'pending')
        : false;
      // 检查是否已经有流式数据（用于区分"正在发送"和"正在思考"）
      const hasStreamingBuffer = streamingBuffer !== undefined;
      // 检查是否有已存储的工具调用（从存储恢复时使用）
      const hasStoredToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
      
      uiMessages.push(
        ...mapServiceMessageToUI(
          msg,
          streamingBuffer?.content,
          streamingBuffer?.thinking,
          hasActiveToolCalls,
          hasStreamingBuffer,
          hasStoredToolCalls
        )
      );
    }

    return uiMessages;
  }, [initialMessages, serviceMessages, streamingBuffers]);

  return { messages };
}
