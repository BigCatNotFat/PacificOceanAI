/**
 * Overleaf Bridge 类型定义
 */

// ============ 消息类型 ============

/** 请求消息类型 */
export interface OverleafBridgeRequest {
  type: 'OVERLEAF_BRIDGE_REQUEST';
  requestId: string;
  method: string;
  args?: any[];
}

/** 响应消息类型 */
export interface OverleafBridgeResponse {
  type: 'OVERLEAF_BRIDGE_RESPONSE';
  requestId: string;
  success: boolean;
  result?: any;
  error?: string;
}

/** 待处理的请求 */
export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: number;
}

// ============ 数据类型 ============

/** 光标位置 */
export interface CursorPosition {
  line: number;
  column: number;
  offset: number;
}

/** 指定行的范围信息 */
export interface LineRange {
  lineNumber: number;
  from: number;
  to: number;
  text: string;
}

/** replaceFirstMatch 返回结果 */
export interface ReplaceFirstMatchResult {
  found: boolean;
  from: number;
  to: number;
  searchText: string;
  replaceText: string;
  matchesCount: number;
}

/** 行数据 */
export interface LineData {
  lineNumber: number;
  text: string;
}

/** 读取行范围结果 */
export interface ReadLinesResult {
  lines: LineData[];
  totalLines: number;
  startLine: number;
  endLine: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

/** 读取整个文件结果 */
export interface ReadEntireFileResult {
  lines: LineData[];
  totalLines: number;
  content: string;
}

/** 文件信息 */
export interface FileInfo {
  totalLines: number;
  totalLength: number;
  fileName: string | null;
}

// ============ 选区操作相关类型 ============

/** 选区详细信息 */
export interface SelectionInfo {
  /** 选区起始位置 (0-based offset) */
  from: number;
  /** 选区结束位置 (0-based offset) */
  to: number;
  /** 选中的文本内容 */
  text: string;
  /** 是否为空选区 */
  isEmpty: boolean;
}

/** 文本操作类型 */
export type TextActionType = 'expand' | 'condense' | 'polish' | 'translate';

/** 文本操作请求 */
export interface TextActionRequest {
  /** 操作类型 */
  action: TextActionType;
  /** 选中的原始文本 */
  text: string;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 选择的模型 ID（可选） */
  modelId?: string;
}

/** 文本操作结果 */
export interface TextActionResult {
  /** 是否成功 */
  success: boolean;
  /** 操作类型 */
  action: TextActionType;
  /** 原始文本 */
  originalText: string;
  /** 处理后的文本 */
  resultText?: string;
  /** 错误信息 */
  error?: string;
}

/** 替换选区结果 */
export interface ReplaceSelectionResult {
  success: boolean;
}

// ============ 文本操作预览相关类型 ============

/** 预览模式状态 */
export type PreviewState = 'idle' | 'previewing' | 'accepted' | 'rejected';

/** 预览信息 */
export interface TextActionPreview {
  /** 预览 ID */
  id: string;
  /** 操作类型 */
  action: TextActionType;
  /** 原始文本 */
  originalText: string;
  /** 新文本（AI 生成的结果） */
  newText: string;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 预览状态 */
  state: PreviewState;
}

/** 预览请求 */
export interface ShowPreviewRequest {
  type: 'OVERLEAF_SHOW_PREVIEW_REQUEST';
  data: {
    id: string;
    action: TextActionType;
    originalText: string;
    newText: string;
    from: number;
    to: number;
  };
}

/** 预览确认/取消请求 */
export interface PreviewDecisionRequest {
  type: 'OVERLEAF_PREVIEW_DECISION_REQUEST';
  data: {
    id: string;
    accepted: boolean;
  };
}

/** 预览决策结果 */
export interface PreviewDecisionResult {
  type: 'OVERLEAF_PREVIEW_DECISION_RESULT';
  data: {
    id: string;
    accepted: boolean;
    success: boolean;
  };
}