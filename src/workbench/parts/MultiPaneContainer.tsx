/**
 * MultiPaneContainer - 多列对话容器组件
 * 
 * 管理多个 ConversationPane 的布局，支持：
 * - 动态增加/减少列数
 * - 每列独立显示不同对话
 * - 列间可拖拽调整宽度（未来功能）
 */

import React, { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import ConversationPane from './ConversationPane';
import { useConversations } from '../hooks/useConversations';

interface PaneState {
  /** Pane 的唯一标识 */
  id: string;
  /** 当前显示的对话 ID */
  conversationId: string;
}

interface MultiPaneContainerProps {
  /** 列数变化时的回调 */
  onColumnCountChange?: (count: number) => void;
}

/**
 * 暴露给父组件的控制方法
 */
export interface MultiPaneContainerHandle {
  addPane: () => void;
  removePane: (paneId: string) => void;
  setColumnCount: (count: number) => void;
  getColumnCount: () => number;
  /** 在新列中打开指定对话 */
  openInNewPane: (conversationId: string) => void;
}

/**
 * 生成唯一的 Pane ID
 */
let paneIdCounter = 0;
function generatePaneId(): string {
  return `pane_${Date.now()}_${paneIdCounter++}`;
}

const MultiPaneContainer = forwardRef<MultiPaneContainerHandle, MultiPaneContainerProps>(
  ({ onColumnCountChange }, ref) => {
    const { conversations, currentConversationId } = useConversations();
    
    // 初始化时使用当前对话，如果没有则使用空字符串（等待创建）
    const [panes, setPanes] = useState<PaneState[]>(() => [
      { id: generatePaneId(), conversationId: currentConversationId || '' }
    ]);

    // 当外部当前对话改变时，更新第一个 pane（仅在单列模式下）
    // 使用 setState 回调确保访问到最新的 panes 状态，避免闭包导致的竞态问题
    useEffect(() => {
      if (!currentConversationId) return;
      
      setPanes(prev => {
        // 只在单列模式下同步全局当前对话
        // 多列模式下，每个 pane 独立管理自己的对话，不受全局状态影响
        if (prev.length !== 1) return prev;
        if (prev[0].conversationId === currentConversationId) return prev;
        
        return [{
          ...prev[0],
          conversationId: currentConversationId
        }];
      });
    }, [currentConversationId]);

    // 通知列数变化
    useEffect(() => {
      onColumnCountChange?.(panes.length);
    }, [panes.length, onColumnCountChange]);

    /**
     * 添加一列
     * 
     * 新列默认显示空白对话界面（草稿模式）。
     * 只有当用户发送第一条消息时，对话才会被创建并出现在列表中。
     */
    const addPane = useCallback(() => {
      // 尝试使用一个不在当前显示中的历史对话
      const usedConversationIds = new Set(panes.map(p => p.conversationId).filter(Boolean));
      const availableConversation = conversations.find(c => !usedConversationIds.has(c.id));
      
      // 如果有可用的历史对话就使用，否则使用空字符串（草稿模式）
      const newConversationId = availableConversation?.id || '';
      
      setPanes(prev => [
        ...prev,
        { id: generatePaneId(), conversationId: newConversationId }
      ]);
    }, [panes, conversations]);

    /**
     * 移除一列
     */
    const removePane = useCallback((paneId: string) => {
      setPanes(prev => {
        if (prev.length <= 1) return prev; // 至少保留一列
        return prev.filter(p => p.id !== paneId);
      });
    }, []);

    /**
     * 更新某一列显示的对话
     */
    const updatePaneConversation = useCallback((paneId: string, conversationId: string) => {
      setPanes(prev => prev.map(p => 
        p.id === paneId ? { ...p, conversationId } : p
      ));
    }, []);

    /**
     * 设置列数
     * 
     * 新增的列默认显示空白对话界面（草稿模式）。
     * 只有当用户发送第一条消息时，对话才会被创建并出现在列表中。
     */
    const setColumnCount = useCallback((count: number) => {
      if (count < 1) return;
      
      const currentCount = panes.length;
      
      if (count > currentCount) {
        // 需要增加列
        const newPanes: PaneState[] = [...panes];
        const usedConversationIds = new Set(
          panes.map(p => p.conversationId).filter(Boolean)
        );
        
        for (let i = currentCount; i < count; i++) {
          // 尝试使用未显示的历史对话
          const availableConversation = conversations.find(c => !usedConversationIds.has(c.id));
          
          // 如果有可用的历史对话就使用，否则使用空字符串（草稿模式）
          const newConversationId = availableConversation?.id || '';
          
          if (newConversationId) {
            usedConversationIds.add(newConversationId);
          }
          
          newPanes.push({ id: generatePaneId(), conversationId: newConversationId });
        }
        
        setPanes(newPanes);
      } else if (count < currentCount) {
        // 需要减少列（从右边移除）
        setPanes(prev => prev.slice(0, count));
      }
    }, [panes, conversations]);

    /**
     * 在新列中打开指定对话
     */
    const openInNewPane = useCallback((conversationId: string) => {
      setPanes(prev => [
        ...prev,
        { id: generatePaneId(), conversationId }
      ]);
    }, []);

    // 暴露控制方法给父组件
    useImperativeHandle(ref, () => ({
      addPane,
      removePane,
      setColumnCount,
      getColumnCount: () => panes.length,
      openInNewPane
    }), [addPane, removePane, setColumnCount, panes.length, openInNewPane]);

    return (
      <div className="multi-pane-container">
        {panes.map((pane, index) => (
          <React.Fragment key={pane.id}>
            {index > 0 && <div className="pane-divider" />}
            <ConversationPane
              conversationId={pane.conversationId}
              onConversationChange={(newId) => updatePaneConversation(pane.id, newId)}
              showCloseButton={panes.length > 1}
              onClose={() => removePane(pane.id)}
              compact={panes.length > 1}
              onBranchInNewPane={openInNewPane}
            />
          </React.Fragment>
        ))}
      </div>
    );
  }
);

MultiPaneContainer.displayName = 'MultiPaneContainer';

export default MultiPaneContainer;
