import { LLMProvider, LLMProviderType, LLMRequest, LLMResponse } from './types.js';

const OLLAMA_DEFAULT = 'http://localhost:11434';
const OLLAMA_MODEL = 'tinyllama';
const OPENAI_COMPAT_DEFAULT = 'http://localhost:11434/v1';

export class LLMProviderManager {
  private providers: LLMProvider[] = [];
  private activeProvider: LLMProvider | null = null;

  async detect(): Promise<LLMProvider | null> {
    this.providers = [];

    const ollama = await this.checkOllama();
    if (ollama) this.providers.push(ollama);

    const openaiCompat = await this.checkOpenAICompatible();
    if (openaiCompat) this.providers.push(openaiCompat);

    const openaiDirect = await this.checkOpenAIDirect();
    if (openaiDirect) this.providers.push(openaiDirect);

    this.activeProvider = this.providers.find(p => p.available) || null;
    return this.activeProvider;
  }

  async query(request: LLMRequest): Promise<LLMResponse | null> {
    if (!this.activeProvider || !this.activeProvider.available) return null;

    const start = Date.now();
    try {
      if (this.activeProvider.type === 'ollama') {
        return await this.queryOllama(request, start);
      } else if (this.activeProvider.type === 'openai-compatible') {
        return await this.queryOpenAICompatible(request, start);
      } else if (this.activeProvider.type === 'openai') {
        return await this.queryOpenAIDirect(request, start);
      }
    } catch {
      return null;
    }
    return null;
  }

  private async checkOllama(): Promise<LLMProvider | null> {
    try {
      const response = await fetch(`${OLLAMA_DEFAULT}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const data = await response.json() as any;
        const models = data.models || [];
        const model = models.find((m: any) => m.name?.includes('tiny') || m.name?.includes('qwen')) || models[0];
        return {
          type: 'ollama', name: 'Ollama',
          baseUrl: OLLAMA_DEFAULT,
          model: model?.name || OLLAMA_MODEL,
          available: true, latency: 0, maxTokens: 2048,
        };
      }
    } catch {}
    return null;
  }

  private async checkOpenAICompatible(): Promise<LLMProvider | null> {
    try {
      const baseUrl = process.env.OPENAI_COMPAT_URL || OPENAI_COMPAT_DEFAULT;
      const apiKey = process.env.OPENAI_COMPAT_KEY || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}/models`, {
        headers, signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const data = await response.json() as any;
        const model = data?.data?.[0]?.id || 'default';
        return {
          type: 'openai-compatible', name: 'OpenAI-Compatible',
          baseUrl, model, available: true, latency: 0, maxTokens: 4096,
        };
      }
    } catch {}
    return null;
  }

  private async checkOpenAIDirect(): Promise<LLMProvider | null> {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) return null;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        return {
          type: 'openai', name: 'OpenAI Direct',
          baseUrl, model, available: true, latency: 0, maxTokens: 4096,
        };
      }
    } catch {}
    return null;
  }

  private async queryOpenAIDirect(request: LLMRequest, start: number): Promise<LLMResponse> {
    const baseUrl = this.activeProvider!.baseUrl;
    const apiKey = process.env.OPENAI_API_KEY || '';
    const model = this.activeProvider!.model;
    const messages: any[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: request.maxTokens || 1024, temperature: request.temperature || 0.3 }),
    });
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    return {
      content,
      tokens: { prompt: data.usage?.prompt_tokens || 0, completion: data.usage?.completion_tokens || 0 },
      latency: Date.now() - start,
      provider: 'openai',
    };
  }

  private async queryOllama(request: LLMRequest, start: number): Promise<LLMResponse> {
    const response = await fetch(`${this.activeProvider!.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.activeProvider!.model,
        prompt: request.prompt,
        system: request.systemPrompt,
        stream: false,
        options: {
          num_predict: request.maxTokens || 512,
          temperature: request.temperature || 0.3,
        },
      }),
    });
    const data = await response.json() as any;
    return {
      content: data.response || '',
      tokens: { prompt: data.prompt_eval_count || 0, completion: data.eval_count || 0 },
      latency: Date.now() - start,
      provider: 'ollama',
    };
  }

  private async queryOpenAICompatible(request: LLMRequest, start: number): Promise<LLMResponse> {
    const baseUrl = this.activeProvider!.baseUrl;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OPENAI_COMPAT_KEY || '';
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const messages: any[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        model: this.activeProvider!.model,
        messages,
        max_tokens: request.maxTokens || 512,
        temperature: request.temperature || 0.3,
      }),
    });
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    return {
      content,
      tokens: { prompt: data.usage?.prompt_tokens || 0, completion: data.usage?.completion_tokens || 0 },
      latency: Date.now() - start,
      provider: this.activeProvider!.type,
    };
  }

  getProvider(): LLMProvider | null { return this.activeProvider; }
  isAvailable(): boolean { return this.activeProvider?.available ?? false; }
}
