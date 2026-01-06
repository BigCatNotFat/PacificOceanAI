/**
 * 文本操作 Provider 组件
 * 
 * 负责初始化文本操作服务，并注册 AI 操作处理器
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
 * 
 * AI 集成：
 * - 使用 TextActionAIService 进行真实的 AI 调用
 * - 支持流式输出
 */

import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useTextAction } from '../hooks/useTextAction';
import { useService } from '../hooks/useService';
import type { TextActionType } from '../../services/editor/bridge';
import type { ITextActionAIService } from '../../platform/agent/ITextActionAIService';
import { ITextActionAIServiceId } from '../../services/agent/TextActionAIService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import type { IConfigurationService } from '../../platform/configuration/configuration';

interface TextActionProviderProps {
  children: React.ReactNode;
  /** 是否显示操作状态提示 */
  showStatusToast?: boolean;
}

export const TextActionProvider: React.FC<TextActionProviderProps> = ({ 
  children,
  showStatusToast = true 
}) => {
  const { registerHandler, isProcessing, lastResult, lastRequest, previewDecision } = useTextAction();
  const [showDecisionToast, setShowDecisionToast] = useState(false);
  const [decisionAccepted, setDecisionAccepted] = useState<boolean | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  
  // 获取 TextActionAI 服务
  const textActionAIService = useService<ITextActionAIService>(ITextActionAIServiceId);
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  
  // 使用 ref 保存服务实例，避免在 useEffect 中引起重新注册
  const serviceRef = useRef(textActionAIService);
  serviceRef.current = textActionAIService;

  // 用于中断请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============ 激活状态同步到注入脚本 ============
  
  // 发送激活状态到注入脚本
  const sendActivationStatus = useCallback(async () => {
    const config = await configService.getAPIConfig();
    // 只有当 apiKey 存在且已验证时才认为已激活
    const isActivated = !!(config && config.apiKey && config.isVerified);
    
    window.postMessage({
      type: 'OVERLEAF_ACTIVATION_STATUS_UPDATE',
      data: { isActivated }
    }, '*');
    
    console.log('[TextActionProvider] Sent activation status:', isActivated, '(apiKey:', !!config?.apiKey, 'isVerified:', !!config?.isVerified, ')');
  }, [configService]);

  // 初始化时和配置变化时同步激活状态
  useEffect(() => {
    // 初始同步
    sendActivationStatus();
    
    // 监听激活状态请求
    const handleActivationStatusRequest = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_REQUEST_ACTIVATION_STATUS') {
        sendActivationStatus();
      }
    };
    
    // 监听显示激活模态框请求（来自注入脚本）
    const handleShowActivationModal = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_SHOW_ACTIVATION_MODAL') {
        window.dispatchEvent(new CustomEvent('SHOW_ACTIVATION_MODAL'));
      }
    };
    
    window.addEventListener('message', handleActivationStatusRequest);
    window.addEventListener('message', handleShowActivationModal);
    
    return () => {
      window.removeEventListener('message', handleActivationStatusRequest);
      window.removeEventListener('message', handleShowActivationModal);
    };
  }, [sendActivationStatus]);
  
  // 思考内容滚动区域的 ref - 用于实现从底部向上滚动的效果
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  
  // 当思考内容更新时，自动滚动到底部
  useLayoutEffect(() => {
    if (thinkingScrollRef.current && streamingThinking) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [streamingThinking]);
  
  // 创建 AI 调用处理器
  const createAIHandler = useCallback((action: TextActionType) => {
    return async (_action: TextActionType, text: string, from: number, to: number, modelId?: string, customPrompt?: string, context?: { before?: string; after?: string }): Promise<string | null> => {
      // 检查 API Key 和验证状态
      const config = await configService.getAPIConfig();
      if (!config || !config.apiKey || !config.isVerified) {
        console.warn('[TextActionProvider] 未配置或未验证 API Key，请求用户激活');
        window.dispatchEvent(new CustomEvent('SHOW_ACTIVATION_MODAL'));
        return null;
      }

      console.log(`[TextActionProvider] AI ${action} - 原文长度:`, text.length, '模型:', modelId, 
        customPrompt ? '自定义:' + customPrompt.substring(0, 30) + '...' : '',
        '上下文:', { before: context?.before?.length || 0, after: context?.after?.length || 0 });
      
      // 重置流式文本
      setStreamingText('');
      setStreamingThinking('');

      // 创建新的 AbortController（中断之前的请求如果存在）
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      // 1. 立即发送开始流式预览消息，弹出预览窗口
      window.postMessage({
        type: 'OVERLEAF_STREAM_PREVIEW_START',
        data: {
          action,
          originalText: text,
          from,
          to
        }
      }, '*');
      
      // 2. 流式输出回调 - 发送增量更新到预览窗口
      const onStream = (delta: string) => {
        setStreamingText(prev => prev + delta);
        // 发送增量更新到预览窗口
        window.postMessage({
          type: 'OVERLEAF_STREAM_PREVIEW_UPDATE',
          data: { delta }
        }, '*');
      };

      // 3. 思考过程流式输出回调
      const onThinkingStream = (delta: string) => {
        setStreamingThinking(prev => prev + delta);
        // 发送思考过程增量更新到预览窗口
        window.postMessage({
          type: 'OVERLEAF_STREAM_THINKING_UPDATE',
          data: { delta }
        }, '*');
      };
      
      try {
        const result = await serviceRef.current.execute({
          action,
          text,
          modelId,
          customPrompt,  // 传递自定义提示词
          context,       // 传递上下文信息（用于提高翻译等操作的准确性）
          onStream,
          onThinkingStream,
          abortSignal: abortControllerRef.current.signal
        });
        
        if (result.success && result.resultText) {
          console.log(`[TextActionProvider] AI ${action} 成功 - 结果长度:`, result.resultText.length);
          
          // 3. 发送流式预览完成消息
          window.postMessage({
            type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
            data: { newText: result.resultText }
          }, '*');
          
          return result.resultText;
        } else {
          console.error(`[TextActionProvider] AI ${action} 失败:`, result.error);
          // 发送完成消息（即使失败也要关闭加载状态）
          window.postMessage({
            type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
            data: { newText: result.error || '生成失败' }
          }, '*');
          return null;
        }
      } catch (error) {
        console.error(`[TextActionProvider] AI ${action} 异常:`, error);
        // 发送完成消息
        window.postMessage({
          type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
          data: { newText: '发生错误: ' + String(error) }
        }, '*');
        return null;
      }
    };
  }, []);
  
  // 注册 AI 处理器
  useEffect(() => {
    const actions: TextActionType[] = ['polish', 'expand', 'condense', 'translate', 'custom'];
    const disposables = actions.map(action => {
      return registerHandler(action, createAIHandler(action));
    });
    
    console.log('[TextActionProvider] 已注册 AI 操作处理器:', actions);
    
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [registerHandler, createAIHandler]);
  
  // 监听取消消息（直接监听，不依赖 React 状态传递）
  useEffect(() => {
    const handleCancelMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_STREAM_CANCEL') {
        console.log('[TextActionProvider] 收到取消信号，中断请求');
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        // 重置流式状态
        setStreamingText('');
        setStreamingThinking('');
      }
    };
    
    window.addEventListener('message', handleCancelMessage);
    return () => window.removeEventListener('message', handleCancelMessage);
  }, []);

  // 监听预览决策结果
  useEffect(() => {
    if (previewDecision) {
      setDecisionAccepted(previewDecision.accepted);
      setShowDecisionToast(true);
      
      // 如果用户拒绝（点击叉号），中断正在进行的请求
      if (!previewDecision.accepted && abortControllerRef.current) {
        console.log('[TextActionProvider] 用户拒绝，中断请求');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
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
            flexDirection: 'column',
            gap: '8px',
            fontSize: '14px',
            maxWidth: '400px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #3b82f6',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                flexShrink: 0
              }}
            />
            <span>
              正在{lastRequest.action === 'expand' ? '扩写' : 
                    lastRequest.action === 'condense' ? '缩写' : 
                    lastRequest.action === 'translate' ? '翻译' : 
                    lastRequest.action === 'custom' ? '处理' : '润色'}...
            </span>
          </div>
          {/* 思考过程预览 - 从底部向上滚动效果 */}
          {streamingThinking && (
            <div
              style={{
                fontSize: '11px',
                color: '#a78bfa',
                maxHeight: '80px',
                borderTop: '1px solid rgba(167, 139, 250, 0.2)',
                paddingTop: '8px',
                marginTop: '4px',
                fontStyle: 'italic',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <span style={{ color: '#c4b5fd', fontWeight: 500, marginBottom: '4px' }}>思考中：</span>
              {/* 滚动容器 - 内容从底部向上填充 */}
              <div
                ref={thinkingScrollRef}
                className="thinking-scroll-container"
                style={{
                  flex: 1,
                  maxHeight: '60px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  // 隐藏滚动条但保持功能 (Firefox + IE)
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              >
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: '1.4'
                  }}
                >
                  {streamingThinking}
                </div>
              </div>
            </div>
          )}
          {/* 流式文本预览 */}
          {streamingText && (
            <div
              style={{
                fontSize: '12px',
                color: '#9ca3af',
                maxHeight: '100px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '8px',
                marginTop: '4px'
              }}
            >
              {streamingText}
            </div>
          )}
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
        /* 隐藏 webkit 滚动条 */
        .thinking-scroll-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
};

export default TextActionProvider;

