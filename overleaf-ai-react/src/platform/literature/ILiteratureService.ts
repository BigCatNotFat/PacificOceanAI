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
  /** 期刊/会议/出版社名称 */
  journal?: string;
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
  /** 摘要 */
  abstract?: string;
  /** 出版社 */
  publisher?: string;
  /** 来源文件路径 */
  sourceFile?: string;
  /** 原始 BibTeX 字符串 */
  rawBibtex?: string;
  /** UI 状态：是否展开 */
  isExpanded?: boolean;
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
}

export const ILiteratureServiceId: symbol = Symbol('ILiteratureService');

