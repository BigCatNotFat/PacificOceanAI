/**
 * LiteraturePanel - 文献管理面板
 * 显示和管理 BibTeX 文献引用
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLiterature } from '../hooks/useLiterature';
import type { BibReference, LiteratureTag } from '../../platform/literature/ILiteratureService';
import { TAG_COLORS } from '../../platform/literature/ILiteratureService';
import { CrossRefService } from '../../services/literature/CrossRefService';
import { normalizeForComparison, isSameReference } from '../../services/literature/LiteratureStorageService';

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

/** 补全状态 */
type EnrichStatus = 'idle' | 'loading' | 'success' | 'error';

/** 排序方式 */
type SortMode = 
  | 'default'        // 默认（原始顺序 + 置顶）
  | 'title-asc'      // 标题 A-Z
  | 'title-desc'     // 标题 Z-A
  | 'year-desc'      // 年份（最新优先）
  | 'year-asc'       // 年份（最旧优先）
  | 'author-asc'     // 作者 A-Z
  | 'citations-desc' // 引用次数（多到少）
  | 'type';          // 按类型分组

/** 排序选项配置 */
const SORT_OPTIONS: { value: SortMode; label: string; icon: string }[] = [
  { value: 'default', label: '默认顺序', icon: 'format_list_numbered' },
  { value: 'title-asc', label: '标题 A → Z', icon: 'sort_by_alpha' },
  { value: 'title-desc', label: '标题 Z → A', icon: 'sort_by_alpha' },
  { value: 'year-desc', label: '年份（最新优先）', icon: 'event' },
  { value: 'year-asc', label: '年份（最旧优先）', icon: 'event' },
  { value: 'author-asc', label: '作者 A → Z', icon: 'person' },
  { value: 'citations-desc', label: '引用次数', icon: 'format_quote' },
  { value: 'type', label: '按类型分组', icon: 'category' },
];

/** 筛选条件 */
interface FilterCriteria {
  types: Set<string>;       // 文献类型筛选
  yearFrom?: number;        // 起始年份
  yearTo?: number;          // 结束年份
  hasEnriched?: boolean;    // 是否已补全
  hasPending?: boolean;     // 是否待应用
  searchText?: string;      // 搜索文本（标题/作者）
  tags: Set<string>;        // 标签筛选
}

/** 文献类型中英文映射 */
const TYPE_LABELS: Record<string, string> = {
  article: '期刊论文',
  book: '书籍',
  inproceedings: '会议论文',
  conference: '会议论文',
  misc: '其他',
  techreport: '技术报告',
  phdthesis: '博士论文',
  mastersthesis: '硕士论文',
  incollection: '书章节',
  booklet: '小册子',
  manual: '手册',
  unpublished: '未发表',
};

/** Diff 行类型 */
type DiffLineType = 'unchanged' | 'added' | 'removed';

interface DiffLine {
  type: DiffLineType;
  content: string;
}

/**
 * 提取 BibTeX 字段的值（标准化后）
 */
function extractFieldValue(line: string): string | null {
  // 匹配 field = {value} 或 field={value} 或 field = "value"
  // 处理各种结尾情况：}, }}, ,} 等
  const match = line.match(/^\s*\w+\s*=\s*[{"]?(.+)/);
  if (match) {
    let value = match[1];
    // 移除尾部的 }, ", ,, } 等
    value = value.replace(/[}"',\s]+$/g, '');
    // 移除开头可能残留的 { 或 "
    value = value.replace(/^[{"]+/, '');
    // 标准化：移除多余空格，统一连字符，转小写
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/--/g, '-')
      .toLowerCase();
  }
  return null;
}

/**
 * 提取 BibTeX 字段名
 */
function getFieldName(line: string): string | null {
  const match = line.match(/^\s*(\w+)\s*=/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * 简单的行级 Diff 算法
 * 对比两个 BibTeX 字符串，返回差异行
 * 智能比较：忽略格式差异（空格、等号格式等）
 */
function computeDiff(original: string, enriched: string): DiffLine[] {
  const originalLines = original.split('\n');
  const enrichedLines = enriched.split('\n');
  const result: DiffLine[] = [];
  
  // 创建原始字段映射：字段名 -> { 原始行, 标准化值 }
  const originalFields = new Map<string, { line: string; value: string | null }>();
  for (const line of originalLines) {
    const fieldName = getFieldName(line);
    if (fieldName) {
      originalFields.set(fieldName, {
        line: line.trim(),
        value: extractFieldValue(line)
      });
    }
  }
  
  // 遍历补全后的行
  for (const line of enrichedLines) {
    const fieldName = getFieldName(line);
    
    if (fieldName) {
      const originalData = originalFields.get(fieldName);
      const enrichedValue = extractFieldValue(line);
      
      if (originalData) {
        // 字段存在于原始内容中，比较标准化后的值
        if (originalData.value === enrichedValue) {
          // 值相同（忽略格式差异），显示为不变
          result.push({ type: 'unchanged', content: line });
        } else if (!enrichedValue || enrichedValue === '') {
          // 补全后值为空，显示原始值为不变
          result.push({ type: 'unchanged', content: line });
        } else {
          // 值确实不同，显示修改
          result.push({ type: 'removed', content: '  ' + originalData.line });
          result.push({ type: 'added', content: line });
        }
        originalFields.delete(fieldName);
      } else {
        // 新增的字段
        // 如果值为空，不高亮
        if (!enrichedValue || enrichedValue === '') {
          result.push({ type: 'unchanged', content: line });
        } else {
          result.push({ type: 'added', content: line });
        }
      }
    } else {
      // 非字段行（如 @article{key, 或 }）
      result.push({ type: 'unchanged', content: line });
    }
  }
  
  return result;
}

/**
 * Diff 预览组件
 */
const DiffPreview: React.FC<{
  original: string;
  enriched: string;
}> = ({ original, enriched }) => {
  const diffLines = computeDiff(original, enriched);
  
  return (
    <pre className="literature-modal-preview literature-modal-diff">
      {diffLines.map((line, index) => (
        <div 
          key={index} 
          className={`diff-line diff-${line.type}`}
        >
          {line.content || ' '}
        </div>
      ))}
    </pre>
  );
};

/**
 * 新增文献弹窗组件
 * 支持 CrossRef API 自动补全
 */
const AddReferenceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (bibtex: string, isEnriched?: boolean) => void;
  existingReferences: BibReference[]; // 现有文献列表，用于检查重复
}> = ({ isOpen, onClose, onAdd, existingReferences }) => {
  const [bibtexInput, setBibtexInput] = useState('');
  const [enrichedBibtex, setEnrichedBibtex] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus>('idle');
  const [enableEnrich, setEnableEnrich] = useState(true); // 默认开启补全
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 重置状态
  const resetState = useCallback(() => {
    setBibtexInput('');
    setEnrichedBibtex(null);
    setEnrichStatus('idle');
    setError(null);
  }, []);
  
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);
  
  // 从 BibTeX 文本中提取标题和作者（简单解析）
  const extractTitleAndAuthor = (bibtex: string): { title?: string; authors?: string; id?: string } => {
    const titleMatch = bibtex.match(/title\s*=\s*[{"]([^}"]+)[}"]/i);
    const authorMatch = bibtex.match(/author\s*=\s*[{"]([^}"]+)[}"]/i);
    const idMatch = bibtex.match(/@\w+\s*\{\s*([^,\s]+)/i);
    return {
      title: titleMatch?.[1],
      authors: authorMatch?.[1],
      id: idMatch?.[1]
    };
  };
  
  // 检查是否与现有文献重复
  const checkDuplicate = (bibtex: string): BibReference | null => {
    const { title, authors, id } = extractTitleAndAuthor(bibtex);
    
    if (!title && !id) return null;
    
    // 构造一个临时对象用于比较
    const tempRef = { 
      title: title || '', 
      authors: authors || '', 
      id: id || '',
      type: 'article' as const // 类型不影响比较，只需要满足类型要求
    };
    
    for (const ref of existingReferences) {
      if (isSameReference(ref, tempRef)) {
        return ref;
      }
    }
    
    return null;
  };
  
  // 处理添加按钮点击
  const handleAdd = async () => {
    if (!bibtexInput.trim()) {
      setError('请输入 BibTeX 文本');
      return;
    }
    
    if (!bibtexInput.includes('@')) {
      setError('无效的 BibTeX 格式，请确保包含 @article、@book 等条目');
      return;
    }
    
    // 检查是否与现有文献重复
    const duplicateRef = checkDuplicate(bibtexInput);
    if (duplicateRef) {
      setError(`文献库中已存在相同文献：${duplicateRef.title || duplicateRef.id}`);
      return;
    }
    
    // 如果已有补全结果，直接添加
    if (enrichedBibtex) {
      onAdd(enrichedBibtex, true); // 第二个参数表示已补全
      resetState();
      onClose();
      return;
    }
    
    // 如果开启了补全，先查询 CrossRef
    if (enableEnrich) {
      setEnrichStatus('loading');
      setError(null);
      
      try {
        const result = await CrossRefService.enrichFromBibtex(bibtexInput);
        
        if (result.success && result.bibtex) {
          setEnrichedBibtex(result.bibtex);
          setEnrichStatus('success');
          // 不自动关闭，让用户确认
        } else {
          setEnrichStatus('error');
          setError(result.error || '未找到匹配结果，可取消勾选"智能补全"直接添加');
        }
      } catch (err) {
        setEnrichStatus('error');
        setError(err instanceof Error ? err.message : '查询失败');
      }
    } else {
      // 不补全，直接添加
      onAdd(bibtexInput);
      resetState();
      onClose();
    }
  };
  
  // 确认添加补全后的结果
  const handleConfirmAdd = () => {
    if (enrichedBibtex) {
      onAdd(enrichedBibtex, true); // 第二个参数表示已补全
      resetState();
      onClose();
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      if (enrichedBibtex) {
        handleConfirmAdd();
      } else {
        handleAdd();
      }
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="literature-modal-overlay" onClick={onClose}>
      <div className="literature-modal" onClick={e => e.stopPropagation()}>
        <div className="literature-modal-header">
          <span className="material-symbols">add_circle</span>
          <h3>新增文献</h3>
          <button className="literature-modal-close" onClick={onClose}>
            <span className="material-symbols">close</span>
          </button>
        </div>
        
        <div className="literature-modal-body">
          {/* 补全结果预览 */}
          {enrichedBibtex ? (
            <div className="literature-modal-preview-section">
              <div className="literature-modal-preview-header">
                <label className="literature-modal-label">
                  <span className="material-symbols">compare_arrows</span>
                  补全对比
                </label>
                <div className="literature-modal-diff-legend">
                  <span className="diff-legend-item added">新增</span>
                  <span className="diff-legend-item removed">修改前</span>
                </div>
                <button 
                  className="literature-modal-use-original"
                  onClick={() => {
                    setEnrichedBibtex(null);
                    setEnrichStatus('idle');
                  }}
                >
                  重新编辑
                </button>
              </div>
              <DiffPreview original={bibtexInput} enriched={enrichedBibtex} />
            </div>
          ) : (
            <>
              <p className="literature-modal-hint">
                粘贴 BibTeX 格式的文献信息（只需标题即可）
              </p>
              <textarea
                ref={textareaRef}
                className="literature-modal-textarea"
                placeholder={`@article{example,
  title = {论文标题}
}`}
                value={bibtexInput}
                onChange={e => {
                  setBibtexInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                disabled={enrichStatus === 'loading'}
              />
            </>
          )}
          
          {/* 错误提示 */}
          {error && (
            <div className="literature-modal-error">
              <span className="material-symbols">error</span>
              {error}
            </div>
          )}
        </div>
        
        <div className="literature-modal-footer">
          <label className="literature-modal-checkbox">
            <input
              type="checkbox"
              checked={enableEnrich}
              onChange={e => setEnableEnrich(e.target.checked)}
              disabled={enrichStatus === 'loading' || !!enrichedBibtex}
            />
            <span>智能补全</span>
          </label>
          <div className="literature-modal-actions">
            <button className="literature-modal-btn cancel" onClick={onClose}>
              取消
            </button>
            {enrichedBibtex ? (
              <button className="literature-modal-btn confirm" onClick={handleConfirmAdd}>
                <span className="material-symbols">check</span>
                确认添加
              </button>
            ) : (
              <button 
                className="literature-modal-btn confirm" 
                onClick={handleAdd}
                disabled={enrichStatus === 'loading'}
              >
                {enrichStatus === 'loading' ? (
                  <>
                    <span className="literature-modal-spinner"></span>
                    <span>查询中...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols">add</span>
                    <span>添加文献</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 文献条目组件
 */
const ReferenceItem: React.FC<{
  reference: BibReference;
  isHighlighted: boolean;
  isPinned: boolean;
  pinnedIndex: number;
  onToggleExpand: () => void;
  onMarkForDeletion: () => void;
  onUnmarkForDeletion: () => void;
  onShowNotification: (msg: string) => void;
  onEnrichReference: (id: string, bibtex: string) => boolean;
  onUpdateRawBibtex: (id: string, rawBibtex: string) => boolean;
  onAddTag: (id: string, tag: LiteratureTag) => boolean;
  onRemoveTag: (id: string, tagName: string) => boolean;
  allTags: LiteratureTag[];
}> = ({ reference, isHighlighted, isPinned, pinnedIndex, onToggleExpand, onMarkForDeletion, onUnmarkForDeletion, onShowNotification, onEnrichReference, onUpdateRawBibtex, onAddTag, onRemoveTag, allTags }) => {
  // 引用位置状态
  const [citePositions, setCitePositions] = useState<CitePosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [isCheckingCitations, setIsCheckingCitations] = useState(false);
  // 是否显示补全对比
  const [showEnrichDiff, setShowEnrichDiff] = useState(false);
  // 单条补全状态
  const [isEnriching, setIsEnriching] = useState(false);
  // 编辑弹窗状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editBibtex, setEditBibtex] = useState('');
  // 标签管理状态
  const [isTagPopupOpen, setIsTagPopupOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedTagColor, setSelectedTagColor] = useState<string>(TAG_COLORS[0]);
  const tagPopupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState<'above' | 'below'>('above');
  
  // 点击外部关闭标签弹窗
  useEffect(() => {
    if (!isTagPopupOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (tagPopupRef.current && !tagPopupRef.current.contains(event.target as Node)) {
        setIsTagPopupOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTagPopupOpen]);
  
  // 搜索引用次数的函数
  const searchCitePositions = useCallback(async () => {
    setIsLocating(true);
    try {
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      const positions = await overleafEditor.getBridge().call<CitePosition[]>('findAllCitePositions', reference.id);
      setCitePositions(positions || []);
      // 重置当前定位索引
      setCurrentIndex(-1);
    } catch (err) {
      setCitePositions([]);
    } finally {
      setIsLocating(false);
    }
  }, [reference.id]);
  
  // 组件挂载时自动搜索引用次数，展开时刷新
  useEffect(() => {
    // 首次挂载时搜索引用次数
    searchCitePositions();
  }, []);
  
  // 展开时刷新引用次数
  useEffect(() => {
    if (reference.isExpanded) {
      searchCitePositions();
    }
  }, [reference.isExpanded, searchCitePositions]);
  
  // 处理删除/恢复按钮点击
  const handleDeleteOrRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 如果已经标记为删除，则恢复
    if (reference.isMarkedForDeletion) {
      onUnmarkForDeletion();
      onShowNotification('文献已恢复');
      return;
    }
    
    // 检查是否有引用
    setIsCheckingCitations(true);
    try {
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      const positions = await overleafEditor.getBridge().call<CitePosition[]>('findAllCitePositions', reference.id);
      
      if (positions && positions.length > 0) {
        // 有引用，提示先删除引用
        onShowNotification(`该文献在正文中被引用了 ${positions.length} 次，请先删除引用`);
        setCitePositions(positions);
      } else {
        // 无引用，标记为待删除
        onMarkForDeletion();
        onShowNotification('文献已标记删除，应用文献库后生效');
      }
    } catch (err) {
      onShowNotification('检查引用失败');
    } finally {
      setIsCheckingCitations(false);
    }
  };
  
  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const citeCode = `\\cite{${reference.id}}`;
    try {
      await navigator.clipboard.writeText(citeCode);
      onShowNotification(`已复制: ${citeCode}`);
    } catch (err) {
      onShowNotification('复制失败');
    }
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
      onShowNotification('定位失败');
    }
  };
  
  // 单条补全处理
  const handleEnrichSingle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!reference.rawBibtex) {
      onShowNotification('无法补全：缺少 BibTeX 数据');
      return;
    }
    
    // 如果已经补全过，弹出确认提示
    if (reference.isEnriched) {
      const confirmed = window.confirm('该文献已补全过，是否重新补全？\n这将覆盖当前的补全结果。');
      if (!confirmed) {
        return;
      }
    }
    
    setIsEnriching(true);
    
    try {
      const result = await CrossRefService.enrichFromBibtex(reference.rawBibtex);
      
      if (result.success && result.bibtex) {
        const success = onEnrichReference(reference.id, result.bibtex);
        if (success) {
          onShowNotification(reference.isEnriched ? '重新补全成功' : '补全成功');
        } else {
          onShowNotification('补全失败：更新引用失败');
        }
      } else {
        onShowNotification(result.error || '补全失败：未找到匹配的文献');
      }
    } catch (err) {
      onShowNotification('补全失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsEnriching(false);
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
      className={`literature-item ${reference.isExpanded ? 'expanded' : ''} ${isHighlighted ? 'highlighted' : ''} ${isPinned ? 'pinned' : ''} ${reference.isManual ? 'manual' : ''} ${reference.isMarkedForDeletion ? 'marked-deletion' : ''}`}
      style={{ zIndex: isTagPopupOpen ? 100 : 'auto' }}
      onClick={onToggleExpand}
      data-ref-id={reference.id}
    >
      {/* 条目头部 */}
      <div className="literature-item-header">
        <div className="literature-item-title-area">
          {/* 已补全标志 */}
          {reference.isEnriched && (
            <span className="literature-enriched-badge" title="已通过 CrossRef 补全">
              <span className="material-symbols">check_circle</span>
              已补全
            </span>
          )}
          {/* 已编辑标志 - 永久显示 */}
          {reference.isEdited && (
            <span className="literature-edited-badge" title="已手动编辑">
              <span className="material-symbols">edit_note</span>
              已编辑
            </span>
          )}
          {/* 待应用标志 - 只有 isManual 为 true 时显示（应用后会清除） */}
          {reference.isManual && (
            <span className="literature-manual-badge" title="待应用到项目文件">
              <span className="material-symbols">schedule</span>
              待应用
            </span>
          )}
          {reference.isMarkedForDeletion && (
            <span className="literature-deletion-badge" title="已标记删除，应用文献库后生效">
              <span className="material-symbols">delete_forever</span>
              待删除
            </span>
          )}
          {/* 用户自定义标签 */}
          {reference.tags && reference.tags.length > 0 && (
            <div className="literature-user-tags">
              {reference.tags.map((tag, index) => (
                <span 
                  key={index}
                  className="literature-user-tag"
                  style={{ backgroundColor: tag.color }}
                  title={`点击移除标签: ${tag.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTag(reference.id, tag.name);
                  }}
                >
                  {tag.name}
                  <span className="literature-tag-remove">×</span>
                </span>
              ))}
            </div>
          )}
          <h3 className={`literature-item-title ${reference.isMarkedForDeletion ? 'strikethrough' : ''}`}>{reference.title}</h3>
        </div>
        
        {/* 作者信息和引用次数（未展开时显示） */}
        {!reference.isExpanded && (
          <div className="literature-item-preview-row">
            <div className={`literature-item-authors-preview ${reference.isMarkedForDeletion ? 'strikethrough' : ''}`}>
              {reference.authors}
            </div>
            {/* 引用次数徽章 */}
            <div 
              className={`literature-cite-count-badge ${citePositions.length > 0 ? 'has-citations' : 'no-citations'} ${isLocating ? 'loading' : ''}`}
              title={isLocating ? '正在搜索引用...' : citePositions.length > 0 ? `正文中共引用 ${citePositions.length} 次` : '正文中未引用'}
              onClick={(e) => {
                e.stopPropagation();
                if (citePositions.length > 0) {
                  handleLocate(e);
                }
              }}
            >
              <span className="material-symbols">format_quote</span>
              {isLocating ? (
                <span className="literature-cite-count-loading"></span>
              ) : (
                <span className="literature-cite-count-num">{citePositions.length}</span>
              )}
            </div>
          </div>
        )}
        
        {/* 操作按钮 */}
        <div className="literature-item-actions">
          {!reference.isMarkedForDeletion && (
            <>
              {/* 添加标签按钮 */}
              <div className="literature-tag-wrapper" ref={tagPopupRef}>
                <button 
                  className="literature-action-btn tag"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isTagPopupOpen) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      // 如果按钮距离顶部小于 500px，则显示在下方（覆盖前几个文献）
                      if (rect.top < 500) {
                        setPopupPosition('below');
                      } else {
                        setPopupPosition('above');
                      }
                    }
                    setIsTagPopupOpen(!isTagPopupOpen);
                  }}
                  title="添加标签"
                >
                  <span className="material-symbols">label</span>
                </button>
                {isTagPopupOpen && (
                  <div className={`literature-tag-popup ${popupPosition}`} onClick={(e) => e.stopPropagation()}>
                    <div className="literature-tag-popup-header">添加标签</div>
                    <input
                      type="text"
                      className="literature-tag-input"
                      placeholder="输入标签名称..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTagName.trim()) {
                          if (onAddTag(reference.id, { name: newTagName.trim(), color: selectedTagColor })) {
                            setNewTagName('');
                            setIsTagPopupOpen(false);
                            onShowNotification(`已添加标签: ${newTagName.trim()}`);
                          }
                        }
                      }}
                    />
                    <div className="literature-tag-colors">
                      {TAG_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`literature-tag-color-btn ${selectedTagColor === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSelectedTagColor(color)}
                          title={color}
                        />
                      ))}
                    </div>
                    
                    {allTags.length > 0 && (
                      <div className="literature-tag-popup-section">
                        <div className="literature-tag-popup-subtitle">已有标签</div>
                        <div className="literature-existing-tags-list">
                          {allTags.map(tag => {
                            const hasTag = reference.tags?.some(t => t.name === tag.name);
                            return (
                              <button
                                key={tag.name}
                                className={`literature-user-tag existing ${hasTag ? 'disabled' : ''}`}
                                style={{ backgroundColor: tag.color, opacity: hasTag ? 0.5 : 1, cursor: hasTag ? 'default' : 'pointer' }}
                                onClick={() => {
                                  if (hasTag) return;
                                  if (onAddTag(reference.id, tag)) {
                                    setIsTagPopupOpen(false);
                                    onShowNotification(`已添加标签: ${tag.name}`);
                                  } else {
                                    onShowNotification('标签已存在');
                                  }
                                }}
                                disabled={hasTag}
                                title={hasTag ? '已添加此标签' : '点击添加此标签'}
                              >
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      className="literature-tag-add-btn"
                      onClick={() => {
                        if (newTagName.trim()) {
                          if (onAddTag(reference.id, { name: newTagName.trim(), color: selectedTagColor })) {
                            setNewTagName('');
                            setIsTagPopupOpen(false);
                            onShowNotification(`已添加标签: ${newTagName.trim()}`);
                          } else {
                            onShowNotification('标签已存在');
                          }
                        }
                      }}
                      disabled={!newTagName.trim()}
                    >
                      添加
                    </button>
                  </div>
                )}
              </div>
              <button 
                className="literature-action-btn edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditBibtex(reference.rawBibtex || '');
                  setIsEditModalOpen(true);
                }}
                title="编辑 BibTeX"
              >
                <span className="material-symbols">edit</span>
              </button>
              <button 
                className="literature-action-btn cite"
                onClick={handleApply}
                title="复制引用代码"
              >
                <span className="material-symbols">content_copy</span>
              </button>
            </>
          )}
          <button 
            className={`literature-action-btn ${reference.isMarkedForDeletion ? 'restore' : 'delete'}`}
            onClick={handleDeleteOrRestore}
            title={reference.isMarkedForDeletion ? '恢复' : '删除'}
            disabled={isCheckingCitations}
          >
            <span className="material-symbols">
              {isCheckingCitations ? 'hourglass_empty' : reference.isMarkedForDeletion ? 'restore' : 'delete'}
            </span>
          </button>
        </div>
      </div>
      
      {/* 展开详情 */}
      {reference.isExpanded && (
        <div className="literature-item-details">
          <div className="literature-detail-grid">
            {/* 类型 */}
            <div className="literature-detail-row">
              <span className="literature-detail-label">类型:</span>
              <span className="literature-detail-badge">{reference.type}</span>
            </div>
            {/* 作者 */}
            <div className="literature-detail-row">
              <span className="literature-detail-label">作者:</span>
              <span className="literature-detail-value">{reference.authors}</span>
            </div>
            {/* 编辑 */}
            {reference.editor && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">编辑:</span>
                <span className="literature-detail-value">{reference.editor}</span>
              </div>
            )}
            {/* 年份和月份 */}
            <div className="literature-detail-row">
              <span className="literature-detail-label">年份:</span>
              <span className="literature-detail-badge">
                {reference.year}{reference.month && ` / ${reference.month}月`}
              </span>
            </div>
            {/* 期刊 */}
            {reference.journal && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">期刊:</span>
                <span className="literature-detail-venue">
                  {reference.journal}
                  {reference.shortjournal && ` (${reference.shortjournal})`}
                </span>
              </div>
            )}
            {/* 会议/书名 */}
            {reference.booktitle && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">会议/书:</span>
                <span className="literature-detail-venue">{reference.booktitle}</span>
              </div>
            )}
            {/* 出版社 */}
            {reference.publisher && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">出版社:</span>
                <span className="literature-detail-value">{reference.publisher}</span>
              </div>
            )}
            {/* 地址 */}
            {reference.address && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">地址:</span>
                <span className="literature-detail-value">{reference.address}</span>
              </div>
            )}
            {/* 卷/期/页 */}
            {(reference.volume || reference.number || reference.pages) && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">卷/期/页:</span>
                <span className="literature-detail-value">
                  {reference.volume && `Vol. ${reference.volume}`}
                  {reference.volume && reference.number && ', '}
                  {reference.number && `No. ${reference.number}`}
                  {(reference.volume || reference.number) && reference.pages && ', '}
                  {reference.pages && `pp. ${reference.pages}`}
                </span>
              </div>
            )}
            {/* 版本 */}
            {reference.edition && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">版本:</span>
                <span className="literature-detail-value">{reference.edition}</span>
              </div>
            )}
            {/* 学校 */}
            {reference.school && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">学校:</span>
                <span className="literature-detail-value">{reference.school}</span>
              </div>
            )}
            {/* 机构 */}
            {reference.institution && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">机构:</span>
                <span className="literature-detail-value">{reference.institution}</span>
              </div>
            )}
            {/* DOI */}
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
            {/* URL */}
            {reference.url && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">URL:</span>
                <a 
                  href={reference.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="literature-detail-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="material-symbols">link</span>
                  {reference.url.length > 50 ? reference.url.substring(0, 50) + '...' : reference.url}
                </a>
              </div>
            )}
            {/* ISSN */}
            {reference.issn && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">ISSN:</span>
                <span className="literature-detail-value">{reference.issn}</span>
              </div>
            )}
            {/* 关键词 */}
            {reference.keywords && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">关键词:</span>
                <span className="literature-detail-keywords">{reference.keywords}</span>
              </div>
            )}
            {/* 注释 */}
            {reference.note && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">注释:</span>
                <span className="literature-detail-value">{reference.note}</span>
              </div>
            )}
            {/* 来源文件 */}
            {reference.sourceFile && (
              <div className="literature-detail-row">
                <span className="literature-detail-label">来源:</span>
                <span className="literature-detail-source">{reference.sourceFile}</span>
              </div>
            )}
            {/* 额外字段 */}
            {reference.extraFields && Object.entries(reference.extraFields).map(([key, value]) => (
              <div className="literature-detail-row" key={key}>
                <span className="literature-detail-label">{key}:</span>
                <span className="literature-detail-value">{value}</span>
              </div>
            ))}
          </div>
          
          {/* 摘要 */}
          {reference.abstract && (
            <div className="literature-abstract">
              <span className="literature-abstract-label">摘要:</span>
              <p>{reference.abstract}</p>
            </div>
          )}
          
          {/* 引用键 */}
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
              {/* 刷新引用次数按钮 */}
              <button
                className="literature-refresh-cite-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  searchCitePositions();
                }}
                disabled={isLocating}
                title="刷新引用次数"
              >
                <span className={`material-symbols ${isLocating ? 'spinning' : ''}`}>refresh</span>
              </button>
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
          
          {/* 单条补全按钮 - 所有有 BibTeX 数据的文献都显示 */}
          {reference.rawBibtex && (
            <div className="literature-enrich-single-section">
              <button
                className={`literature-enrich-single-btn ${reference.isEnriched ? 're-enrich' : ''}`}
                onClick={handleEnrichSingle}
                disabled={isEnriching}
                title={reference.isEnriched ? '该文献已补全，点击可重新补全' : 'CrossRef 智能补全'}
              >
                {isEnriching ? (
                  <>
                    <span className="literature-spinner"></span>
                    <span>正在补全...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols">{reference.isEnriched ? 'refresh' : 'auto_awesome'}</span>
                    <span>{reference.isEnriched ? '重新补全' : 'CrossRef 智能补全'}</span>
                  </>
                )}
              </button>
            </div>
          )}
          
          {/* 补全对比区域 - 仅已补全的文献显示 */}
          {reference.isEnriched && reference.originalRawBibtex && (
            <div className="literature-enrich-diff-section">
              <button
                className={`literature-show-diff-btn ${showEnrichDiff ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEnrichDiff(!showEnrichDiff);
                }}
              >
                <span className="material-symbols">{showEnrichDiff ? 'expand_less' : 'compare'}</span>
                <span>{showEnrichDiff ? '收起对比' : '查看补全对比'}</span>
              </button>
              
              {showEnrichDiff && (
                <div className="literature-enrich-diff-content">
                  <DiffPreview 
                    original={reference.originalRawBibtex} 
                    enriched={reference.rawBibtex || ''} 
                  />
                </div>
              )}
            </div>
          )}
          
        </div>
      )}
      
      {/* 编辑弹窗 */}
      {isEditModalOpen && (
        <div className="literature-modal-overlay" onClick={(e) => {
          e.stopPropagation();
          setIsEditModalOpen(false);
        }}>
          <div className="literature-modal literature-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="literature-modal-header">
              <h3>编辑 BibTeX</h3>
              <button className="literature-modal-close" onClick={() => setIsEditModalOpen(false)}>
                <span className="material-symbols">close</span>
              </button>
            </div>
            <div className="literature-modal-body">
              <textarea
                className="literature-modal-textarea"
                value={editBibtex}
                onChange={(e) => setEditBibtex(e.target.value)}
                placeholder="输入 BibTeX 内容..."
                rows={15}
              />
            </div>
            <div className="literature-modal-footer">
              <button 
                className="literature-modal-btn secondary"
                onClick={() => setIsEditModalOpen(false)}
              >
                取消
              </button>
              <button 
                className="literature-modal-btn primary"
                onClick={() => {
                  if (!editBibtex.trim()) {
                    onShowNotification('BibTeX 内容不能为空');
                    return;
                  }
                  const success = onUpdateRawBibtex(reference.id, editBibtex);
                  if (success) {
                    onShowNotification('编辑成功');
                    setIsEditModalOpen(false);
                  } else {
                    onShowNotification('编辑失败，请检查 BibTeX 格式');
                  }
                }}
              >
                <span className="material-symbols">save</span>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 文献管理面板主组件
 */
/** 批量补全状态 */
interface EnrichAllState {
  isRunning: boolean;
  total: number;
  current: number;
  success: number;
  failed: number;
  currentTitle: string;
}

const LiteraturePanel: React.FC<LiteraturePanelProps> = ({ onClose }) => {
  const {
    references,
    isLoading,
    error,
    scanReferences,
    toggleExpand,
    clearReferences,
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
  } = useLiterature();
  
  const [notification, setNotification] = useState<string | null>(null);
  const [highlightedRefs, setHighlightedRefs] = useState<HighlightedRefs>(new Set());
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]); // 置顶顺序（最近点击的在前）
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [enrichAllState, setEnrichAllState] = useState<EnrichAllState | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('default'); // 排序方式
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false); // 排序菜单是否打开
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false); // 筛选菜单是否打开
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false); // 统计弹窗是否打开
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({ types: new Set(), tags: new Set() }); // 筛选条件
  const listRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  
  // 点击外部关闭排序菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    
    if (isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortMenuOpen]);
  
  // 点击外部关闭筛选菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    
    if (isFilterMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterMenuOpen]);
  
  // 注意：自动扫描已在 App.tsx 中处理，这里不需要重复扫描
  
  // 每次打开文献库页面时检查并去除重复文献
  useEffect(() => {
    if (references.length > 0) {
      const removedCount = deduplicateReferences();
      if (removedCount > 0) {
        showNotification(`已自动合并 ${removedCount} 篇重复文献`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅在组件挂载时执行一次
  
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
  
  // 处理标记删除
  const handleMarkForDeletion = useCallback((id: string) => {
    markForDeletion(id);
  }, [markForDeletion]);
  
  // 处理取消删除标记
  const handleUnmarkForDeletion = useCallback((id: string) => {
    unmarkForDeletion(id);
  }, [unmarkForDeletion]);
  
  // 处理手动添加文献
  const handleAddReference = useCallback((bibtex: string, isEnriched?: boolean) => {
    const added = addManualReference(bibtex, isEnriched);
    if (added.length > 0) {
      showNotification(`已添加 ${added.length} 篇文献`);
    } else {
      showNotification('解析失败，请检查 BibTeX 格式');
    }
  }, [addManualReference, showNotification]);
  
  // 批量补全所有文献
  const handleEnrichAll = useCallback(async () => {
    if (references.length === 0) {
      showNotification('没有可补全的文献');
      return;
    }
    
    // 筛选有 rawBibtex 且未补全的文献
    const toEnrich = references.filter(ref => ref.rawBibtex && !ref.isEnriched);
    if (toEnrich.length === 0) {
      showNotification('没有需要补全的文献');
      return;
    }
    
    setEnrichAllState({
      isRunning: true,
      total: toEnrich.length,
      current: 0,
      success: 0,
      failed: 0,
      currentTitle: ''
    });
    
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < toEnrich.length; i++) {
      const ref = toEnrich[i];
      
      // 更新当前进度
      setEnrichAllState(prev => prev ? {
        ...prev,
        current: i + 1,
        currentTitle: ref.title.length > 30 ? ref.title.substring(0, 30) + '...' : ref.title
      } : null);
      
      try {
        // 调用 CrossRef 补全
        const result = await CrossRefService.enrichFromBibtex(ref.rawBibtex || '');
        
        if (result.success && result.bibtex) {
          // 使用新的 enrichReference 方法更新文献，保留原始内容
          const success = enrichReference(ref.id, result.bibtex);
          if (success) {
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
        
        // 更新成功/失败计数
        setEnrichAllState(prev => prev ? {
          ...prev,
          success: successCount,
          failed: failedCount
        } : null);
        
        // 添加小延迟避免请求过快
        await new Promise(r => setTimeout(r, 500));
        
      } catch (err) {
        failedCount++;
        setEnrichAllState(prev => prev ? {
          ...prev,
          failed: failedCount
        } : null);
      }
    }
    
    // 完成
    setEnrichAllState(prev => prev ? { ...prev, isRunning: false } : null);
    showNotification(`补全完成：成功 ${successCount} 篇，失败 ${failedCount} 篇`);
    
    // 3秒后清除状态
    setTimeout(() => {
      setEnrichAllState(null);
    }, 3000);
    
  }, [references, enrichReference, showNotification]);
  
  // 应用文献库到 .bib 文件
  const [isApplying, setIsApplying] = useState(false);
  
  const handleApplyLibrary = useCallback(async () => {
    if (references.length === 0) {
      showNotification('文献库为空');
      return;
    }
    
    // 过滤掉标记删除的文献
    const validRefs = references.filter(ref => !ref.isMarkedForDeletion);
    if (validRefs.length === 0) {
      showNotification('没有可应用的文献');
      return;
    }
    
    setIsApplying(true);
    
    try {
      const { overleafEditor } = await import('../../services/editor/OverleafEditor');
      const bridge = overleafEditor.getBridge();
      
      // 1. 获取当前文件信息
      const currentFile = await bridge.call<{ name: string; id: string | null; type: string | null } | null>('getCurrentFile');
      
      // 2. 找到 .bib 文件名（优先从文献的 sourceFile 获取）
      let bibFileName: string | null = null;
      
      // 先看是否有来自项目的文献，获取其 sourceFile
      for (const ref of references) {
        if (ref.sourceFile && ref.sourceFile.endsWith('.bib')) {
          bibFileName = ref.sourceFile;
          break;
        }
      }
      
      // 如果没有找到，尝试常见的 bib 文件名
      if (!bibFileName) {
        const commonBibNames = ['references.bib', 'bibliography.bib', 'refs.bib', 'main.bib', 'Mybib.bib'];
        // 这里简单处理，假设第一个常见名称存在
        bibFileName = commonBibNames[0];
        showNotification('未找到项目中的 .bib 文件，将创建 references.bib');
      }
      
      // 3. 检查当前是否已打开 .bib 文件
      const isBibOpen = currentFile?.name?.endsWith('.bib');
      
      if (!isBibOpen) {
        // 切换到 .bib 文件
        showNotification(`正在打开 ${bibFileName}...`);
        const switchResult = await bridge.call<{ success: boolean; error?: string }>('switchFile', bibFileName);
        
        if (!switchResult?.success) {
          showNotification(`无法打开 ${bibFileName}，请手动打开后重试`);
          setIsApplying(false);
          return;
        }
        
        // 等待文件切换完成
        await new Promise(r => setTimeout(r, 500));
      }
      
      // 4. 生成所有文献的 BibTeX 内容（已补全的添加注释标识）
      // 添加软件标识头部
      const headerComment = `% ============================================================
% Generated by PacificOceanAI
% Last updated: ${new Date().toISOString().split('T')[0]}
% Total references: ${validRefs.length}
% ============================================================

`;
      
      const entriesContent = validRefs
        .map(ref => {
          const bibtex = ref.rawBibtex || generateBibtex(ref);
          // 移除旧的 CrossRef Enriched 标识（如果存在）
          return bibtex.replace(/^% \[CrossRef Enriched\]\n?/gm, '');
        })
        .filter(Boolean)
        .join('\n\n');
      
      const bibtexContent = headerComment + entriesContent;
      
      // 5. 替换文件内容
      const result = await bridge.call<{ success: boolean; oldLength: number; newLength: number }>('setDocContent', bibtexContent);
      
      if (result?.success) {
        // 6. 确认删除标记的文献
        confirmDeletions();
        
        // 7. 清除手动添加和已补全的标志（因为已应用）
        clearPendingStatus();
        
        showNotification(`已成功应用 ${validRefs.length} 篇文献到 ${bibFileName}`);
      } else {
        showNotification('应用失败，请重试');
      }
      
    } catch (err) {
      showNotification('应用失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsApplying(false);
    }
  }, [references, confirmDeletions, clearPendingStatus, showNotification]);
  
  // 辅助函数：根据 BibReference 生成 BibTeX 字符串
  const generateBibtex = (ref: BibReference): string => {
    const fields: string[] = [];
    
    if (ref.authors) fields.push(`  author = {${ref.authors}}`);
    if (ref.title) fields.push(`  title = {${ref.title}}`);
    if (ref.journal) fields.push(`  journal = {${ref.journal}}`);
    if (ref.booktitle) fields.push(`  booktitle = {${ref.booktitle}}`);
    if (ref.year) fields.push(`  year = {${ref.year}}`);
    if (ref.month) fields.push(`  month = {${ref.month}}`);
    if (ref.volume) fields.push(`  volume = {${ref.volume}}`);
    if (ref.number) fields.push(`  number = {${ref.number}}`);
    if (ref.pages) fields.push(`  pages = {${ref.pages}}`);
    if (ref.publisher) fields.push(`  publisher = {${ref.publisher}}`);
    if (ref.doi) fields.push(`  doi = {${ref.doi}}`);
    if (ref.url) fields.push(`  url = {${ref.url}}`);
    if (ref.abstract) fields.push(`  abstract = {${ref.abstract}}`);
    if (ref.keywords) fields.push(`  keywords = {${ref.keywords}}`);
    if (ref.note) fields.push(`  note = {${ref.note}}`);
    
    // 额外字段
    if (ref.extraFields) {
      for (const [key, value] of Object.entries(ref.extraFields)) {
        fields.push(`  ${key} = {${value}}`);
      }
    }
    
    return `@${ref.type}{${ref.id},\n${fields.join(',\n')}\n}`;
  };
  
  // 检查是否有激活的筛选条件
  const hasActiveFilter = React.useMemo(() => {
    return filterCriteria.types.size > 0 ||
           filterCriteria.tags.size > 0 ||
           filterCriteria.yearFrom !== undefined ||
           filterCriteria.yearTo !== undefined ||
           filterCriteria.hasEnriched !== undefined ||
           filterCriteria.hasPending !== undefined ||
           (filterCriteria.searchText && filterCriteria.searchText.trim() !== '');
  }, [filterCriteria]);
  
  // 根据筛选、排序方式和置顶顺序处理的文献列表
  const sortedReferences = React.useMemo(() => {
    // 创建一个 Map 来存储置顶顺序的索引
    const orderMap = new Map(pinnedOrder.map((id, index) => [id, index]));
    
    // 首先应用筛选
    let filtered = references.filter(ref => {
      // 类型筛选
      if (filterCriteria.types.size > 0 && !filterCriteria.types.has(ref.type)) {
        return false;
      }
      
      // 年份筛选
      const year = parseInt(ref.year || '0', 10);
      if (filterCriteria.yearFrom !== undefined && year < filterCriteria.yearFrom) {
        return false;
      }
      if (filterCriteria.yearTo !== undefined && year > filterCriteria.yearTo) {
        return false;
      }
      
      // 已补全筛选
      if (filterCriteria.hasEnriched !== undefined && ref.isEnriched !== filterCriteria.hasEnriched) {
        return false;
      }
      
      // 待应用筛选
      if (filterCriteria.hasPending !== undefined && ref.isManual !== filterCriteria.hasPending) {
        return false;
      }
      
      // 标签筛选（要求包含所有选中的标签）
      if (filterCriteria.tags.size > 0) {
        const refTagNames = new Set((ref.tags || []).map(t => t.name));
        for (const tagName of filterCriteria.tags) {
          if (!refTagNames.has(tagName)) {
            return false;
          }
        }
      }
      
      // 文本搜索（标题或作者）
      if (filterCriteria.searchText && filterCriteria.searchText.trim() !== '') {
        const searchLower = filterCriteria.searchText.toLowerCase();
        const titleMatch = (ref.title || '').toLowerCase().includes(searchLower);
        const authorMatch = (ref.authors || '').toLowerCase().includes(searchLower);
        const idMatch = ref.id.toLowerCase().includes(searchLower);
        if (!titleMatch && !authorMatch && !idMatch) {
          return false;
        }
      }
      
      return true;
    });
    
    // 然后按选择的排序方式排序
    let sorted = [...filtered];
    
    switch (sortMode) {
      case 'title-asc':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
        break;
      case 'title-desc':
        sorted.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'zh-CN'));
        break;
      case 'year-desc':
        sorted.sort((a, b) => {
          const yearA = parseInt(a.year || '0', 10);
          const yearB = parseInt(b.year || '0', 10);
          return yearB - yearA;
        });
        break;
      case 'year-asc':
        sorted.sort((a, b) => {
          const yearA = parseInt(a.year || '9999', 10);
          const yearB = parseInt(b.year || '9999', 10);
          return yearA - yearB;
        });
        break;
      case 'author-asc':
        sorted.sort((a, b) => {
          // 提取第一作者姓氏
          const getFirstAuthor = (authors: string | undefined) => {
            if (!authors) return 'zzz';
            const first = authors.split(' and ')[0] || authors.split(',')[0] || authors;
            return first.trim().toLowerCase();
          };
          return getFirstAuthor(a.authors).localeCompare(getFirstAuthor(b.authors), 'en');
        });
        break;
      case 'type':
        sorted.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
        break;
      case 'citations-desc':
        // 引用次数排序需要在渲染时动态获取，这里暂时按ID排序
        // 实际实现需要额外的引用计数数据
        break;
      default:
        // 'default' - 保持原顺序
        break;
    }
    
    // 然后应用置顶逻辑（置顶的始终在最前面）
    if (pinnedOrder.length > 0) {
      sorted.sort((a, b) => {
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
        
        // 都不在置顶列表，保持之前的排序
        return 0;
      });
    }
    
    return sorted;
  }, [references, pinnedOrder, sortMode, filterCriteria]);
  
  // 计算统计数据
  const stats = React.useMemo(() => {
    const typeCount: Record<string, number> = {};
    const yearCount: Record<string, number> = {};
    let enrichedCount = 0;
    let pendingCount = 0;
    let markedForDeletionCount = 0;
    let minYear = Infinity;
    let maxYear = -Infinity;
    
    for (const ref of references) {
      // 类型统计
      const type = ref.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
      
      // 年份统计
      const year = ref.year || '未知';
      yearCount[year] = (yearCount[year] || 0) + 1;
      
      const yearNum = parseInt(ref.year || '', 10);
      if (!isNaN(yearNum)) {
        minYear = Math.min(minYear, yearNum);
        maxYear = Math.max(maxYear, yearNum);
      }
      
      // 状态统计
      if (ref.isEnriched) enrichedCount++;
      if (ref.isManual) pendingCount++;
      if (ref.isMarkedForDeletion) markedForDeletionCount++;
    }
    
    return {
      total: references.length,
      typeCount,
      yearCount,
      enrichedCount,
      pendingCount,
      markedForDeletionCount,
      minYear: minYear === Infinity ? undefined : minYear,
      maxYear: maxYear === -Infinity ? undefined : maxYear,
    };
  }, [references]);
  
  // 获取所有可用的文献类型（用于筛选菜单）
  const availableTypes = React.useMemo(() => {
    const types = new Set<string>();
    for (const ref of references) {
      if (ref.type) types.add(ref.type);
    }
    return Array.from(types).sort();
  }, [references]);
  
  // 切换类型筛选
  const toggleTypeFilter = (type: string) => {
    setFilterCriteria(prev => {
      const newTypes = new Set(prev.types);
      if (newTypes.has(type)) {
        newTypes.delete(type);
      } else {
        newTypes.add(type);
      }
      return { ...prev, types: newTypes };
    });
  };
  
  // 清除所有筛选
  const clearFilters = () => {
    setFilterCriteria({ types: new Set(), tags: new Set() });
    showNotification('已清除所有筛选');
  };
  
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
            <p className="literature-empty-hint">点击"重新读取"扫描项目中的 .bib 文件</p>
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
              onMarkForDeletion={() => handleMarkForDeletion(ref.id)}
              onUnmarkForDeletion={() => handleUnmarkForDeletion(ref.id)}
              onShowNotification={showNotification}
              onEnrichReference={enrichReference}
              onUpdateRawBibtex={updateReferenceRawBibtex}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              allTags={getAllTags()}
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
            onClick={() => setIsAddModalOpen(true)}
          />
          <ShortcutButton 
            icon="refresh" 
            label="重新读取" 
            colorClass="gray"
            onClick={scanReferences}
            disabled={isLoading}
          />
          <div className="literature-sort-wrapper" ref={sortMenuRef}>
            <ShortcutButton 
              icon="sort" 
              label="排列方式" 
              colorClass="gray"
              onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
            />
            {isSortMenuOpen && (
              <div className="literature-sort-menu">
                {SORT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`literature-sort-option ${sortMode === option.value ? 'active' : ''}`}
                    onClick={() => {
                      setSortMode(option.value);
                      setIsSortMenuOpen(false);
                      showNotification(`排序方式: ${option.label}`);
                    }}
                  >
                    <span className="material-symbols">{option.icon}</span>
                    <span>{option.label}</span>
                    {sortMode === option.value && (
                      <span className="material-symbols check-icon">check</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="literature-filter-wrapper" ref={filterMenuRef}>
            <ShortcutButton 
              icon={hasActiveFilter ? "filter_alt_off" : "filter_alt"} 
              label={hasActiveFilter ? "清除筛选" : "文献筛选"} 
              colorClass={hasActiveFilter ? "orange" : "indigo"}
              onClick={() => {
                if (hasActiveFilter) {
                  clearFilters();
                } else {
                  setIsFilterMenuOpen(!isFilterMenuOpen);
                }
              }}
            />
            {isFilterMenuOpen && (
              <div className="literature-filter-menu">
                <div className="literature-filter-section">
                  <div className="literature-filter-title">按类型筛选</div>
                  <div className="literature-filter-chips">
                    {availableTypes.map(type => (
                      <button
                        key={type}
                        className={`literature-filter-chip ${filterCriteria.types.has(type) ? 'active' : ''}`}
                        onClick={() => toggleTypeFilter(type)}
                      >
                        {TYPE_LABELS[type] || type}
                        <span className="literature-filter-chip-count">
                          ({stats.typeCount[type] || 0})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="literature-filter-section">
                  <div className="literature-filter-title">按状态筛选</div>
                  <div className="literature-filter-chips">
                    <button
                      className={`literature-filter-chip ${filterCriteria.hasEnriched === true ? 'active' : ''}`}
                      onClick={() => setFilterCriteria(prev => ({
                        ...prev,
                        hasEnriched: prev.hasEnriched === true ? undefined : true
                      }))}
                    >
                      已补全 ({stats.enrichedCount})
                    </button>
                    <button
                      className={`literature-filter-chip ${filterCriteria.hasPending === true ? 'active' : ''}`}
                      onClick={() => setFilterCriteria(prev => ({
                        ...prev,
                        hasPending: prev.hasPending === true ? undefined : true
                      }))}
                    >
                      待应用 ({stats.pendingCount})
                    </button>
                  </div>
                </div>
                
                {/* 按标签筛选 */}
                {getAllTags().length > 0 && (
                  <div className="literature-filter-section">
                    <div className="literature-filter-title">按标签筛选</div>
                    <div className="literature-filter-chips">
                      {getAllTags().map(tag => (
                        <button
                          key={tag.name}
                          className={`literature-filter-chip ${filterCriteria.tags.has(tag.name) ? 'active' : ''}`}
                          style={{
                            borderColor: tag.color,
                            backgroundColor: filterCriteria.tags.has(tag.name) ? tag.color : 'transparent',
                            color: filterCriteria.tags.has(tag.name) ? '#fff' : tag.color
                          }}
                          onClick={() => setFilterCriteria(prev => {
                            const newTags = new Set(prev.tags);
                            if (newTags.has(tag.name)) {
                              newTags.delete(tag.name);
                            } else {
                              newTags.add(tag.name);
                            }
                            return { ...prev, tags: newTags };
                          })}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="literature-filter-section">
                  <div className="literature-filter-title">搜索</div>
                  <input
                    type="text"
                    className="literature-filter-search"
                    placeholder="搜索标题、作者或引用键..."
                    value={filterCriteria.searchText || ''}
                    onChange={(e) => setFilterCriteria(prev => ({
                      ...prev,
                      searchText: e.target.value
                    }))}
                  />
                </div>
                
                <div className="literature-filter-footer">
                  <span className="literature-filter-result">
                    {sortedReferences.length} / {references.length} 篇文献
                  </span>
                  <button 
                    className="literature-filter-clear-btn"
                    onClick={() => {
                      clearFilters();
                      setIsFilterMenuOpen(false);
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              </div>
            )}
          </div>
          <ShortcutButton 
            icon="bar_chart" 
            label="文献统计" 
            colorClass="purple"
            onClick={() => setIsStatsModalOpen(true)}
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
        
        {/* 批量补全进度 */}
        {enrichAllState && (
          <div className="literature-enrich-progress">
            <div className="literature-enrich-progress-header">
              <span className="material-symbols">auto_awesome</span>
              <span>
                {enrichAllState.isRunning 
                  ? `正在补全 (${enrichAllState.current}/${enrichAllState.total})`
                  : `补全完成`
                }
              </span>
            </div>
            {enrichAllState.isRunning && (
              <div className="literature-enrich-progress-current">
                {enrichAllState.currentTitle}
              </div>
            )}
            <div className="literature-enrich-progress-bar">
              <div 
                className="literature-enrich-progress-fill"
                style={{ width: `${(enrichAllState.current / enrichAllState.total) * 100}%` }}
              />
            </div>
            <div className="literature-enrich-progress-stats">
              <span className="success">✓ {enrichAllState.success}</span>
              <span className="failed">✗ {enrichAllState.failed}</span>
            </div>
          </div>
        )}
        
        {/* 补全所有文献按钮 */}
        <button 
          className="literature-enrich-all-btn"
          onClick={handleEnrichAll}
          disabled={references.length === 0 || isLoading || enrichAllState?.isRunning}
        >
          {enrichAllState?.isRunning ? (
            <>
              <span className="literature-modal-spinner"></span>
              <span>补全中...</span>
            </>
          ) : (
            <>
              <span className="material-symbols">auto_awesome</span>
              <span>补全所有文献</span>
            </>
          )}
        </button>
        
        {/* 应用文献库按钮 - 暂时禁用 */}
        <button 
          className="literature-apply-all-btn"
          onClick={handleApplyLibrary}
          disabled={true}
          title="此功能暂时禁用"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          {isApplying ? (
            <>
              <span className="literature-spinner"></span>
              <span>应用中...</span>
            </>
          ) : (
            <>
              <span className="material-symbols">auto_fix_high</span>
              <span>应用文献库</span>
            </>
          )}
        </button>
      </div>
      
      {/* 通知 Toast */}
      {notification && (
        <div className="literature-toast">
          <div className="literature-toast-indicator"></div>
          <span>{notification}</span>
        </div>
      )}
      
      {/* 新增文献弹窗 */}
      <AddReferenceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddReference}
        existingReferences={references}
      />
      
      {/* 文献统计弹窗 */}
      {isStatsModalOpen && (
        <div className="literature-modal-overlay" onClick={() => setIsStatsModalOpen(false)}>
          <div className="literature-modal literature-stats-modal" onClick={e => e.stopPropagation()}>
            <div className="literature-modal-header">
              <h3>📊 文献统计</h3>
              <button 
                className="literature-modal-close"
                onClick={() => setIsStatsModalOpen(false)}
              >
                <span className="material-symbols">close</span>
              </button>
            </div>
            
            <div className="literature-stats-content">
              {/* 总览 */}
              <div className="literature-stats-overview">
                <div className="literature-stats-card">
                  <span className="literature-stats-number">{stats.total}</span>
                  <span className="literature-stats-label">总文献数</span>
                </div>
                <div className="literature-stats-card enriched">
                  <span className="literature-stats-number">{stats.enrichedCount}</span>
                  <span className="literature-stats-label">已补全</span>
                </div>
                <div className="literature-stats-card pending">
                  <span className="literature-stats-number">{stats.pendingCount}</span>
                  <span className="literature-stats-label">待应用</span>
                </div>
                <div className="literature-stats-card deletion">
                  <span className="literature-stats-number">{stats.markedForDeletionCount}</span>
                  <span className="literature-stats-label">待删除</span>
                </div>
              </div>
              
              {/* 年份范围 */}
              {stats.minYear && stats.maxYear && (
                <div className="literature-stats-section">
                  <h4>📅 年份范围</h4>
                  <p className="literature-stats-range">
                    {stats.minYear} — {stats.maxYear}
                    <span className="literature-stats-span">（跨越 {stats.maxYear - stats.minYear + 1} 年）</span>
                  </p>
                </div>
              )}
              
              {/* 类型分布 */}
              <div className="literature-stats-section">
                <h4>📚 类型分布</h4>
                <div className="literature-stats-bars">
                  {Object.entries(stats.typeCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="literature-stats-bar-item">
                        <div className="literature-stats-bar-label">
                          <span>{TYPE_LABELS[type] || type}</span>
                          <span className="literature-stats-bar-count">{count}</span>
                        </div>
                        <div className="literature-stats-bar-bg">
                          <div 
                            className="literature-stats-bar-fill"
                            style={{ width: `${(count / stats.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
              
              {/* 年份分布（前10年） */}
              <div className="literature-stats-section">
                <h4>📈 年份分布</h4>
                <div className="literature-stats-year-grid">
                  {Object.entries(stats.yearCount)
                    .filter(([year]) => year !== '未知')
                    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
                    .slice(0, 12)
                    .map(([year, count]) => (
                      <div key={year} className="literature-stats-year-item">
                        <span className="literature-stats-year">{year}</span>
                        <span className="literature-stats-year-count">{count}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiteraturePanel;

