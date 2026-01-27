/**
 * 文献管理服务接口
 * 负责解析和管理 BibTeX 格式的文献引用
 */

import type { Event } from '../../base/common/event';

/**
 * 文献条目类型
 */
export type BibEntryType = 
  | 'article' 
  | 'book' 
  | 'inproceedings' 
  | 'conference'
  | 'incollection'
  | 'inbook'
  | 'mastersthesis'
  | 'phdthesis'
  | 'techreport'
  | 'manual'
  | 'misc'
  | 'unpublished'
  | 'online'
  | string;

/**
 * 预定义的标签颜色
 */
export const TAG_COLORS = [
  '#ef4444', // 红色
  '#f97316', // 橙色
  '#eab308', // 黄色
  '#22c55e', // 绿色
  '#14b8a6', // 青色
  '#3b82f6', // 蓝色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#6b7280', // 灰色
] as const;

/**
 * 文献标签
 */
export interface LiteratureTag {
  /** 标签名称 */
  name: string;
  /** 标签颜色 (十六进制) */
  color: string;
}

/**
 * 文献引用数据结构
 */
export interface BibReference {
  /** 唯一标识 (BibTeX citation key) */
  id: string;
  /** 条目类型 */
  type: BibEntryType;
  /** 标题 */
  title: string;
  /** 作者列表 */
  authors: string;
  /** 年份 */
  year: string;
  /** 月份 */
  month?: string;
  /** 期刊名称 */
  journal?: string;
  /** 期刊缩写 */
  shortjournal?: string;
  /** 书名 (for inproceedings, incollection) */
  booktitle?: string;
  /** 卷号 */
  volume?: string;
  /** 期号 */
  number?: string;
  /** 页码 */
  pages?: string;
  /** DOI */
  doi?: string;
  /** URL */
  url?: string;
  /** ISSN */
  issn?: string;
  /** 摘要 */
  abstract?: string;
  /** 出版社 */
  publisher?: string;
  /** 编辑 */
  editor?: string;
  /** 版本 */
  edition?: string;
  /** 地址 */
  address?: string;
  /** 学校 (for thesis) */
  school?: string;
  /** 机构 */
  institution?: string;
  /** 关键词 */
  keywords?: string;
  /** 注释 */
  note?: string;
  /** 其他未识别的字段 */
  extraFields?: Record<string, string>;
  /** 来源文件路径 */
  sourceFile?: string;
  /** 原始 BibTeX 字符串 */
  rawBibtex?: string;
  /** 补全前的原始 BibTeX（用于对比） */
  originalRawBibtex?: string;
  /** UI 状态：是否展开 */
  isExpanded?: boolean;
  /** 是否为手动添加的待应用文献（未写入项目文件） */
  isManual?: boolean;
  /** 是否已被补全 */
  isEnriched?: boolean;
  /** 是否已被手动编辑 */
  isEdited?: boolean;
  /** 是否标记为待删除 */
  isMarkedForDeletion?: boolean;
  /** 用户自定义标签 */
  tags?: LiteratureTag[];
}

/**
 * 文献解析结果
 */
export interface ParseResult {
  /** 成功解析的文献 */
  references: BibReference[];
  /** 解析错误信息 */
  errors: string[];
  /** 来源文件 */
  sourceFiles: string[];
}

/**
 * 文献服务接口
 */
export interface ILiteratureService {
  /**
   * 文献列表变更事件
   */
  readonly onDidReferencesChange: Event<BibReference[]>;

  /**
   * 加载状态变更事件
   */
  readonly onDidLoadingChange: Event<boolean>;

  /**
   * 获取所有文献
   */
  getReferences(): BibReference[];

  /**
   * 获取加载状态
   */
  isLoading(): boolean;

  /**
   * 从所有项目文件中扫描并解析 BibTeX 文献
   */
  scanAndParseReferences(): Promise<ParseResult>;

  /**
   * 解析 BibTeX 字符串
   * @param bibtex BibTeX 格式的字符串
   * @param sourceFile 来源文件路径（可选）
   */
  parseBibtex(bibtex: string, sourceFile?: string): BibReference[];

  /**
   * 删除文献
   * @param id 文献 ID
   */
  deleteReference(id: string): void;

  /**
   * 切换文献展开状态
   * @param id 文献 ID
   */
  toggleExpand(id: string): void;

  /**
   * 生成引用文本 (用于插入到编辑器)
   * @param id 文献 ID
   */
  generateCitation(id: string): string;

  /**
   * 批量生成引用文本
   * @param ids 文献 ID 列表
   */
  generateCitations(ids: string[]): string;

  /**
   * 清空所有文献
   */
  clearReferences(): void;

  /**
   * 手动添加文献（解析 BibTeX 并添加到文献库，标记为临时文献）
   * @param bibtex BibTeX 格式的字符串
   * @param isEnriched 是否已通过 CrossRef 补全
   * @returns 添加的文献列表，如果解析失败返回空数组
   */
  addManualReference(bibtex: string, isEnriched?: boolean): BibReference[];

  /**
   * 查找文献
   * @param id 文献 ID
   */
  findReference(id: string): BibReference | undefined;

  /**
   * 标记文献为待删除状态
   * @param id 文献 ID
   */
  markForDeletion(id: string): void;

  /**
   * 取消文献的待删除标记（恢复）
   * @param id 文献 ID
   */
  unmarkForDeletion(id: string): void;

  /**
   * 确认删除所有标记为待删除的文献
   */
  confirmDeletions(): void;
  
  /**
   * 使用补全后的 BibTeX 更新文献，保留原始内容用于对比
   * @param id 文献 ID
   * @param enrichedBibtex 补全后的 BibTeX
   * @returns 是否成功
   */
  enrichReference(id: string, enrichedBibtex: string): boolean;
  
  /**
   * 清除所有文献的待应用状态（应用后调用）
   */
  clearPendingStatus(): void;
  
  /**
   * 更新文献的原始 BibTeX 内容
   * @param id 文献 ID
   * @param rawBibtex 新的原始 BibTeX
   * @returns 是否成功
   */
  updateReferenceRawBibtex(id: string, rawBibtex: string): boolean;
  
  /**
   * 初始化文献库（加载本地库 + 读取 bib 文件 + 对比合并）
   * 应在插件加载时调用
   */
  initializeWithSync(): Promise<ParseResult>;
  
  /**
   * 保存当前文献库到本地存储
   */
  saveToLocalStorage(): Promise<boolean>;
  
  /**
   * 获取本地库中但 bib 文件中没有的文献（待应用的文献）
   */
  getPendingReferences(): BibReference[];
  
  /**
   * 检查并去除文献库中的重复文献
   * @returns 去重后移除的文献数量
   */
  deduplicateReferences(): number;
  
  /**
   * 为文献添加标签
   * @param id 文献 ID
   * @param tag 要添加的标签
   * @returns 是否成功
   */
  addTag(id: string, tag: LiteratureTag): boolean;
  
  /**
   * 从文献移除标签
   * @param id 文献 ID
   * @param tagName 要移除的标签名称
   * @returns 是否成功
   */
  removeTag(id: string, tagName: string): boolean;
  
  /**
   * 获取所有已使用的标签（用于筛选）
   * @returns 所有唯一的标签列表
   */
  getAllTags(): LiteratureTag[];
}

export const ILiteratureServiceId: symbol = Symbol('ILiteratureService');

