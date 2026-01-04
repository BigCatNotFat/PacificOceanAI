/**
 * useConversations Hook
 * 
 * 提供对话历史管理的 React 接口：
 * - 获取对话列表
 * - 创建/切换/删除对话
 * - 监听对话变化事件
 */

import { useState, useEffect, useCallback } from 'react';
import { useService } from './useService';
import type { IConversationService, ConversationMeta } from '../../platform/agent/IConversationService';
import { IConversationServiceId } from '../../platform/agent/IConversationService';

export interface UseConversationsResult {
  /** 对话列表 */
  conversations: ConversationMeta[];
  /** 当前对话 ID */
  currentConversationId: string | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 创建新对话 */
  createConversation: (name?: string) => Promise<string>;
  /** 切换对话 */
  switchConversation: (conversationId: string) => Promise<void>;
  /** 重命名对话 */
  renameConversation: (conversationId: string, name: string) => Promise<void>;
  /** 删除对话 */
  deleteConversation: (conversationId: string) => Promise<void>;
  /** 清空所有对话 */
  clearAllConversations: () => Promise<void>;
}

/**
 * 对话管理 Hook
 */
export function useConversations(): UseConversationsResult {
  const conversationService = useService<IConversationService>(IConversationServiceId);
  
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化加载对话列表
  useEffect(() => {
    const loadConversations = async () => {
      setIsLoading(true);
      try {
        const list = await conversationService.getConversationList();
        setConversations(list);
        setCurrentConversationId(conversationService.getCurrentConversationId());
      } catch (error) {
        console.error('[useConversations] 加载对话列表失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversations();
  }, [conversationService]);

  // 监听对话列表变化
  useEffect(() => {
    const disposable = conversationService.onDidConversationListChange((event) => {
      setConversations(event.conversations);
      setCurrentConversationId(event.currentId);
    });

    return () => disposable.dispose();
  }, [conversationService]);

  // 监听当前对话变化
  useEffect(() => {
    const disposable = conversationService.onDidCurrentConversationChange((event) => {
      setCurrentConversationId(event.conversationId);
    });

    return () => disposable.dispose();
  }, [conversationService]);

  // 创建新对话
  const createConversation = useCallback(async (name?: string): Promise<string> => {
    const id = await conversationService.createConversation(name);
    return id;
  }, [conversationService]);

  // 切换对话
  const switchConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversationService.switchConversation(conversationId);
  }, [conversationService]);

  // 重命名对话
  const renameConversation = useCallback(async (conversationId: string, name: string): Promise<void> => {
    await conversationService.renameConversation(conversationId, name);
  }, [conversationService]);

  // 删除对话
  const deleteConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversationService.deleteConversation(conversationId);
  }, [conversationService]);

  // 清空所有对话
  const clearAllConversations = useCallback(async (): Promise<void> => {
    await conversationService.clearAllConversations();
  }, [conversationService]);

  return {
    conversations,
    currentConversationId,
    isLoading,
    createConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    clearAllConversations
  };
}




