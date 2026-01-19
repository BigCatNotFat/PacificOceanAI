/**
 * API 配置文件
 * 
 * 集中管理所有外部 API 的 URL 配置
 */

/** API 基础域名 */
export const API_BASE_DOMAIN = 'https://api.silicondream.top';

/**
 * API 端点配置
 */
export const API_ENDPOINTS = {
  /** LLM API 基础 URL（用于 OpenAI 兼容接口） */
  LLM_BASE_URL: `${API_BASE_DOMAIN}/v1`,
  
  /** 遥测数据上报端点 */
  TELEMETRY: `${API_BASE_DOMAIN}/api/telemetry`,
  
  /** 论文布尔搜索 API */
  PAPER_BOOLEAN_SEARCH: `${API_BASE_DOMAIN}/api/paper_boolean_search`,
  
  /** 论文语义搜索 API */
  PAPER_SEMANTIC_SEARCH: `${API_BASE_DOMAIN}/api/paper_semantic_search`,
  
  /** 启动码查询页面（用于 UI 显示） */
  ACTIVATION_QUERY_PAGE: `${API_BASE_DOMAIN}/query`,
} as const;

/** API 端点类型 */
export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

