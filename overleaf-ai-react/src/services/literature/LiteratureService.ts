/**
 * 文献管理服务实现
 * 负责解析和管理 BibTeX 格式的文献引用
 */

import { Emitter, Event } from '../../base/common/event';
import { Disposable } from '../../base/common/disposable';
import type { 
  ILiteratureService, 
  BibReference, 
  ParseResult,
  BibEntryType,
  LiteratureTag 
} from '../../platform/literature/ILiteratureService';
import { injectable } from '../../platform/instantiation';
import { overleafEditor } from '../editor/OverleafEditor';
import { 
  getLiteratureStorageService, 
  isSameReference,
  type StoredBibReference 
} from './LiteratureStorageService';

/**
 * BibTeX 解析器
 */
class BibtexParser {
  // CrossRef 补全标识注释
  static readonly ENRICHED_MARKER = '% [CrossRef Enriched]';
  
  /**
   * 解析 BibTeX 字符串，提取所有条目
   */
  static parse(bibtex: string, sourceFile?: string): BibReference[] {
    const references: BibReference[] = [];
    
    // 匹配 BibTeX 条目的正则表达式
    // 格式: @type{key, field1 = {value1}, field2 = "value2", ...}
    const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*?)(?=\n\s*@|\n*$)/gs;
    
    let match;
    while ((match = entryRegex.exec(bibtex)) !== null) {
      const type = match[1].toLowerCase() as BibEntryType;
      const key = match[2].trim();
      const fieldsStr = match[3];
      const matchIndex = match.index;
      
      // 检查条目前面是否有 CrossRef Enriched 标识
      // 向前查找最多 100 个字符，看是否有标识注释
      const lookbackStart = Math.max(0, matchIndex - 100);
      const textBefore = bibtex.substring(lookbackStart, matchIndex);
      const isEnrichedFromFile = textBefore.includes(this.ENRICHED_MARKER);
      
      // 解析字段
      const fields = this.parseFields(fieldsStr);
      
      // 已知字段列表
      const knownFields = new Set([
        'title', 'author', 'year', 'month', 'journal', 'shortjournal',
        'booktitle', 'volume', 'number', 'pages', 'doi', 'url', 'issn',
        'abstract', 'publisher', 'editor', 'edition', 'address',
        'school', 'institution', 'keywords', 'note'
      ]);
      
      // 提取额外字段
      const extraFields: Record<string, string> = {};
      for (const [fieldName, value] of Object.entries(fields)) {
        if (!knownFields.has(fieldName) && value) {
          extraFields[fieldName] = value;
        }
      }
      
      // 清理 match[0]，只保留到最后一个 } 的内容（去除尾部可能包含的注释）
      let cleanedMatch = match[0];
      const lastBraceIndex = cleanedMatch.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        cleanedMatch = cleanedMatch.substring(0, lastBraceIndex + 1);
      }
      
      // rawBibtex 不包含标识，标识只在应用时添加
      const rawBibtex = cleanedMatch.trim();
      
      const reference: BibReference = {
        id: key,
        type,
        title: fields.title || '',
        authors: fields.author || '',
        year: fields.year || '',
        month: fields.month,
        journal: fields.journal,
        shortjournal: fields.shortjournal,
        booktitle: fields.booktitle,
        volume: fields.volume,
        number: fields.number,
        pages: fields.pages,
        doi: fields.doi,
        url: fields.url,
        issn: fields.issn,
        abstract: fields.abstract,
        publisher: fields.publisher,
        editor: fields.editor,
        edition: fields.edition,
        address: fields.address,
        school: fields.school,
        institution: fields.institution,
        keywords: fields.keywords,
        note: fields.note,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
        sourceFile,
        rawBibtex,
        isExpanded: false,
        isEnriched: isEnrichedFromFile  // 从文件中读取的补全标识
      };
      
      // 只添加有标题的条目
      if (reference.title) {
        references.push(reference);
      }
    }
    
    return references;
  }
  
  /**
   * 解析 BibTeX 字段
   */
  private static parseFields(fieldsStr: string): Record<string, string> {
    const fields: Record<string, string> = {};
    
    // 匹配字段的正则表达式
    // 支持 field = {value}, field = "value", field = value
    const fieldRegex = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|(\S+))/g;
    
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
      const fieldName = fieldMatch[1].toLowerCase();
      const value = fieldMatch[2] || fieldMatch[3] || fieldMatch[4] || '';
      fields[fieldName] = this.cleanValue(value);
    }
    
    return fields;
  }
  
  /**
   * 清理字段值
   */
  private static cleanValue(value: string): string {
    return value
      .replace(/\s+/g, ' ')  // 合并多个空白字符
      .replace(/\{|\}/g, '') // 移除额外的花括号
      .trim();
  }
}

@injectable()
export class LiteratureService extends Disposable implements ILiteratureService {
  private _references: BibReference[] = [];
  private _isLoading = false;
  
  private readonly _onDidReferencesChange = this._register(new Emitter<BibReference[]>());
  readonly onDidReferencesChange: Event<BibReference[]> = this._onDidReferencesChange.event;
  
  private readonly _onDidLoadingChange = this._register(new Emitter<boolean>());
  readonly onDidLoadingChange: Event<boolean> = this._onDidLoadingChange.event;
  
  constructor() {
    super();
    
    // 监听文献变化，自动保存到本地存储
    this._register(this.onDidReferencesChange(() => {
      // 使用 debounce 避免频繁保存
      this.debouncedSave();
    }));
  }
  
  private _saveTimeout: ReturnType<typeof setTimeout> | null = null;
  
  /**
   * 防抖保存（500ms 内多次变化只保存一次）
   */
  private debouncedSave(): void {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    this._saveTimeout = setTimeout(() => {
      this.saveToLocalStorage().catch(err => {
        console.error('[LiteratureService] 自动保存失败:', err);
      });
    }, 500);
  }
  
  getReferences(): BibReference[] {
    return [...this._references];
  }
  
  isLoading(): boolean {
    return this._isLoading;
  }
  
  async scanAndParseReferences(): Promise<ParseResult> {
    // 重新读取：对比 bib 文件和本地文献库，进行同步
    // - bib 有，本地库没有 → 新增到文献库
    // - 本地库有，bib 没有 → 标记为待应用
    // - 都有 → 合并（保留本地库的增强信息）
    return this.initializeWithSync();
  }
  
  parseBibtex(bibtex: string, sourceFile?: string): BibReference[] {
    return BibtexParser.parse(bibtex, sourceFile);
  }
  
  /**
   * 合并两个相同 ID 的文献
   * 策略：优先保留更完整的信息，已补全的版本优先
   */
  private mergeReferences(existing: BibReference, incoming: BibReference): BibReference {
    // 如果其中一个是已补全的，优先使用已补全的
    if (incoming.isEnriched && !existing.isEnriched) {
      return { ...incoming, sourceFile: existing.sourceFile || incoming.sourceFile };
    }
    if (existing.isEnriched && !incoming.isEnriched) {
      return existing;
    }
    
    // 如果其中一个有更长的 rawBibtex（通常意味着更完整），优先使用它
    const existingLen = existing.rawBibtex?.length || 0;
    const incomingLen = incoming.rawBibtex?.length || 0;
    
    if (incomingLen > existingLen * 1.2) {
      // 新的内容明显更长，使用新的
      return { ...incoming, sourceFile: existing.sourceFile || incoming.sourceFile };
    }
    
    // 否则，逐字段合并（保留非空字段）
    const merged: BibReference = { ...existing };
    
    // 合并基本字段（如果现有的为空，使用新的）
    const fieldsToMerge: (keyof BibReference)[] = [
      'title', 'authors', 'journal', 'booktitle', 'year', 'month',
      'volume', 'number', 'pages', 'publisher', 'doi', 'url',
      'abstract', 'keywords', 'note', 'shortjournal', 'issn',
      'editor', 'edition', 'address', 'school', 'institution'
    ];
    
    for (const field of fieldsToMerge) {
      const existingVal = existing[field];
      const incomingVal = incoming[field];
      
      // 如果现有的为空但新的有值，使用新的
      if ((!existingVal || existingVal === '') && incomingVal && incomingVal !== '') {
        (merged as Record<string, unknown>)[field] = incomingVal;
      }
    }
    
    // 合并 extraFields
    if (incoming.extraFields) {
      merged.extraFields = { ...existing.extraFields, ...incoming.extraFields };
    }

    // 合并 tags
    if (incoming.tags || existing.tags) {
      const tagMap = new Map<string, LiteratureTag>();
      (existing.tags || []).forEach(t => tagMap.set(t.name, t));
      (incoming.tags || []).forEach(t => tagMap.set(t.name, t));
      merged.tags = Array.from(tagMap.values());
    }
    
    // 使用更完整的 rawBibtex
    if (incomingLen > existingLen) {
      merged.rawBibtex = incoming.rawBibtex;
    }
    
    return merged;
  }
  
  deleteReference(id: string): void {
    this._references = this._references.filter(ref => ref.id !== id);
    this._onDidReferencesChange.fire(this._references);
  }
  
  toggleExpand(id: string): void {
    this._references = this._references.map(ref => 
      ref.id === id ? { ...ref, isExpanded: !ref.isExpanded } : ref
    );
    this._onDidReferencesChange.fire(this._references);
  }
  
  generateCitation(id: string): string {
    return `\\cite{${id}}`;
  }
  
  generateCitations(ids: string[]): string {
    if (ids.length === 0) return '';
    if (ids.length === 1) return this.generateCitation(ids[0]);
    return `\\cite{${ids.join(', ')}}`;
  }
  
  clearReferences(): void {
    this._references = [];
    this._onDidReferencesChange.fire(this._references);
  }
  
  addManualReference(bibtex: string, isEnriched: boolean = false): BibReference[] {
    try {
      const parsed = this.parseBibtex(bibtex, '手动添加');
      
      if (parsed.length === 0) {
        return [];
      }
      
      // 标记为手动添加的临时文献
      const manualRefs = parsed.map(ref => ({
        ...ref,
        isManual: true,
        isEnriched: isEnriched || ref.isEnriched // 保留解析时检测到的或传入的补全标志
      }));
      
      const addedRefs: BibReference[] = [];
      const idsToRemove = new Set<string>();
      
      for (const ref of manualRefs) {
        // 使用 isSameReference 查找重复的文献（比较标题+作者或ID）
        const existingRef = this._references.find(r => isSameReference(r, ref));
        
        if (existingRef) {
          // 找到重复文献，合并并替换
          const merged = this.mergeReferences(existingRef, ref);
          idsToRemove.add(existingRef.id);
          addedRefs.push(merged);
          console.log(`[LiteratureService] 合并手动添加文献: ${ref.id} <- ${existingRef.id}`);
        } else {
          // 新文献，直接添加
          addedRefs.push(ref);
        }
      }
      
      // 移除被合并的旧文献
      this._references = this._references.filter(ref => !idsToRemove.has(ref.id));
      
      // 添加新文献到列表开头
      this._references = [...addedRefs, ...this._references];
      this._onDidReferencesChange.fire(this._references);
      
      return addedRefs;
    } catch (error) {
      console.error('[LiteratureService] 解析手动添加的 BibTeX 失败:', error);
      return [];
    }
  }
  
  findReference(id: string): BibReference | undefined {
    return this._references.find(ref => ref.id === id);
  }
  
  markForDeletion(id: string): void {
    this._references = this._references.map(ref => 
      ref.id === id ? { ...ref, isMarkedForDeletion: true } : ref
    );
    this._onDidReferencesChange.fire(this._references);
  }
  
  unmarkForDeletion(id: string): void {
    this._references = this._references.map(ref => 
      ref.id === id ? { ...ref, isMarkedForDeletion: false } : ref
    );
    this._onDidReferencesChange.fire(this._references);
  }
  
  confirmDeletions(): void {
    this._references = this._references.filter(ref => !ref.isMarkedForDeletion);
    this._onDidReferencesChange.fire(this._references);
  }
  
  /**
   * 使用补全后的 BibTeX 更新文献，保留原始内容用于对比
   * @param id 文献 ID
   * @param enrichedBibtex 补全后的 BibTeX
   * @returns 是否成功
   */
  enrichReference(id: string, enrichedBibtex: string): boolean {
    try {
      const existingRef = this._references.find(ref => ref.id === id);
      if (!existingRef) {
        return false;
      }
      
      // 解析补全后的 BibTeX
      const parsed = this.parseBibtex(enrichedBibtex);
      if (parsed.length === 0) {
        return false;
      }
      
      const enrichedRef = parsed[0];
      
      // 保存原始内容
      const originalRawBibtex = existingRef.originalRawBibtex || existingRef.rawBibtex;
      
      // 更新文献
      this._references = this._references.map(ref => {
        if (ref.id === id) {
          return {
            ...enrichedRef,
            id: ref.id, // 保持原 ID
            sourceFile: ref.sourceFile,
            isManual: ref.isManual,
            isExpanded: ref.isExpanded,
            originalRawBibtex,
            isEnriched: true
          };
        }
        return ref;
      });
      
      this._onDidReferencesChange.fire(this._references);
      return true;
    } catch (error) {
      console.error('[LiteratureService] 补全文献失败:', error);
      return false;
    }
  }
  
  /**
   * 清除所有文献的待应用状态（应用后调用）
   * 注意：保留 isEnriched 和 isEdited 状态，这些是永久标签
   */
  clearPendingStatus(): void {
    this._references = this._references.map(ref => ({
      ...ref,
      isManual: false,  // 只清除"待应用"状态
      // isEnriched 保留，已补全的文献永久显示"已补全"标签
      // isEdited 保留，已编辑的文献永久显示"已编辑"标签
      originalRawBibtex: undefined  // 清除原始内容，因为已经应用了
    }));
    this._onDidReferencesChange.fire(this._references);
    
    // 立即保存到本地存储，确保状态持久化
    this.saveToLocalStorage().catch(err => {
      console.error('[LiteratureService] 清除待应用状态后保存失败:', err);
    });
  }
  
  /**
   * 更新文献的原始 BibTeX 内容
   */
  updateReferenceRawBibtex(id: string, rawBibtex: string): boolean {
    try {
      const existingRef = this._references.find(ref => ref.id === id);
      if (!existingRef) {
        return false;
      }
      
      // 重新解析 BibTeX 获取新的字段
      const parsed = this.parseBibtex(rawBibtex);
      if (parsed.length === 0) {
        return false;
      }
      
      const newRef = parsed[0];
      
      // 更新文献，保留原始内容用于对比
      this._references = this._references.map(ref => {
        if (ref.id === id) {
          return {
            ...newRef,
            id: ref.id,  // 保持原 ID（即使 BibTeX 中的 key 变了）
            sourceFile: ref.sourceFile,
            isManual: true,  // 编辑后标记为待应用
            isExpanded: ref.isExpanded,
            isEnriched: ref.isEnriched,  // 保留已补全标识（永久标签）
            isEdited: true,  // 标记为已编辑（永久标签）
            originalRawBibtex: ref.originalRawBibtex || ref.rawBibtex,  // 保存原始内容
            rawBibtex: rawBibtex.trim()
          };
        }
        return ref;
      });
      
      this._onDidReferencesChange.fire(this._references);
      return true;
    } catch (error) {
      console.error('[LiteratureService] 更新文献失败:', error);
      return false;
    }
  }
  
  /**
   * 初始化文献库（加载本地库 + 读取 bib 文件 + 对比合并）
   * 应在插件加载时调用
   */
  async initializeWithSync(): Promise<ParseResult> {
    this._isLoading = true;
    this._onDidLoadingChange.fire(true);
    
    const result: ParseResult = {
      references: [],
      errors: [],
      sourceFiles: []
    };
    
    try {
      const storageService = getLiteratureStorageService();
      
      // 1. 从本地存储加载文献库
      const localRefs = await storageService.load();
      console.log(`[LiteratureService] 从本地库加载 ${localRefs.length} 篇文献`);
      
      // 2. 从 bib 文件读取文献
      const docs = await overleafEditor.getBridge().call<Array<{path: string; content: string}>>('getAllDocsWithContent');
      
      if (!docs || !Array.isArray(docs)) {
        result.errors.push('无法获取项目文档');
        // 如果无法读取 bib 文件，至少使用本地库的数据
        this._references = localRefs.map(ref => storageService.deserializeReference(ref));
        this._onDidReferencesChange.fire(this._references);
        return result;
      }
      
      // 解析所有 bib 文件
      const bibRefs: BibReference[] = [];
      for (const doc of docs) {
        if (doc.path.endsWith('.bib')) {
          result.sourceFiles.push(doc.path);
          try {
            const refs = this.parseBibtex(doc.content, doc.path);
            bibRefs.push(...refs);
          } catch (error) {
            result.errors.push(`解析 ${doc.path} 失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // 也扫描 .tex 文件中的内联 BibTeX
      for (const doc of docs) {
        if (doc.path.endsWith('.tex')) {
          if (/@(?:article|book|inproceedings|conference|misc|techreport|phdthesis|mastersthesis)/i.test(doc.content)) {
            try {
              const refs = this.parseBibtex(doc.content, doc.path);
              if (refs.length > 0) {
                result.sourceFiles.push(doc.path);
                bibRefs.push(...refs);
              }
            } catch (error) {
              // 静默忽略
            }
          }
        }
      }
      
      console.log(`[LiteratureService] 从 bib 文件解析 ${bibRefs.length} 篇文献`);
      
      // 3. 对比合并
      const mergedRefs = this.syncBibWithLocalLibrary(bibRefs, localRefs, storageService);
      
      // 4. 更新状态
      this._references = mergedRefs;
      result.references = mergedRefs;
      this._onDidReferencesChange.fire(this._references);
      
      // 5. 保存到本地库
      await this.saveToLocalStorage();
      
      console.log(`[LiteratureService] 同步完成，共 ${mergedRefs.length} 篇文献`);
      
    } catch (error) {
      result.errors.push(`同步失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this._isLoading = false;
      this._onDidLoadingChange.fire(false);
    }
    
    return result;
  }
  
  /**
   * 同步 bib 文件和本地库
   * @param bibRefs bib 文件中的文献
   * @param localRefs 本地库中的文献
   * @param storageService 存储服务
   */
  private syncBibWithLocalLibrary(
    bibRefs: BibReference[], 
    localRefs: StoredBibReference[],
    storageService: ReturnType<typeof getLiteratureStorageService>
  ): BibReference[] {
    const result: BibReference[] = [];
    const matchedLocalIds = new Set<string>();
    
    // 遍历 bib 文件中的文献
    for (const bibRef of bibRefs) {
      // 尝试在本地库中找到匹配的文献
      let matchedLocal: StoredBibReference | undefined;
      
      for (const localRef of localRefs) {
        if (isSameReference(bibRef, localRef)) {
          matchedLocal = localRef;
          matchedLocalIds.add(localRef.id);
          break;
        }
      }
      
      if (matchedLocal) {
        // 情况 A: bib 有，本地库也有对应 → 合并（保留本地库的增强信息）
        const merged = this.mergeWithLocalRef(bibRef, matchedLocal, storageService);
        // 情况 A 不标记为待应用
        merged.isManual = false;
        result.push(merged);
        console.log(`[LiteratureService] 匹配文献: ${bibRef.id}`);
      } else {
        // 情况 B: bib 有，本地库没有 → 直接添加
        result.push(bibRef);
        console.log(`[LiteratureService] 新增文献(来自bib): ${bibRef.id}`);
      }
    }
    
    // 情况 C: 本地库有，但 bib 没有 → 标记为待应用
    for (const localRef of localRefs) {
      if (!matchedLocalIds.has(localRef.id)) {
        // 检查是否在 bibRefs 中有匹配（通过标题/作者）
        let foundInBib = false;
        for (const bibRef of bibRefs) {
          if (isSameReference(localRef, bibRef)) {
            foundInBib = true;
            break;
          }
        }
        
        if (!foundInBib) {
          const ref = storageService.deserializeReference(localRef);
          ref.isManual = true;  // 标记为待应用
          result.push(ref);
          console.log(`[LiteratureService] 本地库独有文献(待应用): ${localRef.id}`);
        }
      }
    }
    
    // 去重（按 ID）
    const uniqueRefs = new Map<string, BibReference>();
    for (const ref of result) {
      if (uniqueRefs.has(ref.id)) {
        const existing = uniqueRefs.get(ref.id)!;
        uniqueRefs.set(ref.id, this.mergeReferences(existing, ref));
      } else {
        uniqueRefs.set(ref.id, ref);
      }
    }
    
    return Array.from(uniqueRefs.values());
  }
  
  /**
   * 合并 bib 文献和本地库文献（保留本地库的增强信息）
   */
  private mergeWithLocalRef(
    bibRef: BibReference, 
    localRef: StoredBibReference,
    storageService: ReturnType<typeof getLiteratureStorageService>
  ): BibReference {
    const local = storageService.deserializeReference(localRef);
    
    // 优先使用本地库的增强信息
    return {
      ...bibRef,
      // 保留本地库的增强信息
      isEnriched: local.isEnriched || bibRef.isEnriched,
      isEdited: local.isEdited,
      originalRawBibtex: local.originalRawBibtex,
      // 显式保留本地库的标签
      tags: local.tags,
      // 如果本地库有更完整的信息，使用本地库的
      rawBibtex: (local.rawBibtex && local.rawBibtex.length > (bibRef.rawBibtex?.length || 0)) 
        ? local.rawBibtex 
        : bibRef.rawBibtex,
      // 保留 sourceFile
      sourceFile: bibRef.sourceFile || local.sourceFile
    };
  }
  
  /**
   * 保存当前文献库到本地存储
   */
  async saveToLocalStorage(): Promise<boolean> {
    const storageService = getLiteratureStorageService();
    return await storageService.save(this._references);
  }
  
  /**
   * 获取本地库中但 bib 文件中没有的文献（待应用的文献）
   */
  getPendingReferences(): BibReference[] {
    return this._references.filter(ref => ref.isManual === true);
  }
  
  /**
   * 检查并去除文献库中的重复文献
   * @returns 去重后移除的文献数量
   */
  deduplicateReferences(): number {
    const uniqueRefs: BibReference[] = [];
    let removedCount = 0;
    
    for (const ref of this._references) {
      // 检查是否已存在相同的文献
      const existingIndex = uniqueRefs.findIndex(r => isSameReference(r, ref));
      
      if (existingIndex !== -1) {
        // 找到重复文献，合并
        const existing = uniqueRefs[existingIndex];
        const merged = this.mergeReferences(existing, ref);
        uniqueRefs[existingIndex] = merged;
        removedCount++;
        console.log(`[LiteratureService] 去重合并文献: ${ref.id} -> ${existing.id}`);
      } else {
        // 新文献
        uniqueRefs.push(ref);
      }
    }
    
    if (removedCount > 0) {
      this._references = uniqueRefs;
      this._onDidReferencesChange.fire(this._references);
      // 保存到本地存储
      this.saveToLocalStorage().catch(err => {
        console.error('[LiteratureService] 去重后保存失败:', err);
      });
    }
    
    return removedCount;
  }
  
  /**
   * 为文献添加标签
   */
  addTag(id: string, tag: LiteratureTag): boolean {
    const ref = this._references.find(r => r.id === id);
    if (!ref) return false;
    
    // 初始化 tags 数组
    if (!ref.tags) {
      ref.tags = [];
    }
    
    // 检查是否已存在同名标签
    if (ref.tags.some(t => t.name === tag.name)) {
      return false;
    }
    
    ref.tags.push(tag);
    this._onDidReferencesChange.fire(this._references);
    this.saveToLocalStorage();
    return true;
  }
  
  /**
   * 从文献移除标签
   */
  removeTag(id: string, tagName: string): boolean {
    const ref = this._references.find(r => r.id === id);
    if (!ref || !ref.tags) return false;
    
    const index = ref.tags.findIndex(t => t.name === tagName);
    if (index === -1) return false;
    
    ref.tags.splice(index, 1);
    this._onDidReferencesChange.fire(this._references);
    this.saveToLocalStorage();
    return true;
  }
  
  /**
   * 获取所有已使用的标签
   */
  getAllTags(): LiteratureTag[] {
    const tagMap = new Map<string, LiteratureTag>();
    
    for (const ref of this._references) {
      if (ref.tags) {
        for (const tag of ref.tags) {
          if (!tagMap.has(tag.name)) {
            tagMap.set(tag.name, tag);
          }
        }
      }
    }
    
    return Array.from(tagMap.values());
  }
}

export { ILiteratureServiceId } from '../../platform/literature/ILiteratureService';

