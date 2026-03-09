/**
 * 文本操作 Hook
 * 
 * 提供 React 组件中使用文本操作服务的便捷方式
 * 
 * 使用示例：
 * ```tsx
 * function MyComponent() {
 *   const { registerHandler, lastRequest, lastResult, isProcessing, previewDecision } = useTextAction();
 * 
 *   // 注册操作处理器
 *   useEffect(() => {
 *     const disposable = registerHandler('expand', async (action, text, from, to) => {
 *       // 调用 AI 进行扩写
 *       return await expandWithAI(text);
 *     });
 *     return () => disposable.dispose();
 *   }, [registerHandler]);
 * 
 *   // 监听预览决策
 *   useEffect(() => {
 *     if (previewDecision) {
 *       console.log('用户决策:', previewDecision.accepted ? '接受' : '拒绝');
 *     }
 *   }, [previewDecision]);
 * 
 *   return (
 *     <div>
 *       {isProcessing && <span>处理中...</span>}
 *       {lastResult && <span>操作完成: {lastResult.action}</span>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import { textActionService, TextActionHandler, PreviewDecisionEvent } from '../../services/editor/TextActionService';
import type { TextActionRequest, TextActionResult, TextActionType, TextActionPreview } from '../../services/editor/bridge';
import { Disposable } from '../../base/common/disposable';

interface UseTextActionReturn {
  /** 注册操作处理器 */
  registerHandler: (action: TextActionType, handler: TextActionHandler) => Disposable;
  /** 最近一次操作请求 */
  lastRequest: TextActionRequest | null;
  /** 最近一次操作结果 */
  lastResult: TextActionResult | null;
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 当前预览信息 */
  currentPreview: TextActionPreview | null;
  /** 最近一次预览决策 */
  previewDecision: PreviewDecisionEvent | null;
  /** 手动触发操作 */
  triggerAction: (action: TextActionType, text: string, from: number, to: number) => Promise<TextActionResult>;
}

export function useTextAction(): UseTextActionReturn {
  const [lastRequest, setLastRequest] = useState<TextActionRequest | null>(null);
  const [lastResult, setLastResult] = useState<TextActionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<TextActionPreview | null>(null);
  const [previewDecision, setPreviewDecision] = useState<PreviewDecisionEvent | null>(null);

  // 监听操作请求
  useEffect(() => {
    const disposable = textActionService.onActionRequest((request) => {
      setLastRequest(request);
      setIsProcessing(true);
      setPreviewDecision(null); // 重置预览决策
    });
    return () => disposable.dispose();
  }, []);

  // 监听预览显示
  useEffect(() => {
    const disposable = textActionService.onPreviewShow((preview) => {
      setCurrentPreview(preview);
      setIsProcessing(false); // AI 处理完成，等待用户决策
    });
    return () => disposable.dispose();
  }, []);

  // 监听预览决策
  useEffect(() => {
    const disposable = textActionService.onPreviewDecision((decision) => {
      setPreviewDecision(decision);
      setCurrentPreview(null); // 清除预览
    });
    return () => disposable.dispose();
  }, []);

  // 监听操作完成
  useEffect(() => {
    const disposable = textActionService.onActionComplete((result) => {
      setLastResult(result);
      setIsProcessing(false);
    });
    return () => disposable.dispose();
  }, []);

  // 监听操作错误
  useEffect(() => {
    const disposable = textActionService.onActionError(() => {
      setIsProcessing(false);
      setCurrentPreview(null);
    });
    return () => disposable.dispose();
  }, []);

  const registerHandler = useCallback(
    (action: TextActionType, handler: TextActionHandler) => {
      return textActionService.registerHandler(action, handler);
    },
    []
  );

  const triggerAction = useCallback(
    (action: TextActionType, text: string, from: number, to: number) => {
      return textActionService.triggerAction(action, text, from, to);
    },
    []
  );

  return {
    registerHandler,
    lastRequest,
    lastResult,
    isProcessing,
    currentPreview,
    previewDecision,
    triggerAction
  };
}

