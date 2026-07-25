import { EventEmitter } from 'events';
import { OpenAIConfig, ChatMessage, ChatResponse, StreamChunk, ToolCall, ToolDefinition, ModelInfo } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;

export class OpenAIClient extends EventEmitter {
  private config: OpenAIConfig;
  private available = false;

  constructor(config?: Partial<OpenAIConfig>) {
    super();
    this.config = {
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl: config?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: config?.model || process.env.OPENAI_MODEL || DEFAULT_MODEL,
      maxTokens: config?.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: config?.temperature ?? DEFAULT_TEMPERATURE,
    };
    this.available = !!this.config.apiKey;
    if (this.available) console.log(`[openai] Client ready: ${this.config.model} @ ${this.config.baseUrl}`);
    else console.log('[openai] No API key — client disabled');
  }

  isAvailable(): boolean { return this.available; }
  getModel(): string { return this.config.model || DEFAULT_MODEL; }
  getBaseUrl(): string { return this.config.baseUrl || ''; }

  async chat(messages: ChatMessage[], options?: { model?: string; maxTokens?: number; temperature?: number; tools?: ToolDefinition[] }): Promise<ChatResponse> {
    if (!this.available) throw new Error('OpenAI client not configured (no API key)');
    const start = Date.now();
    const body: any = {
      model: options?.model || this.config.model,
      messages,
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    };
    if (options?.tools?.length) body.tools = options.tools;

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    return {
      id: data.id,
      content: choice?.message?.content || '',
      model: data.model,
      finishReason: choice?.finish_reason || 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      toolCalls: choice?.message?.tool_calls,
      latency: Date.now() - start,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: { model?: string; maxTokens?: number }): AsyncGenerator<StreamChunk> {
    if (!this.available) throw new Error('OpenAI client not configured');
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: options?.model || this.config.model,
        messages, max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: this.config.temperature, stream: true,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI streaming error ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) yield { delta: delta.content };
          if (parsed.choices?.[0]?.finish_reason) yield { delta: '', finishReason: parsed.choices[0].finish_reason };
        } catch {}
      }
    }
  }

  async toolCall(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResponse> {
    return this.chat(messages, { tools });
  }

  getModelInfo(): ModelInfo {
    return { model: this.config.model || DEFAULT_MODEL, available: this.available, maxTokens: DEFAULT_MAX_TOKENS };
  }
}
