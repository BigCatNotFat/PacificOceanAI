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
};

