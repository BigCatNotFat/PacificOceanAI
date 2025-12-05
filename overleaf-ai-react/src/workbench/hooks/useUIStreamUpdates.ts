import { useEffect, useState, useRef } from 'react';
import { useService } from './useService';
import type { IUIStreamService } from '../../platform/agent/IUIStreamService';
import { IUIStreamServiceId } from '../../platform/agent/IUIStreamService';

/**
 * Streaming buffer for a single message
 */
interface StreamingBuffer {
  messageId: string;
  thinking: string;
  content: string;
  toolCalls: Map<string, { name: string; args: string; result?: string }>;
}

/**
 * Hook that subscribes to UIStreamService events and provides streaming updates
 * 
 * Returns a map of messageId -> streaming content that can be used to update
 * messages in real-time as the LLM generates responses.
 */
export function useUIStreamUpdates() {
  const uiStreamService = useService<IUIStreamService>(IUIStreamServiceId);
  const [streamingBuffers, setStreamingBuffers] = useState<Map<string, StreamingBuffer>>(new Map());
  
  // Use ref to avoid stale closures in event handlers
  const buffersRef = useRef(streamingBuffers);
  buffersRef.current = streamingBuffers;

  useEffect(() => {
    if (!uiStreamService) {
      console.warn('[useUIStreamUpdates] UIStreamService not available');
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
        const existing = next.get(event.messageId);
        
        if (!existing) {
          return prev; // Don't create buffer for tool calls alone
        }
        
        const existingToolCall = existing.toolCalls.get(event.toolCallId);
        const toolCall = existingToolCall ? { ...existingToolCall } : {
          name: event.name || '',
          args: '',
          result: undefined
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
        
        // ✅ 创建新的 Map 和新的对象
        const newToolCalls = new Map(existing.toolCalls);
        newToolCalls.set(event.toolCallId, toolCall);
        
        next.set(event.messageId, {
          ...existing,
          toolCalls: newToolCalls
        });
        
        // Clean up on end
        if (event.phase === 'end' || event.phase === 'error') {
          // Keep tool call data for final render
        }
        
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
