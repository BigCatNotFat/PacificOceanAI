/**
 * LiteraturePanel - 文献管理面板
 * 显示和管理 BibTeX 文献引用
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLiterature } from '../hooks/useLiterature';
import type { BibReference } from '../../platform/literature/ILiteratureService';

interface LiteraturePanelProps {
  /** 关闭面板的回调 */
  onClose?: () => void;
}

/** 高亮的引用 ID 列表 */
type HighlightedRefs = Set<string>;

/**
 * 快捷按钮组件
 */
const ShortcutButton: React.FC<{
  icon: string;
  label: string;
  colorClass: string;
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, label, colorClass, onClick, disabled }) => (
  <button 
    className={`literature-shortcut-btn ${colorClass}`}
    onClick={onClick}
    disabled={disabled}
  >
    <span className="material-symbols">{icon}</span>
    <span className="literature-shortcut-label">{label}</span>
  </button>
);

/** 引用位置信息 */
interface CitePosition {
  line: number;
  column: number;
  pos: number;
  context: string;
}

/**
 * 文献条目组件
 */
const ReferenceItem: React.FC<{
  reference: BibReference;
  isHighlighted: boolean;
  isPinned: boolean;
  pinnedIndex: number;
  onToggleExpand: () => void;
  onDelete: () => void;
  onApplyCitation: () => void;
  onShowNotification: (msg: string) => void;
}> = ({ reference, isHighlighted, isPinned, pinnedIndex, onToggleExpand, onDelete, onApplyCitation, onShowNotification }) => {
  // 引用位置状态
  const [citePositions, setCitePositions] = useState<CitePosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // 展开时自动搜索引用次数
  useEffect(() => {
    if (reference.isExpanded && !hasSearched) {
      setHasSearched(true);
      setIsLocating(true);
      
      (async () => {
        try {
          const { overleafEditor } = await import('../../services/editor/OverleafEditor');
          const positions = await overleafEditor.getBridge().call<CitePosition[]>('findAllCitePositions', reference.id);
          if (positions && positions.length > 0) {
            setCitePositions(positions);
          }
        } catch (err) {
          console.error('Failed to search cite positions:', err);
        } finally {
          setIsLocating(false);
        }
      })();
    }
  }, [reference.isExpanded, reference.id, hasSearched]);
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };
  
  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApplyCitation();
  };
  
  // 处理定位按钮点击
  const handleLocate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (citePositions.length === 0) {
      onShowNotification('正文中未找到此引用');
      return;
    }
    
    // 计算下一个位置（首次点击从0开始，之后循环）
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % citePositions.length;
    setCurrentIndex(nextIndex);
    
    try {
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      await overleafEditor.getBridge().call('navigateToPosition', citePositions[nextIndex].pos);
      onShowNotification(`定位到引用 ${nextIndex + 1}/${citePositions.length}`);
    } catch (err) {
      console.error('Failed to navigate:', err);
      onShowNotification('定位失败');
    }
  };
  
  // 获取显示用的期刊/会议名称
  const getVenue = () => {
    return reference.journal || reference.booktitle || reference.publisher || '';
  };
  
  // 获取定位按钮的显示文本
  const getLocateButtonText = () => {
    if (isLocating) return '';
    if (citePositions.length === 0) return '';
    return `${currentIndex + 1}/${citePositions.length}`;
  };
  
  return (
    <div 
      className={`literature-item ${reference.isExpanded ? 'expanded' : ''} ${isHighlighted ? 'highlighted' : ''} ${isPinned ? 'pinned' : ''}`}
      onClick={onToggleExpand}
      data-ref-id={reference.id}
    >
      {/* 条目头部 */}
      <div className="literature-item-header">
        <div className="literature-item-title-area">
          <h3 className="literature-item-title">{reference.title}</h3>
        </div>
        
        {/* 作者信息（未展开时显示） */}
        {!reference.isExpanded && (
          <div className="literature-item-authors-preview">
            {reference.authors}
          </div>
        )}
        
        {/* 操作按钮 */}
        <div className="literature-item-actions">
          <button 
            className="literature-action-btn cite"
            onClick={handleApply}
            title="一键引用"
          >
            <span className="material-symbols">format_quote</span>
          </button>
          <button 
            className="literature-action-btn delete"
            onClick={handleDelete}
            title="删除"
          >
            <span className="material-symbols">delete</span>
          </button>
        </div>
      </div>
      
      {/* 展开详情 */}
      {reference.isExpanded && (
        <div className="literature-item-details">
          <div className="literature-detail-grid">
            <div className="literature-detail-row">
              <span className="literature-detail-label">作者:</span>
              <span className="literature-detail-value">{reference.authors}</span>
            </div>
            <div className="literature-detail-row">
              <span className="literature-detail-label">年份:</span>
              <span className="literature-detail-badge">{reference.year}</span>
            </div>
            {getVenue() && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">
                  {reference.journal ? '期刊:' : reference.booktitle ? '会议:' : '出版:'}
                </span>
                <span className="literature-detail-venue">{getVenue()}</span>
              </div>
            )}
            {reference.volume && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">卷号:</span>
                <span className="literature-detail-value">{reference.volume}</span>
              </div>
            )}
            {reference.pages && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">页码:</span>
                <span className="literature-detail-value">{reference.pages}</span>
              </div>
            )}
            {reference.doi && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">DOI:</span>
                <a 
                  href={`https://doi.org/${reference.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="literature-detail-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="material-symbols">link</span>
                  {reference.doi}
                </a>
              </div>
            )}
            {reference.sourceFile && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">来源:</span>
                <span className="literature-detail-source">{reference.sourceFile}</span>
              </div>
            )}
          </div>
          
          {reference.abstract && (
            <div className="literature-abstract">
              <span className="literature-abstract-label">摘要:</span>
              <p>{reference.abstract}</p>
            </div>
          )}
          
          <div className="literature-citation-key">
            <span className="material-symbols">key</span>
            <code>\\cite{'{' + reference.id + '}'}</code>
          </div>
          
          {/* 定位区域 */}
          <div className="literature-locate-section">
            <div className="literature-locate-info">
              <span className="material-symbols">format_quote</span>
              <span>
                {isLocating 
                  ? '正在搜索引用...' 
                  : citePositions.length > 0 
                    ? `正文中共引用 ${citePositions.length} 次`
                    : '正文中未引用'
                }
              </span>
            </div>
            <button 
              className={`literature-locate-btn ${citePositions.length > 0 ? 'has-positions' : ''}`}
              onClick={handleLocate}
              disabled={isLocating || citePositions.length === 0}
            >
              {isLocating ? (
                <span className="literature-locate-spinner"></span>
              ) : (
                <>
                  <span className="material-symbols">my_location</span>
                  <span>
                    {citePositions.length > 0 
                      ? currentIndex >= 0 
                        ? `定位 ${currentIndex + 1}/${citePositions.length}`
                        : '定位'
                      : '无引用'
                    }
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 文献管理面板主组件
 */
const LiteraturePanel: React.FC<LiteraturePanelProps> = ({ onClose }) => {
  const {
    references,
    isLoading,
    error,
    scanReferences,
    deleteReference,
    toggleExpand,
    applyCitation,
    applyAllCitations,
    clearReferences
  } = useLiterature();
  
  const [notification, setNotification] = useState<string | null>(null);
  const [highlightedRefs, setHighlightedRefs] = useState<HighlightedRefs>(new Set());
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]); // 置顶顺序（最近点击的在前）
  const listRef = useRef<HTMLDivElement>(null);
  
  // 注意：自动扫描已在 App.tsx 中处理，这里不需要重复扫描
  
  // 监听来自编辑器的引用导航请求
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.type !== 'OVERLEAF_CITE_NAVIGATE') return;
      
      const keys = data.keys as string[];
      if (!Array.isArray(keys) || keys.length === 0) return;
      
      // 高亮对应的引用
      setHighlightedRefs(new Set(keys));
      
      // 将点击的引用置顶（按点击顺序，最新的在最前面）
      setPinnedOrder(prev => {
        // 移除已存在的 keys，然后将新 keys 放到最前面
        const filtered = prev.filter(k => !keys.includes(k));
        return [...keys, ...filtered];
      });
      
      // 滚动到列表顶部
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = 0;
        }
      }, 50);
      
      // 3秒后自动取消高亮
      setTimeout(() => {
        setHighlightedRefs(new Set());
      }, 3000);
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  // 显示通知
  const showNotification = useCallback((message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 2000);
  }, []);
  
  // 处理删除
  const handleDelete = useCallback((id: string, title: string) => {
    deleteReference(id);
    showNotification('文献已删除');
  }, [deleteReference, showNotification]);
  
  // 处理引用
  const handleApplyCitation = useCallback(async (id: string, title: string) => {
    const success = await applyCitation(id);
    if (success) {
      showNotification(`已引用: ${title.slice(0, 30)}...`);
    } else {
      showNotification('引用失败，请确保光标在编辑器中');
    }
  }, [applyCitation, showNotification]);
  
  // 处理批量引用
  const handleApplyAll = useCallback(async () => {
    const success = await applyAllCitations();
    if (success) {
      showNotification(`已插入 ${references.length} 篇文献引用`);
    } else {
      showNotification('引用失败，请确保光标在编辑器中');
    }
  }, [applyAllCitations, references.length, showNotification]);
  
  // 根据置顶顺序排序的文献列表
  const sortedReferences = React.useMemo(() => {
    if (pinnedOrder.length === 0) return references;
    
    // 创建一个 Map 来存储置顶顺序的索引
    const orderMap = new Map(pinnedOrder.map((id, index) => [id, index]));
    
    // 排序：置顶的在前（按 pinnedOrder 顺序），其余按原顺序
    return [...references].sort((a, b) => {
      const aOrder = orderMap.get(a.id);
      const bOrder = orderMap.get(b.id);
      
      // 如果 a 在置顶列表中
      if (aOrder !== undefined) {
        // 如果 b 也在置顶列表中，按置顶顺序
        if (bOrder !== undefined) {
          return aOrder - bOrder;
        }
        // a 在置顶列表，b 不在，a 排前面
        return -1;
      }
      
      // a 不在置顶列表
      if (bOrder !== undefined) {
        // b 在置顶列表，b 排前面
        return 1;
      }
      
      // 都不在置顶列表，保持原顺序
      return 0;
    });
  }, [references, pinnedOrder]);
  
  return (
    <div className="literature-panel">
      {/* 头部 */}
      <div className="literature-header">
        <div className="literature-header-left">
          <span className="material-symbols literature-header-icon">menu_book</span>
          <span className="literature-header-title">文献库</span>
          <span className="literature-count">{references.length}</span>
        </div>
        {onClose && (
          <button className="literature-close-btn" onClick={onClose}>
            <span className="material-symbols">close</span>
          </button>
        )}
      </div>
      
      {/* 文献列表区域 */}
      <div className="literature-list" ref={listRef}>
        {isLoading ? (
          <div className="literature-loading">
            <div className="literature-spinner"></div>
            <p>正在扫描项目文献...</p>
          </div>
        ) : error ? (
          <div className="literature-error">
            <span className="material-symbols">error</span>
            <p>{error}</p>
            <button onClick={scanReferences}>重试</button>
          </div>
        ) : references.length === 0 ? (
          <div className="literature-empty">
            <span className="material-symbols">menu_book</span>
            <p>暂无文献数据</p>
            <p className="literature-empty-hint">点击"同步文献"扫描项目中的 .bib 文件</p>
          </div>
        ) : (
          sortedReferences.map((ref, index) => (
            <ReferenceItem
              key={ref.id}
              reference={ref}
              isHighlighted={highlightedRefs.has(ref.id)}
              isPinned={pinnedOrder.includes(ref.id)}
              pinnedIndex={pinnedOrder.indexOf(ref.id)}
              onToggleExpand={() => toggleExpand(ref.id)}
              onDelete={() => handleDelete(ref.id, ref.title)}
              onApplyCitation={() => handleApplyCitation(ref.id, ref.title)}
              onShowNotification={showNotification}
            />
          ))
        )}
      </div>
      
      {/* 底部操作区 */}
      <div className="literature-footer">
        <div className="literature-shortcut-grid">
          <ShortcutButton 
            icon="add" 
            label="新增文献" 
            colorClass="blue"
            onClick={() => showNotification('该功能开发中...')}
          />
          <ShortcutButton 
            icon="sync" 
            label="同步文献" 
            colorClass="gray"
            onClick={scanReferences}
            disabled={isLoading}
          />
          <ShortcutButton 
            icon="sort" 
            label="排列方式" 
            colorClass="gray"
            onClick={() => showNotification('该功能开发中...')}
          />
          <ShortcutButton 
            icon="filter_alt" 
            label="文献筛选" 
            colorClass="indigo"
            onClick={() => showNotification('该功能开发中...')}
          />
          <ShortcutButton 
            icon="bar_chart" 
            label="文献统计" 
            colorClass="purple"
            onClick={() => showNotification(`共 ${references.length} 篇文献`)}
          />
          <ShortcutButton 
            icon="delete_sweep" 
            label="清空文献" 
            colorClass="red"
            onClick={() => {
              if (references.length > 0) {
                clearReferences();
                showNotification('已清空所有文献');
              }
            }}
          />
        </div>
        
        <button 
          className="literature-apply-all-btn"
          onClick={handleApplyAll}
          disabled={references.length === 0 || isLoading}
        >
          <span className="material-symbols">format_quote</span>
          <span>一键引用所有文献</span>
        </button>
      </div>
      
      {/* 通知 Toast */}
      {notification && (
        <div className="literature-toast">
          <div className="literature-toast-indicator"></div>
          <span>{notification}</span>
        </div>
      )}
    </div>
  );
};

export default LiteraturePanel;

