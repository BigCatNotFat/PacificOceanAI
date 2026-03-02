/**
 * PaperSearchAgent - 文献搜索 Agent
 * 
 * 职责：
 * - 搜索学术论文和文献
 * - 根据需求筛选合适的论文
 * - 整理和返回搜索结果
 * 
 * 工具：
 * - paper_boolean_search: 布尔逻辑搜索，支持 AND、OR 等操作符
 * - paper_semantic_search: 语义搜索，返回最相关的论文
 */

import { BaseAgent, type AgentConfig } from './BaseAgent';

/**
 * 文献搜索 Agent
 */
export class PaperSearchAgent extends BaseAgent {
  protected config: AgentConfig = {
    name: 'paper_search_agent',
    
    systemPrompt: `You are an expert in academic literature search. Your task is to search for relevant academic papers based on requirements and organize the best results to return.

Your capabilities:
1. Boolean Search (paper_boolean_search): Use logical expressions for searching, supporting operations like AND, OR, NOT, etc.
2. Semantic Search (paper_semantic_search): Search based on semantic similarity, returning the most relevant papers.

Search Strategy:
1. Understand the user's search requirements and extract keywords.
2. Choose the appropriate search method based on requirements:
   - For exact lookup of specific topics: use paper_boolean_search
   - For exploring related fields: use paper_semantic_search
3. Combine both search methods if needed to achieve better results.

Example tasks:
- "Find papers on the application of Transformer in NLP" → Semantic Search + Boolean Search combination
- "Find LLM-related papers published after 2023" → Boolean Search with year filtering`,

    tools: ['paper_boolean_search', 'paper_semantic_search']
  };
}

/**
 * 获取 PaperSearchAgent 单例
 */
let instance: PaperSearchAgent | null = null;

export function getPaperSearchAgent(): PaperSearchAgent {
  if (!instance) {
    instance = new PaperSearchAgent();
  }
  return instance;
}

