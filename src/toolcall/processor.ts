import { EventEmitter } from 'events';
import { ToolDef, getBuiltinTools } from './registry.js';
import { ToolCall } from '../openai/types.js';

export interface ToolCallResult { id: string; name: string; success: boolean; output: string; duration: number }

export class ToolCallProcessor extends EventEmitter {
  private tools: Map<string, ToolDef> = new Map();
  constructor() { super(); for (const t of getBuiltinTools()) this.tools.set(t.name, t); }
  registerTool(tool: ToolDef): void { this.tools.set(tool.name, tool); }
  getAvailableTools(): ToolDef[] { return Array.from(this.tools.values()); }

  parseToolCalls(response: string): ToolCall[] {
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) return parsed.filter((c: any) => c.type === 'function' && c.function);
      if (parsed.tool_calls) return parsed.tool_calls;
    } catch {}
    return [];
  }

  async executeToolCall(call: ToolCall): Promise<ToolCallResult> {
    const start = Date.now();
    const name = call.function.name;
    const tool = this.tools.get(name);
    if (!tool) return { id: call.id, name, success: false, output: `Unknown tool: ${name}`, duration: Date.now() - start };
    try {
      const args = JSON.parse(call.function.arguments);
      this.emit('toolCallStarted', { id: call.id, name, args });
      const output = await tool.execute(args);
      const result = { id: call.id, name, success: true, output, duration: Date.now() - start };
      this.emit('toolCallCompleted', result);
      return result;
    } catch (err) {
      const result = { id: call.id, name, success: false, output: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
      this.emit('toolCallFailed', result);
      return result;
    }
  }

  async executeAll(calls: ToolCall[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    for (const call of calls) { results.push(await this.executeToolCall(call)); }
    return results;
  }
}
