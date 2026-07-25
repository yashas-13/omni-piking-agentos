export interface OpenAIConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: ToolCall[];
  latency: number;
}

export interface StreamChunk {
  delta: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokens: number;
}

export interface ModelInfo {
  model: string;
  available: boolean;
  maxTokens: number;
}
