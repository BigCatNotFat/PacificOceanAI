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
  BibEntryType 
} from '../../platform/literature/ILiteratureService';
import { injectable } from '../../platform/instantiation';
import { overleafEditor } from '../editor/OverleafEditor';

/**
 * BibTeX 解析器
 */
class BibtexParser {
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
      
      // 解析字段
      const fields = this.parseFields(fieldsStr);
      
      const reference: BibReference = {
        id: key,
        type,
        title: fields.title || '',
        authors: fields.author || '',
        year: fields.year || '',
        journal: fields.journal,
        booktitle: fields.booktitle,
        volume: fields.volume,
        number: fields.number,
        pages: fields.pages,
        doi: fields.doi,
        url: fields.url,
        abstract: fields.abstract,
        publisher: fields.publisher,
        sourceFile,
        rawBibtex: match[0],
        isExpanded: false
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
  }
  
  getReferences(): BibReference[] {
    return [...this._references];
  }
  
  isLoading(): boolean {
    return this._isLoading;
  }
  
  async scanAndParseReferences(): Promise<ParseResult> {
    this._isLoading = true;
    this._onDidLoadingChange.fire(true);
    
    const result: ParseResult = {
      references: [],
      errors: [],
      sourceFiles: []
    };
    
    try {
      // 通过桥接获取所有文档内容
      const docs = await overleafEditor.getBridge().call<Array<{path: string; content: string}>>('getAllDocsWithContent');
      
      if (!docs || !Array.isArray(docs)) {
        result.errors.push('无法获取项目文档');
        return result;
      }
      
      // 扫描所有 .bib 文件
      for (const doc of docs) {
        if (doc.path.endsWith('.bib')) {
          result.sourceFiles.push(doc.path);
          try {
            const refs = this.parseBibtex(doc.content, doc.path);
            result.references.push(...refs);
          } catch (error) {
            result.errors.push(`解析 ${doc.path} 失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // 也扫描 .tex 文件中的内联 BibTeX（某些项目可能将引用写在 tex 文件中）
      for (const doc of docs) {
        if (doc.path.endsWith('.tex')) {
          // 检查是否包含 BibTeX 条目
          if (/@(?:article|book|inproceedings|conference|misc|techreport|phdthesis|mastersthesis)/i.test(doc.content)) {
            try {
              const refs = this.parseBibtex(doc.content, doc.path);
              if (refs.length > 0) {
                result.sourceFiles.push(doc.path);
                result.references.push(...refs);
              }
            } catch (error) {
              // 静默忽略 tex 文件中的解析错误
            }
          }
        }
      }
      
      // 去重（按 ID）
      const uniqueRefs = new Map<string, BibReference>();
      for (const ref of result.references) {
        if (!uniqueRefs.has(ref.id)) {
          uniqueRefs.set(ref.id, ref);
        }
      }
      result.references = Array.from(uniqueRefs.values());
      
      // 更新内部状态
      this._references = result.references;
      this._onDidReferencesChange.fire(this._references);
      
    } catch (error) {
      result.errors.push(`扫描失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this._isLoading = false;
      this._onDidLoadingChange.fire(false);
    }
    
    return result;
  }
  
  parseBibtex(bibtex: string, sourceFile?: string): BibReference[] {
    return BibtexParser.parse(bibtex, sourceFile);
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
}

export { ILiteratureServiceId } from '../../platform/literature/ILiteratureService';

