export type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  isHtml?: boolean;
};

