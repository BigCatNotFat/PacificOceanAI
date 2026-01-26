/**
 * useLiterature Hook
 * 提供文献管理服务的 React 接口
 */

import { useState, useEffect, useCallback } from 'react';
import { useService } from './useService';
import { ILiteratureServiceId } from '../../platform/literature/ILiteratureService';
import type { ILiteratureService, BibReference } from '../../platform/literature/ILiteratureService';

export interface UseLiteratureResult {
  /** 文献列表 */
  references: BibReference[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 扫描并解析文献 */
  scanReferences: () => Promise<void>;
  /** 删除文献 */
  deleteReference: (id: string) => void;
  /** 切换展开状态 */
  toggleExpand: (id: string) => void;
  /** 生成单个引用 */
  generateCitation: (id: string) => string;
  /** 批量生成引用 */
  generateCitations: (ids: string[]) => string;
  /** 清空所有文献 */
  clearReferences: () => void;
  /** 应用引用到编辑器 */
  applyCitation: (id: string) => Promise<boolean>;
  /** 应用所有引用到编辑器 */
  applyAllCitations: () => Promise<boolean>;
}

export function useLiterature(): UseLiteratureResult {
  const literatureService = useService<ILiteratureService>(ILiteratureServiceId);
  
  const [references, setReferences] = useState<BibReference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 订阅文献变更事件
  useEffect(() => {
    if (!literatureService) return;
    
    // 初始化状态
    setReferences(literatureService.getReferences());
    setIsLoading(literatureService.isLoading());
    
    // 订阅变更
    const refDisposable = literatureService.onDidReferencesChange((refs) => {
      setReferences(refs);
    });
    
    const loadingDisposable = literatureService.onDidLoadingChange((loading) => {
      setIsLoading(loading);
    });
    
    return () => {
      refDisposable.dispose();
      loadingDisposable.dispose();
    };
  }, [literatureService]);
  
  // 扫描并解析文献
  const scanReferences = useCallback(async () => {
    if (!literatureService) {
      setError('文献服务不可用');
      return;
    }
    
    setError(null);
    
    try {
      const result = await literatureService.scanAndParseReferences();
      
      if (result.errors.length > 0) {
        setError(result.errors.join('\n'));
      }
      
      console.log(`[useLiterature] 扫描完成: ${result.references.length} 篇文献, ${result.sourceFiles.length} 个文件`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描失败');
    }
  }, [literatureService]);
  
  // 删除文献
  const deleteReference = useCallback((id: string) => {
    literatureService?.deleteReference(id);
  }, [literatureService]);
  
  // 切换展开状态
  const toggleExpand = useCallback((id: string) => {
    literatureService?.toggleExpand(id);
  }, [literatureService]);
  
  // 生成单个引用
  const generateCitation = useCallback((id: string): string => {
    return literatureService?.generateCitation(id) || `\\cite{${id}}`;
  }, [literatureService]);
  
  // 批量生成引用
  const generateCitations = useCallback((ids: string[]): string => {
    return literatureService?.generateCitations(ids) || '';
  }, [literatureService]);
  
  // 清空所有文献
  const clearReferences = useCallback(() => {
    literatureService?.clearReferences();
  }, [literatureService]);
  
  // 应用引用到编辑器
  const applyCitation = useCallback(async (id: string): Promise<boolean> => {
    if (!literatureService) return false;
    
    const citation = literatureService.generateCitation(id);
    
    try {
      // 动态导入编辑器服务
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      return await overleafEditor.editor.insertText(citation);
    } catch (err) {
      console.error('[useLiterature] 插入引用失败:', err);
      return false;
    }
  }, [literatureService]);
  
  // 应用所有引用到编辑器
  const applyAllCitations = useCallback(async (): Promise<boolean> => {
    if (!literatureService) return false;
    
    const allIds = references.map(ref => ref.id);
    if (allIds.length === 0) return false;
    
    const citations = literatureService.generateCitations(allIds);
    
    try {
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      return await overleafEditor.editor.insertText(citations);
    } catch (err) {
      console.error('[useLiterature] 插入引用失败:', err);
      return false;
    }
  }, [literatureService, references]);
  
  return {
    references,
    isLoading,
    error,
    scanReferences,
    deleteReference,
    toggleExpand,
    generateCitation,
    generateCitations,
    clearReferences,
    applyCitation,
    applyAllCitations
  };
}

