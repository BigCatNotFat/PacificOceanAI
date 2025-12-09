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
