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

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  
  // 获取服务
  const textActionAIService = useService<ITextActionAIService>(ITextActionAIServiceId);
  const configService = useService<IConfigurationService>(IConfigurationServiceId);
  
  // 使用 ref 保存服务实例，避免在 useEffect 中引起重新注册
  const serviceRef = useRef(textActionAIService);
  serviceRef.current = textActionAIService;

  // 用于中断请求的 AbortController Map（支持多任务并行）
  // key 是 previewId，value 是对应的 AbortController
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // ============ 激活状态同步到注入脚本 ============

  const hasActivatedModel = useCallback(async (): Promise<boolean> => {
    const config = await configService.getAPIConfig();
    return !!(config?.models?.some(m => {
      if (!m.enabled) return false;
      if (m.provider === 'codex-oauth') return true;
      if (m.provider === 'builtin') return !!m.apiKey && !!m.actualModelId;
      return !!m.apiKey;
    }));
  }, [configService]);
  
  // 发送激活状态到注入脚本（开源版：检查是否有任一供应商配置了 API Key）
  const sendActivationStatus = useCallback(async () => {
    const isActivated = await hasActivatedModel();
    
    window.postMessage({
      type: 'OVERLEAF_ACTIVATION_STATUS_UPDATE',
      data: { isActivated }
    }, '*');
  }, [hasActivatedModel]);

  // 初始化时和配置变化时同步激活状态
  useEffect(() => {
    sendActivationStatus();
    
    const handleActivationStatusRequest = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_REQUEST_ACTIVATION_STATUS') {
        sendActivationStatus();
      }
    };
    
    // 监听打开设置页面请求（来自注入脚本）
    const handleOpenSettings = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_OPEN_SETTINGS') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage();
          }
        } catch { /* ignore */ }
      }
    };

    window.addEventListener('message', handleActivationStatusRequest);
    window.addEventListener('message', handleOpenSettings);
    
    return () => {
      window.removeEventListener('message', handleActivationStatusRequest);
      window.removeEventListener('message', handleOpenSettings);
    };
  }, [sendActivationStatus]);

  // 配置变更时主动同步激活状态，避免注入脚本长期缓存旧状态
  useEffect(() => {
    const disposable = configService.onDidChangeConfiguration(() => {
      sendActivationStatus();
    });
    return () => disposable.dispose();
  }, [configService, sendActivationStatus]);
  
  // 创建 AI 调用处理器
  const createAIHandler = useCallback((action: TextActionType) => {
    return async (_action: TextActionType, text: string, from: number, to: number, modelId?: string, customPrompt?: string, context?: { before?: string; after?: string }): Promise<string | null> => {
      if (!(await hasActivatedModel())) {
        return null;
      }

      // 生成唯一的预览 ID（用于多任务并行）
      const previewId = `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      
      // 创建新的 AbortController（不再取消旧请求，支持多任务并行）
      const currentController = new AbortController();
      abortControllersRef.current.set(previewId, currentController);
      
      // 1. 立即发送开始流式预览消息，弹出预览窗口（包含 previewId）
      window.postMessage({
        type: 'OVERLEAF_STREAM_PREVIEW_START',
        data: {
          previewId,
          action,
          originalText: text,
          from,
          to
        }
      }, '*');
      
      // 2. 流式输出回调 - 发送增量更新到预览窗口（包含 previewId）
      const onStream = (delta: string) => {
        // 发送增量更新到预览窗口
        window.postMessage({
          type: 'OVERLEAF_STREAM_PREVIEW_UPDATE',
          data: { previewId, delta }
        }, '*');
      };

      // 3. 思考过程流式输出回调（包含 previewId）
      const onThinkingStream = (delta: string) => {
        // 发送思考过程增量更新到预览窗口
        window.postMessage({
          type: 'OVERLEAF_STREAM_THINKING_UPDATE',
          data: { previewId, delta }
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
          abortSignal: currentController.signal
        });
        
        // 清理 AbortController
        abortControllersRef.current.delete(previewId);

        // 检查是否是取消操作
        if (result.error === '操作已取消') {
          // 发送取消消息到预览窗口
          window.postMessage({
            type: 'OVERLEAF_STREAM_PREVIEW_CANCELLED',
            data: { previewId }
          }, '*');
          return null;
        }

        if (result.success && result.resultText) {
          // 发送流式预览完成消息（包含 previewId）
          window.postMessage({
            type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
            data: { previewId, newText: result.resultText }
          }, '*');
          
          return result.resultText;
        } else {
          // 发送完成消息（即使失败也要关闭加载状态，包含 previewId）
          window.postMessage({
            type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
            data: { previewId, newText: result.error || '生成失败' }
          }, '*');
          return null;
        }
      } catch (error) {
        // 清理 AbortController
        abortControllersRef.current.delete(previewId);
        
        // 发送完成消息（包含 previewId）
        window.postMessage({
          type: 'OVERLEAF_STREAM_PREVIEW_COMPLETE',
          data: { previewId, newText: '发生错误: ' + String(error) }
        }, '*');
        return null;
      }
    };
  }, [hasActivatedModel]);
  
  // 注册 AI 处理器
  useEffect(() => {
    const actions: TextActionType[] = ['polish', 'expand', 'condense', 'translate', 'custom'];
    const disposables = actions.map(action => {
      return registerHandler(action, createAIHandler(action));
    });
    
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [registerHandler, createAIHandler]);
  
  // 监听取消消息（支持按 previewId 取消特定请求）
  useEffect(() => {
    const handleCancelMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'OVERLEAF_STREAM_CANCEL') {
        const previewId = event.data?.data?.previewId;
        
        if (previewId) {
          // 取消特定的请求
          const controller = abortControllersRef.current.get(previewId);
          if (controller) {
            controller.abort();
            abortControllersRef.current.delete(previewId);
          }
        } else {
          // 兼容旧版：没有 previewId 时取消所有请求
          abortControllersRef.current.forEach((controller) => {
            controller.abort();
          });
          abortControllersRef.current.clear();
        }
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
      
      // 统计埋点：已移至 DiffSuggestionService.handleTextActionDecision
      // 通过 OVERLEAF_TEXT_ACTION_DECISION 消息统一处理
      
      // 注意：多任务并行模式下，用户拒绝一个预览不应影响其他预览
      // 如果需要取消特定预览，应该通过 previewId 发送 OVERLEAF_STREAM_CANCEL 消息
      
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
      } else {
      }
    }
  }, [lastResult]);
  
  return (
    <>
      {children}
      
      {/* 操作进行中提示 - 已移至内联状态系统，此处不再显示 */}
      
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

