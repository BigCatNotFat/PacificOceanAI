/**
 * useLiterature Hook
 * 提供文献管理服务的 React 接口
 */

import { useState, useEffect, useCallback } from 'react';
import { useService } from './useService';
import { ILiteratureServiceId } from '../../platform/literature/ILiteratureService';
import type { ILiteratureService, BibReference, LiteratureTag } from '../../platform/literature/ILiteratureService';

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
  /** 手动添加文献 */
  addManualReference: (bibtex: string, isEnriched?: boolean) => BibReference[];
  /** 标记文献为待删除 */
  markForDeletion: (id: string) => void;
  /** 取消文献的待删除标记 */
  unmarkForDeletion: (id: string) => void;
  /** 确认删除所有标记为待删除的文献 */
  confirmDeletions: () => void;
  /** 使用补全后的 BibTeX 更新文献 */
  enrichReference: (id: string, enrichedBibtex: string) => boolean;
  /** 清除所有文献的待应用状态 */
  clearPendingStatus: () => void;
  /** 更新文献的原始 BibTeX 内容 */
  updateReferenceRawBibtex: (id: string, rawBibtex: string) => boolean;
  /** 检查并去除文献库中的重复文献 */
  deduplicateReferences: () => number;
  /** 为文献添加标签 */
  addTag: (id: string, tag: LiteratureTag) => boolean;
  /** 从文献移除标签 */
  removeTag: (id: string, tagName: string) => boolean;
  /** 获取所有已使用的标签 */
  getAllTags: () => LiteratureTag[];
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
      return false;
    }
  }, [literatureService, references]);
  
  // 手动添加文献
  const addManualReference = useCallback((bibtex: string, isEnriched?: boolean): BibReference[] => {
    if (!literatureService) return [];
    return literatureService.addManualReference(bibtex, isEnriched);
  }, [literatureService]);
  
  // 标记文献为待删除
  const markForDeletion = useCallback((id: string) => {
    literatureService?.markForDeletion(id);
  }, [literatureService]);
  
  // 取消文献的待删除标记
  const unmarkForDeletion = useCallback((id: string) => {
    literatureService?.unmarkForDeletion(id);
  }, [literatureService]);
  
  // 确认删除所有标记为待删除的文献
  const confirmDeletions = useCallback(() => {
    literatureService?.confirmDeletions();
  }, [literatureService]);
  
  // 使用补全后的 BibTeX 更新文献
  const enrichReference = useCallback((id: string, enrichedBibtex: string): boolean => {
    if (!literatureService) return false;
    return literatureService.enrichReference(id, enrichedBibtex);
  }, [literatureService]);
  
  // 清除所有文献的待应用状态
  const clearPendingStatus = useCallback(() => {
    literatureService?.clearPendingStatus();
  }, [literatureService]);
  
  // 更新文献的原始 BibTeX 内容
  const updateReferenceRawBibtex = useCallback((id: string, rawBibtex: string): boolean => {
    if (!literatureService) return false;
    return literatureService.updateReferenceRawBibtex(id, rawBibtex);
  }, [literatureService]);
  
  // 检查并去除文献库中的重复文献
  const deduplicateReferences = useCallback((): number => {
    if (!literatureService) return 0;
    return literatureService.deduplicateReferences();
  }, [literatureService]);
  
  // 为文献添加标签
  const addTag = useCallback((id: string, tag: LiteratureTag): boolean => {
    if (!literatureService) return false;
    return literatureService.addTag(id, tag);
  }, [literatureService]);
  
  // 从文献移除标签
  const removeTag = useCallback((id: string, tagName: string): boolean => {
    if (!literatureService) return false;
    return literatureService.removeTag(id, tagName);
  }, [literatureService]);
  
  // 获取所有已使用的标签
  const getAllTags = useCallback((): LiteratureTag[] => {
    if (!literatureService) return [];
    return literatureService.getAllTags();
  }, [literatureService]);
  
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
    applyAllCitations,
    addManualReference,
    markForDeletion,
    unmarkForDeletion,
    confirmDeletions,
    enrichReference,
    clearPendingStatus,
    updateReferenceRawBibtex,
    deduplicateReferences,
    addTag,
    removeTag,
    getAllTags
  };
}

