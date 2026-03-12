/**
 * LiteratureStorageService - 文献库本地持久化服务
 * 
 * 职责：
 * - 将文献库数据保存到浏览器本地存储
 * - 加载本地存储的文献数据
 * - 按项目 ID 隔离存储（不同 Overleaf 项目使用不同的存储空间）
 */

import type { BibReference } from '../../platform/literature/ILiteratureService';

/** 存储的文献数据结构 */
export interface StoredLiteratureData {
  /** 文献列表 */
  references: StoredBibReference[];
  /** 最后更新时间 */
  lastUpdated: string;
  /** 数据版本（用于未来兼容性处理） */
  version: number;
}

/** 存储的文献条目（BibReference 的可序列化版本） */
export interface StoredBibReference {
  id: string;
  type: string;
  title?: string;
  authors?: string;
  journal?: string;
  booktitle?: string;
  year?: string;
  month?: string;
  volume?: string;
  number?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  keywords?: string;
  note?: string;
  shortjournal?: string;
  issn?: string;
  editor?: string;
  edition?: string;
  address?: string;
  school?: string;
  institution?: string;
  rawBibtex?: string;
  sourceFile?: string;
  isManual?: boolean;
  isEnriched?: boolean;
  isEdited?: boolean;
  isMarkedForDeletion?: boolean;
  originalRawBibtex?: string;
  extraFields?: Record<string, string>;
  tags?: Array<{ name: string; color: string }>;
}

/** 当前存储数据版本 */
const STORAGE_VERSION = 1;

/** 存储键前缀 */
const STORAGE_KEY_PREFIX = 'overleaf-ai-literature-';

/**
 * 获取当前项目 ID
 */
function getProjectId(): string | null {
  // 从 URL 中提取项目 ID: /project/xxx
  const match = window.location.pathname.match(/\/project\/([a-f0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * 获取存储键
 */
function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/**
 * 规范化字符串用于比较（去除空格、标点，转小写）
 */
export function normalizeForComparison(str: string | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\s\.,\-_:;'"!?()[\]{}]/g, '')  // 去除空格和常见标点
    .replace(/[^\w\u4e00-\u9fa5]/g, '');       // 保留字母数字和中文
}

/**
 * 比较两个文献是否为同一篇（模糊匹配）
 */
export function isSameReference(ref1: BibReference | StoredBibReference, ref2: BibReference | StoredBibReference): boolean {
  const title1 = normalizeForComparison(ref1.title);
  const title2 = normalizeForComparison(ref2.title);
  const authors1 = normalizeForComparison(ref1.authors);
  const authors2 = normalizeForComparison(ref2.authors);
  
  // 标题和作者都匹配则认为是同一篇
  // 允许一定的容错：如果标题完全匹配，或者标题相似度很高
  if (title1 && title2 && title1 === title2) {
    // 标题完全匹配
    if (authors1 && authors2) {
      // 如果都有作者信息，检查作者是否匹配
      return authors1 === authors2 || authors1.includes(authors2) || authors2.includes(authors1);
    }
    // 标题匹配但某一方没有作者信息，也认为是同一篇
    return true;
  }
  
  // ID 完全匹配也认为是同一篇
  if (ref1.id && ref2.id && ref1.id === ref2.id) {
    return true;
  }
  
  return false;
}

/**
 * LiteratureStorageService 类
 */
export class LiteratureStorageService {
  private projectId: string | null = null;
  
  constructor() {
    this.projectId = getProjectId();
  }
  
  /**
   * 检查是否在有效的项目上下文中
   */
  isAvailable(): boolean {
    return this.projectId !== null;
  }
  
  /**
   * 获取当前项目 ID
   */
  getProjectId(): string | null {
    return this.projectId;
  }
  
  /**
   * 保存文献库到本地存储
   */
  async save(references: BibReference[]): Promise<boolean> {
    if (!this.projectId) {
      return false;
    }
    
    try {
      const data: StoredLiteratureData = {
        references: references.map(ref => this.serializeReference(ref)),
        lastUpdated: new Date().toISOString(),
        version: STORAGE_VERSION
      };
      
      const key = getStorageKey(this.projectId);
      
      // 使用 Chrome Storage API
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [key]: data });
      } else {
        // 降级到 localStorage
        localStorage.setItem(key, JSON.stringify(data));
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 从本地存储加载文献库
   */
  async load(): Promise<StoredBibReference[]> {
    if (!this.projectId) {
      return [];
    }
    
    try {
      const key = getStorageKey(this.projectId);
      let data: StoredLiteratureData | null = null;
      
      // 使用 Chrome Storage API
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(key);
        data = result[key] as StoredLiteratureData | null;
      } else {
        // 降级到 localStorage
        const stored = localStorage.getItem(key);
        data = stored ? JSON.parse(stored) : null;
      }
      
      if (!data) {
        return [];
      }
      
      // 版本兼容性处理（未来扩展）
      if (data.version !== STORAGE_VERSION) {
        // TODO: 版本迁移逻辑
      }
      
      return data.references;
    } catch (error) {
      return [];
    }
  }
  
  /**
   * 清除本地存储的文献库
   */
  async clear(): Promise<boolean> {
    if (!this.projectId) {
      return false;
    }
    
    try {
      const key = getStorageKey(this.projectId);
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(key);
      } else {
        localStorage.removeItem(key);
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 序列化文献条目（移除不可序列化的属性）
   */
  private serializeReference(ref: BibReference): StoredBibReference {
    return {
      id: ref.id,
      type: ref.type,
      title: ref.title,
      authors: ref.authors,
      journal: ref.journal,
      booktitle: ref.booktitle,
      year: ref.year,
      month: ref.month,
      volume: ref.volume,
      number: ref.number,
      pages: ref.pages,
      publisher: ref.publisher,
      doi: ref.doi,
      url: ref.url,
      abstract: ref.abstract,
      keywords: ref.keywords,
      note: ref.note,
      shortjournal: ref.shortjournal,
      issn: ref.issn,
      editor: ref.editor,
      edition: ref.edition,
      address: ref.address,
      school: ref.school,
      institution: ref.institution,
      rawBibtex: ref.rawBibtex,
      sourceFile: ref.sourceFile,
      isManual: ref.isManual,
      isEnriched: ref.isEnriched,
      isEdited: ref.isEdited,
      isMarkedForDeletion: ref.isMarkedForDeletion,
      originalRawBibtex: ref.originalRawBibtex,
      extraFields: ref.extraFields,
      tags: ref.tags
    };
  }
  
  /**
   * 反序列化文献条目
   */
  deserializeReference(stored: StoredBibReference): BibReference {
    return {
      ...stored,
      type: stored.type as BibReference['type'],
      isExpanded: false,  // UI 状态不持久化
      tags: stored.tags
    };
  }
}

// 单例实例
let _instance: LiteratureStorageService | null = null;

export function getLiteratureStorageService(): LiteratureStorageService {
  if (!_instance) {
    _instance = new LiteratureStorageService();
  }
  return _instance;
}

