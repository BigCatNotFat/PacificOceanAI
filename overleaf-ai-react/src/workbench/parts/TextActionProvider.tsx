/**
 * 文本操作 Provider 组件
 * 
 * 负责初始化文本操作服务，并注册默认的操作处理器
 * 
 * 设计原则：
 * - 低耦合：操作处理器可以在这里统一注册，也可以在其他组件中单独注册
 * - 可扩展：新增操作只需在此添加处理器即可
 * - 状态提示：可以显示操作进行中的状态
 * 
 * 预览模式（v2）：
 * - 操作结果先显示预览（删除线原文 + 新文本）
 * - 用户确认后才真正替换
 * - 用户拒绝则保持原样
 */

import React, { useEffect, useState } from 'react';
import { useTextAction } from '../hooks/useTextAction';
import type { TextActionType } from '../../services/editor/bridge';

interface TextActionProviderProps {
  children: React.ReactNode;
  /** 是否显示操作状态提示 */
  showStatusToast?: boolean;
}

/**
 * 默认的操作处理器（测试实现）
 * 返回固定文本用于测试预览功能
 * 后续可以在这里接入 AI 服务
 */
const defaultHandlers: Record<TextActionType, (text: string) => Promise<string>> = {
  expand: async (text: string) => {
    console.log('[TextActionProvider] 扩写 - 原文:', text.substring(0, 50));
    // 测试用：返回扩展后的文本
    return `${text}\n\n这是扩写后新增的内容。扩写功能会在原文基础上添加更多细节和解释，使文章更加丰富完整。这段话是测试用的固定文本，后续将接入 AI 服务生成真正的扩写内容。`;
  },
  
  condense: async (text: string) => {
    console.log('[TextActionProvider] 缩写 - 原文:', text.substring(0, 50));
    // 测试用：返回缩写后的文本（简单截取前半部分作为演示）
    const words = text.split(/\s+/);
    const condensed = words.slice(0, Math.max(Math.ceil(words.length / 2), 5)).join(' ');
    return `${condensed}（已缩写）`;
  },
  
  polish: async (text: string) => {
    console.log('[TextActionProvider] 润色 - 原文:', text.substring(0, 50));
    // 测试用：返回润色后的固定文本
    return `【润色后】${text}

这是经过润色优化后的文本。润色功能会改进文章的表达方式、语法结构和用词，使其更加流畅自然。此为测试文本，实际效果将由 AI 服务提供。`;
  }
};

export const TextActionProvider: React.FC<TextActionProviderProps> = ({ 
  children,
  showStatusToast = true 
}) => {
  const { registerHandler, isProcessing, lastResult, lastRequest, previewDecision } = useTextAction();
  const [showDecisionToast, setShowDecisionToast] = useState(false);
  const [decisionAccepted, setDecisionAccepted] = useState<boolean | null>(null);
  
  // 注册默认处理器
  useEffect(() => {
    const disposables = Object.entries(defaultHandlers).map(([action, handler]) => {
      return registerHandler(action as TextActionType, async (_action, text, _from, _to) => {
        return await handler(text);
      });
    });
    
    console.log('[TextActionProvider] 已注册默认操作处理器（预览模式）:', Object.keys(defaultHandlers));
    
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [registerHandler]);
  
  // 监听预览决策结果
  useEffect(() => {
    if (previewDecision) {
      setDecisionAccepted(previewDecision.accepted);
      setShowDecisionToast(true);
      
      // 2秒后隐藏提示
      const timer = setTimeout(() => {
        setShowDecisionToast(false);
        setDecisionAccepted(null);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [previewDecision]);
  
  // 日志输出操作结果（调试用）
  useEffect(() => {
    if (lastResult) {
      if (lastResult.success) {
        console.log('[TextActionProvider] 操作成功:', lastResult.action);
      } else {
        console.warn('[TextActionProvider] 操作失败:', lastResult.action, lastResult.error);
      }
    }
  }, [lastResult]);
  
  return (
    <>
      {children}
      
      {/* 操作进行中提示 */}
      {showStatusToast && isProcessing && lastRequest && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'rgba(30, 41, 59, 0.95)',
            color: '#e5e7eb',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px'
          }}
        >
          <span
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <span>
            正在{lastRequest.action === 'expand' ? '扩写' : 
                  lastRequest.action === 'condense' ? '缩写' : '润色'}...
          </span>
        </div>
      )}
      
      {/* 预览决策结果提示 */}
      {showDecisionToast && decisionAccepted !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: decisionAccepted ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            animation: 'fadeInOut 2s ease-in-out'
          }}
        >
          <span style={{ fontSize: '18px' }}>
            {decisionAccepted ? '✅' : '❌'}
          </span>
          <span>
            {decisionAccepted ? '已接受更改' : '已拒绝更改'}
          </span>
        </div>
      )}
      
      {/* CSS 动画 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
    </>
  );
};

export default TextActionProvider;

