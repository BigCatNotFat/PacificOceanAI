/**
 * CrossRef API 服务
 * 用于查询论文元数据并补全 BibTeX 信息
 */

/** CrossRef 作者信息 */
interface CrossRefAuthor {
  given?: string;
  family?: string;
}

/** CrossRef API 返回的论文条目 */
interface CrossRefItem {
  DOI?: string;
  title?: string[];
  author?: CrossRefAuthor[];
  'container-title'?: string[];
  'short-container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  URL?: string;
  ISSN?: string[];
  type?: string;
  abstract?: string;
}

/** CrossRef 搜索结果 */
interface CrossRefSearchResult {
  status: string;
  message: {
    items?: CrossRefItem[];
    'total-results'?: number;
  };
}

/** CrossRef 单条查询结果 */
interface CrossRefWorkResult {
  status: string;
  message: CrossRefItem;
}

/** 补全结果 */
export interface EnrichResult {
  success: boolean;
  bibtex?: string;
  data?: CrossRefItem;
  error?: string;
  candidates?: Array<{ title: string; doi?: string; score: number }>;
}

/**
 * 标准化标题（用于匹配）
 */
function normalizeTitle(s: string): string {
  if (!s) return '';
  // 移除 LaTeX 命令和花括号
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\[a-zA-Z]+\s*/g, ' ');
  s = s.toLowerCase();
  s = s.replace(/[^\w\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 计算两个字符串的相似度（Jaccard 相似度）
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * 解析 BibTeX 条目，提取字段
 */
function parseBibtexFields(bibtex: string): Record<string, string> {
  const fields: Record<string, string> = {};
  
  // 提取条目类型和 key
  const typeMatch = bibtex.match(/@(\w+)\s*\{\s*([^,\s]+)/);
  if (typeMatch) {
    fields['_type'] = typeMatch[1].toLowerCase();
    fields['_key'] = typeMatch[2];
  }
  
  // 提取字段
  const fieldRegex = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|(\S+))/g;
  let match;
  while ((match = fieldRegex.exec(bibtex)) !== null) {
    const fieldName = match[1].toLowerCase();
    const value = (match[2] || match[3] || match[4] || '').trim();
    fields[fieldName] = value.replace(/\s+/g, ' ').replace(/[{}]/g, '').trim();
  }
  
  return fields;
}

/**
 * 从作者字段提取姓氏列表
 */
function parseAuthorLastNames(authorField: string): string[] {
  if (!authorField) return [];
  const authors = authorField.split(' and ').map(a => a.trim()).filter(Boolean);
  return authors.map(a => {
    if (a.includes(',')) {
      return a.split(',')[0].trim().toLowerCase();
    }
    const parts = a.split(/\s+/);
    return (parts[parts.length - 1] || '').toLowerCase();
  }).filter(Boolean);
}

/**
 * 生成引用 key
 */
function generateCitationKey(item: CrossRefItem): string {
  const authors = item.author || [];
  let firstAuthor = '';
  if (authors.length > 0 && authors[0].family) {
    firstAuthor = authors[0].family.replace(/[^\w]/g, '').toLowerCase();
  }
  
  let year = '';
  try {
    const parts = item.issued?.['date-parts'];
    if (parts && parts[0] && parts[0][0]) {
      year = String(parts[0][0]);
    }
  } catch { /* ignore */ }
  
  // 从标题中取第一个有意义的词
  let titleWord = '';
  const titles = item.title || [];
  if (titles.length > 0) {
    const words = titles[0].match(/[A-Za-z]+/g) || [];
    const skipWords = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'with']);
    for (const w of words) {
      if (!skipWords.has(w.toLowerCase()) && w.length > 2) {
        titleWord = w.toLowerCase();
        break;
      }
    }
  }
  
  return `${firstAuthor}${year}${titleWord}` || `ref${year}${titleWord}`;
}

/**
 * 将 CrossRef 数据转换为 BibTeX 格式
 */
function crossRefToBibtex(item: CrossRefItem, originalFields?: Record<string, string>): string {
  // 确定条目类型
  const typeMap: Record<string, string> = {
    'journal-article': 'article',
    'proceedings-article': 'inproceedings',
    'book-chapter': 'incollection',
    'book': 'book',
    'dissertation': 'phdthesis',
    'report': 'techreport',
    'dataset': 'misc',
  };
  const entryType = typeMap[item.type || ''] || 'article';
  
  // 使用原始 key 或生成新的
  const key = originalFields?.['_key'] || generateCitationKey(item);
  
  // 构建字段
  const fields: Record<string, string> = {};
  
  // title
  if (item.title && item.title.length > 0) {
    fields['title'] = `{${item.title[0]}}`;
  }
  
  // author
  if (item.author && item.author.length > 0) {
    const authorStrs = item.author.map(a => {
      if (a.family) {
        return a.given ? `${a.family}, ${a.given}` : a.family;
      }
      return '';
    }).filter(Boolean);
    if (authorStrs.length > 0) {
      fields['author'] = `{${authorStrs.join(' and ')}}`;
    }
  }
  
  // journal / booktitle
  if (item['container-title'] && item['container-title'].length > 0) {
    if (entryType === 'article') {
      fields['journal'] = `{${item['container-title'][0]}}`;
    } else if (entryType === 'inproceedings' || entryType === 'incollection') {
      fields['booktitle'] = `{${item['container-title'][0]}}`;
    }
  }
  
  // shortjournal (期刊缩写)
  if (item['short-container-title'] && item['short-container-title'].length > 0) {
    fields['shortjournal'] = `{${item['short-container-title'][0]}}`;
  }
  
  // year, month (没有数据也保留空字段)
  try {
    const parts = item.issued?.['date-parts'];
    if (parts && parts[0] && parts[0][0]) {
      fields['year'] = `{${parts[0][0]}}`;
      fields['month'] = parts[0][1] ? `{${parts[0][1]}}` : `{}`;
    } else {
      fields['year'] = `{}`;
      fields['month'] = `{}`;
    }
  } catch {
    fields['year'] = `{}`;
    fields['month'] = `{}`;
  }
  
  // volume (没有数据也保留空字段)
  fields['volume'] = item.volume ? `{${item.volume}}` : `{}`;
  
  // number / issue (没有数据也保留空字段)
  fields['number'] = item.issue ? `{${item.issue}}` : `{}`;
  
  // pages (没有数据也保留空字段)
  if (item.page) {
    const pages = item.page.replace(/-/g, '--').replace(/----/g, '--');
    fields['pages'] = `{${pages}}`;
  } else {
    fields['pages'] = `{}`;
  }
  
  // publisher
  if (item.publisher) {
    fields['publisher'] = `{${item.publisher}}`;
  }
  
  // DOI
  if (item.DOI) {
    fields['doi'] = `{${item.DOI}}`;
  }
  
  // URL
  if (item.URL) {
    fields['url'] = `{${item.URL}}`;
  }
  
  // ISSN
  if (item.ISSN && item.ISSN.length > 0) {
    fields['issn'] = `{${item.ISSN[0]}}`;
  }
  
  // abstract
  if (item.abstract) {
    // 清理 HTML 标签
    const cleanAbstract = item.abstract.replace(/<[^>]*>/g, '');
    fields['abstract'] = `{${cleanAbstract}}`;
  }
  
  // 合并原始字段（Crossref 没有的保留原始的）
  if (originalFields) {
    const skipFields = new Set(['_type', '_key']);
    for (const [k, v] of Object.entries(originalFields)) {
      if (skipFields.has(k)) continue;
      if (!(k in fields) && v) {
        fields[k] = `{${v}}`;
      }
    }
  }
  
  // 定义字段输出顺序
  const fieldOrder = [
    'author', 'title', 'journal', 'shortjournal', 'booktitle', 'year', 'month',
    'volume', 'number', 'pages', 'publisher', 'doi', 'url', 'issn',
    'keywords', 'abstract', 'note'
  ];
  
  // 按顺序构建输出
  const orderedFields: string[] = [];
  const added = new Set<string>();
  
  for (const fname of fieldOrder) {
    if (fname in fields) {
      orderedFields.push(`  ${fname} = ${fields[fname]}`);
      added.add(fname);
    }
  }
  
  for (const [fname, fval] of Object.entries(fields)) {
    if (!added.has(fname)) {
      orderedFields.push(`  ${fname} = ${fval}`);
    }
  }
  
  return `@${entryType}{${key},\n${orderedFields.join(',\n')}\n}`;
}

/**
 * CrossRef 服务类
 */
export class CrossRefService {
  private static readonly WORKS_URL = 'https://api.crossref.org/v1/works';
  private static readonly TIMEOUT = 15000;
  private static readonly MAX_RETRIES = 2;
  
  /**
   * 通过 DOI 获取论文信息
   */
  static async fetchByDOI(doi: string): Promise<CrossRefWorkResult> {
    const url = `${this.WORKS_URL}/${encodeURIComponent(doi.trim())}`;
    const response = await this.fetchWithRetry(url);
    return response as CrossRefWorkResult;
  }
  
  /**
   * 搜索论文
   */
  static async searchWorks(query: string, rows = 5): Promise<CrossRefSearchResult> {
    const url = `${this.WORKS_URL}?query.bibliographic=${encodeURIComponent(query)}&rows=${rows}`;
    const response = await this.fetchWithRetry(url);
    return response as CrossRefSearchResult;
  }
  
  /**
   * 带重试的 fetch
   */
  private static async fetchWithRetry(url: string): Promise<unknown> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.MAX_RETRIES; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'overleaf-ai-extension/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 429) {
          // Rate limited, wait and retry
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    
    throw lastError || new Error('Request failed');
  }
  
  /**
   * 通过 BibTeX 补全信息
   * 优先使用 DOI，否则通过标题搜索
   */
  static async enrichFromBibtex(bibtex: string): Promise<EnrichResult> {
    try {
      const fields = parseBibtexFields(bibtex);
      const doi = fields.doi;
      const title = fields.title || '';
      const author = fields.author || '';
      const yearRaw = fields.year || '';
      
      let year: number | undefined;
      const yearMatch = yearRaw.match(/\d{4}/);
      if (yearMatch) {
        year = parseInt(yearMatch[0], 10);
      }
      
      // 1. 如果有 DOI，直接查询
      if (doi) {
        try {
          const result = await this.fetchByDOI(doi);
          if (result.message) {
            return {
              success: true,
              bibtex: crossRefToBibtex(result.message, fields),
              data: result.message
            };
          }
        } catch (err) {
          // DOI 查询失败，继续尝试标题搜索
          console.warn('[CrossRef] DOI lookup failed, trying title search:', err);
        }
      }
      
      // 2. 通过标题搜索
      if (!title) {
        return {
          success: false,
          error: '缺少标题信息，无法搜索'
        };
      }
      
      // 构建搜索查询（标题 + 第一作者姓氏 + 年份）
      const hints: string[] = [];
      const authorLastNames = parseAuthorLastNames(author);
      if (authorLastNames.length > 0) {
        hints.push(authorLastNames[0]);
      }
      if (year) {
        hints.push(String(year));
      }
      
      const query = [title, ...hints].join(' ');
      const searchResult = await this.searchWorks(query, 8);
      const items = searchResult.message?.items || [];
      
      if (items.length === 0) {
        return {
          success: false,
          error: '未找到匹配的论文'
        };
      }
      
      // 找最匹配的结果
      const normalizedTitle = normalizeTitle(title);
      let bestItem: CrossRefItem | null = null;
      let bestScore = 0;
      const candidates: Array<{ title: string; doi?: string; score: number }> = [];
      
      for (const item of items) {
        const itemTitle = (item.title && item.title[0]) || '';
        const normalizedItemTitle = normalizeTitle(itemTitle);
        
        // 标题相似度
        let score = similarity(normalizedTitle, normalizedItemTitle);
        
        // 作者匹配加分
        if (authorLastNames.length > 0 && item.author) {
          const itemAuthors = item.author.map(a => (a.family || '').toLowerCase());
          const overlap = authorLastNames.filter(n => itemAuthors.includes(n)).length;
          score += 0.1 * (overlap / authorLastNames.length);
        }
        
        // 年份匹配加分
        if (year && item.issued?.['date-parts']?.[0]?.[0]) {
          const itemYear = item.issued['date-parts'][0][0];
          if (itemYear === year) {
            score += 0.05;
          } else if (Math.abs(itemYear - year) <= 1) {
            score += 0.02;
          }
        }
        
        candidates.push({
          title: itemTitle,
          doi: item.DOI,
          score
        });
        
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }
      
      // 相似度阈值
      if (!bestItem || bestScore < 0.5) {
        return {
          success: false,
          error: '未找到足够匹配的论文',
          candidates: candidates.slice(0, 3)
        };
      }
      
      // 如果有 DOI，获取完整信息
      if (bestItem.DOI) {
        try {
          const fullResult = await this.fetchByDOI(bestItem.DOI);
          if (fullResult.message) {
            return {
              success: true,
              bibtex: crossRefToBibtex(fullResult.message, fields),
              data: fullResult.message
            };
          }
        } catch {
          // 使用搜索结果
        }
      }
      
      return {
        success: true,
        bibtex: crossRefToBibtex(bestItem, fields),
        data: bestItem
      };
      
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : '请求失败'
      };
    }
  }
  
  /**
   * 直接通过标题搜索（用于只有标题的情况）
   */
  static async searchByTitle(title: string): Promise<EnrichResult> {
    const dummyBibtex = `@article{temp,\n  title = {${title}}\n}`;
    return this.enrichFromBibtex(dummyBibtex);
  }
}

