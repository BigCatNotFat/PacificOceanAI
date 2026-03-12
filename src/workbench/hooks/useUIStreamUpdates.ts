import { useEffect, useState, useRef } from 'react';
import { useService } from './useService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';

/**
 * Tool call status
 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * Tool call info for UI display
 */
export interface ToolCallInfo {
  name: string;
  args: string;
  result?: string;
  status: ToolCallStatus;
  error?: string;
}

/**
 * Streaming buffer for a single message
 */
export interface StreamingBuffer {
  messageId: string;
  thinking: string;
  content: string;
  toolCalls: Map<string, ToolCallInfo>;
}

/**
 * Hook that subscribes to UIStreamService events and provides streaming updates
 * 
 * Returns a map of messageId -> streaming content that can be used to update
 * messages in real-time as the LLM generates responses.
 * 
 * 注意：由于消息 ID 现在包含 conversationId 前缀，是全局唯一的，
 * 所以不再需要在对话切换时清空所有 buffer。
 * 这支持了多列并行对话的功能。
 */
export function useUIStreamUpdates() {
  const uiStreamService = useService<IUIStreamService>(IUIStreamServiceId);
  const [streamingBuffers, setStreamingBuffers] = useState<Map<string, StreamingBuffer>>(new Map());
  
  // Use ref to avoid stale closures in event handlers
  const buffersRef = useRef(streamingBuffers);
  buffersRef.current = streamingBuffers;

  // 注意：移除了对话切换时清空所有 buffer 的逻辑
  // 因为消息 ID 现在是全局唯一的（包含 conversationId 前缀），
  // 不同对话的消息不会发生 ID 冲突，所以不需要在切换时清空

  useEffect(() => {
    if (!uiStreamService) {
      return;
    }

    // Subscribe to thinking updates
    const thinkingDisposable = uiStreamService.onDidThinkingUpdate((event) => {
      setStreamingBuffers((prev) => {
        const next = new Map(prev);
        const existing = next.get(event.messageId);
        
        // ✅ 创建新对象而不是修改现有对象
        if (existing) {
          next.set(event.messageId, {
            ...existing,
            thinking: event.fullText
          });
        } else {
          next.set(event.messageId, {
            messageId: event.messageId,
            thinking: event.fullText,
            content: '',
            toolCalls: new Map()
          });
        }
        
        // Clear buffer when thinking is done
        if (event.done) {
          // Keep the buffer for a bit to allow final render
          setTimeout(() => {
            setStreamingBuffers((current) => {
              const updated = new Map(current);
              const buf = updated.get(event.messageId);
              if (buf) {
                // ✅ 创建新对象
                updated.set(event.messageId, {
                  ...buf,
                  thinking: event.fullText
                });
              }
              return updated;
            });
          }, 100);
        }
        
        return next;
      });
    });

    // Subscribe to content updates
    const contentDisposable = uiStreamService.onDidContentUpdate((event) => {
      setStreamingBuffers((prev) => {
        const next = new Map(prev);
        const existing = next.get(event.messageId);
        
        // ✅ 创建新对象而不是修改现有对象
        if (existing) {
          next.set(event.messageId, {
            ...existing,
            content: event.fullText
          });
        } else {
          next.set(event.messageId, {
            messageId: event.messageId,
            thinking: '',
            content: event.fullText,
            toolCalls: new Map()
          });
        }
        
        // Clear buffer when content is done
        if (event.done) {
          setTimeout(() => {
            setStreamingBuffers((current) => {
              const updated = new Map(current);
              // Don't delete immediately - keep final state for rendering
              return updated;
            });
          }, 100);
        }
        
        return next;
      });
    });

    // Subscribe to tool call updates
    const toolCallDisposable = uiStreamService.onDidToolCallUpdate((event) => {
      setStreamingBuffers((prev) => {
        const next = new Map(prev);
        let existing = next.get(event.messageId);
        
        // 如果没有现有的 buffer，为工具调用创建一个
        if (!existing) {
          existing = {
            messageId: event.messageId,
            thinking: '',
            content: '',
            toolCalls: new Map()
          };
          next.set(event.messageId, existing);
        }
        
        const existingToolCall = existing.toolCalls.get(event.toolCallId);
        const toolCall: ToolCallInfo = existingToolCall ? { ...existingToolCall } : {
          name: event.name || '',
          args: '',
          result: undefined,
          status: 'pending'
        };
        
        if (event.name) {
          toolCall.name = event.name;
        }
        
        if (event.fullArgs) {
          toolCall.args = event.fullArgs;
        }
        
        if (event.fullResult) {
          toolCall.result = event.fullResult;
        }

        // 更新状态
        switch (event.phase) {
          case 'start':
            toolCall.status = 'running';
            break;
          case 'args':
          case 'args_done':  // 参数流式完成，但工具尚未执行
          case 'log':
          case 'result':
            toolCall.status = 'running';
            break;
          case 'end':
            toolCall.status = 'completed';
            break;
          case 'error':
            toolCall.status = 'error';
            toolCall.error = event.error;
            break;
        }
        
        // ✅ 创建新的 Map 和新的对象
        const newToolCalls = new Map(existing.toolCalls);
        newToolCalls.set(event.toolCallId, toolCall);
        
        next.set(event.messageId, {
          ...existing,
          toolCalls: newToolCalls
        });
        
        return next;
      });
    });

    // Cleanup on unmount
    return () => {
      thinkingDisposable.dispose();
      contentDisposable.dispose();
      toolCallDisposable.dispose();
    };
  }, [uiStreamService]);

  return {
    /**
     * Get streaming buffer for a specific message
     */
    getStreamingBuffer: (messageId: string): StreamingBuffer | undefined => {
      return streamingBuffers.get(messageId);
    },
    
    /**
     * All streaming buffers
     */
    streamingBuffers
  };
}
