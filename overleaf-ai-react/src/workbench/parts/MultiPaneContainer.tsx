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
    const { conversations, currentConversationId, createConversation } = useConversations();
    
    // 初始化时使用当前对话，如果没有则使用空字符串（等待创建）
    const [panes, setPanes] = useState<PaneState[]>(() => [
      { id: generatePaneId(), conversationId: currentConversationId || '' }
    ]);

    // 当外部当前对话改变时，更新第一个 pane（仅在单列模式下）
    useEffect(() => {
      if (panes.length === 1 && currentConversationId && panes[0].conversationId !== currentConversationId) {
        setPanes(prev => [{
          ...prev[0],
          conversationId: currentConversationId
        }]);
      }
    }, [currentConversationId, panes.length]);

    // 通知列数变化
    useEffect(() => {
      onColumnCountChange?.(panes.length);
    }, [panes.length, onColumnCountChange]);

    /**
     * 添加一列
     */
    const addPane = useCallback(async () => {
      // 为新列创建一个新对话或使用最新的对话
      let newConversationId = '';
      
      // 尝试使用一个不在当前显示中的对话
      const usedConversationIds = new Set(panes.map(p => p.conversationId));
      const availableConversation = conversations.find(c => !usedConversationIds.has(c.id));
      
      if (availableConversation) {
        newConversationId = availableConversation.id;
      } else {
        // 创建新对话
        newConversationId = await createConversation();
      }
      
      setPanes(prev => [
        ...prev,
        { id: generatePaneId(), conversationId: newConversationId }
      ]);
    }, [panes, conversations, createConversation]);

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
     */
    const setColumnCount = useCallback(async (count: number) => {
      if (count < 1) return;
      
      const currentCount = panes.length;
      
      if (count > currentCount) {
        // 需要增加列
        const newPanes: PaneState[] = [...panes];
        const usedConversationIds = new Set(panes.map(p => p.conversationId));
        
        for (let i = currentCount; i < count; i++) {
          // 尝试使用未显示的对话
          const availableConversation = conversations.find(c => !usedConversationIds.has(c.id));
          let newConversationId = '';
          
          if (availableConversation) {
            newConversationId = availableConversation.id;
            usedConversationIds.add(newConversationId);
          } else {
            // 创建新对话
            newConversationId = await createConversation();
            usedConversationIds.add(newConversationId);
          }
          
          newPanes.push({ id: generatePaneId(), conversationId: newConversationId });
        }
        
        setPanes(newPanes);
      } else if (count < currentCount) {
        // 需要减少列（从右边移除）
        setPanes(prev => prev.slice(0, count));
      }
    }, [panes, conversations, createConversation]);

    // 暴露控制方法给父组件
    useImperativeHandle(ref, () => ({
      addPane,
      removePane,
      setColumnCount,
      getColumnCount: () => panes.length
    }), [addPane, removePane, setColumnCount, panes.length]);

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
            />
          </React.Fragment>
        ))}
      </div>
    );
  }
);

MultiPaneContainer.displayName = 'MultiPaneContainer';

export default MultiPaneContainer;
