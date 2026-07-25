export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  mode: ChatMode;
}

export type ChatMode = 'planner' | 'agent' | 'shell';

export interface ChatRouter {
  route(message: string, session: ChatSession): Promise<ChatMessage>;
}
