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
    
    systemPrompt: `你是一位专业的学术文献搜索专家。你的任务是根据需求搜索相关的学术论文，并整理返回最合适的结果。

你的能力：
1. 布尔搜索（paper_boolean_search）：使用逻辑表达式搜索，支持 AND、OR、NOT 等操作
2. 语义搜索（paper_semantic_search）：根据语义相似度搜索，返回最相关的论文

搜索策略：
1. 理解用户的搜索需求，提取关键词
2. 根据需求选择合适的搜索方式：
   - 精确查找特定主题：使用 paper_boolean_search
   - 探索相关领域：使用 paper_semantic_search
3. 可以组合使用两种搜索方式获得更好的结果

示例任务：
- "找关于 Transformer 在 NLP 中应用的论文" → 语义搜索 + 布尔搜索组合
- "找 2023 年以后的 LLM 相关论文" → 布尔搜索加年份过滤`,

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

