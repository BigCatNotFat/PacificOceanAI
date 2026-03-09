/**
 * 工具调用信息（用于从存储恢复工具调用 UI）
 */
export interface StoredToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status?: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'error';
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  isHtml?: boolean;
  /** UI 消息类型（用于区分普通消息 / 思考块 / 工具调用等） */
  type?: 'normal' | 'action' | 'thinking' | 'tool' | 'tool_status' | 'error' | 'warning';
  /** 附加元数据（例如思考时长、文件名、工具名等） */
  metadata?: {
    thinkingTime?: number;
    actionIcon?: string;
    fileName?: string;
    collapsed?: boolean;
    toolName?: string;
  };
  /** 工具调用列表（从存储恢复时使用） */
  toolCalls?: StoredToolCall[];
  /** 附带的图片列表（base64 data URL），用于多模态输入 */
  images?: string[];
};

