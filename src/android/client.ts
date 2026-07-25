import { EventEmitter } from 'events';

export interface AgentOSClientConfig {
  baseUrl: string;
  wsUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  officialSource: string;
  platform: string[];
  tags: string[];
}

export interface InstalledToolInfo {
  id: string;
  toolId: string;
  version: string;
  status: string;
  installedAt: string;
  updatedAt: string;
}

export interface AgentInfo {
  id: string;
  definition: { id: string; name: string; type: string; port?: number };
  status: string;
  startedAt?: string;
}

export interface ProcessInfo {
  id: string;
  name: string;
  pid: number;
  status: string;
  startedAt: string;
  port?: number;
}

export interface PlanInfo {
  id: string;
  goal: string;
  steps: any[];
  status: string;
  createdAt: string;
}

export interface SystemStatus {
  processes: { total: number; running: number; paused: number; stopped: number; error: number };
  agents: number;
  downloads: number;
  workspaces: number;
  tools: number;
  installed: number;
  plans: number;
}

export class AgentOSClient extends EventEmitter {
  private config: AgentOSClientConfig;
  private ws: any = null;
  private wsReconnectTimer: any = null;

  constructor(config: AgentOSClientConfig) {
    super();
    this.config = { timeout: 30_000, ...config };
    if (!this.config.wsUrl) {
      this.config.wsUrl = config.baseUrl.replace('http', 'ws') + '/ws';
    }
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(this.config.timeout!) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async health() { return this.request<{ status: string; timestamp: string }>('GET', '/health'); }
  async status() { return this.request<SystemStatus>('GET', '/status'); }

  async listTools(category?: string, platform?: string) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (platform) params.set('platform', platform);
    const qs = params.toString() ? `?${params}` : '';
    return this.request<ToolInfo[]>('GET', `/tools${qs}`);
  }
  async getTool(id: string) { return this.request<ToolInfo>('GET', `/tools/${id}`); }
  async installTool(toolId: string) { return this.request<any>('POST', '/tools/install', { toolId }); }
  async updateTool(toolId: string) { return this.request<any>('POST', '/tools/update', { toolId }); }
  async uninstallTool(toolId: string) { return this.request<{ success: boolean }>('DELETE', `/tools/${toolId}`); }
  async listInstalled() { return this.request<InstalledToolInfo[]>('GET', '/tools/installed'); }
  async checkUpdates() { return this.request<Record<string, { current: string; available: string }>>('GET', '/tools/updates'); }

  async listAgents() { return this.request<AgentInfo[]>('GET', '/agents'); }
  async listRunningAgents() { return this.request<AgentInfo[]>('GET', '/agents/running'); }
  async startAgent(agentId: string, context?: any) { return this.request<AgentInfo>('POST', '/agents/start', { agentId, context }); }
  async stopAgent(agentId: string) { return this.request<{ success: boolean }>('POST', '/agents/stop', { agentId }); }
  async restartAgent(agentId: string) { return this.request<{ success: boolean }>('POST', '/agents/restart', { agentId }); }

  async listProcesses(status?: string) { return this.request<ProcessInfo[]>('GET', `/processes${status ? `?status=${status}` : ''}`); }
  async processStats() { return this.request<SystemStatus['processes']>('GET', '/processes/stats'); }
  async pauseProcess(id: string) { return this.request<{ success: boolean }>('POST', `/processes/${id}/pause`); }
  async resumeProcess(id: string) { return this.request<{ success: boolean }>('POST', `/processes/${id}/resume`); }
  async killProcess(id: string, signal?: string) { return this.request<{ success: boolean }>('POST', `/processes/${id}/kill`, { signal }); }

  async plan(goal: string) { return this.request<PlanInfo>('POST', '/planner/plan', { goal }); }
  async executePlan(planId: string) { return this.request<PlanInfo>('POST', '/planner/execute', { planId }); }
  async cancelPlan(planId: string) { return this.request<{ success: boolean }>('POST', '/planner/cancel', { planId }); }
  async listPlans() { return this.request<PlanInfo[]>('GET', '/planner/plans'); }
  async getPlan(planId: string) { return this.request<PlanInfo>('GET', `/planner/plans/${planId}`); }
  async listTemplates() { return this.request<any[]>('GET', '/planner/templates'); }
  async executeTemplate(templateId: string) { return this.request<PlanInfo>('POST', '/planner/template/execute', { templateId }); }
  async parseIntent(input: string) { return this.request<any>('POST', '/planner/parse', { input }); }

  async listWorkspaces() { return this.request<any[]>('GET', '/workspaces'); }
  async createWorkspace(name: string, projectPath?: string) { return this.request<any>('POST', '/workspaces', { name, projectPath }); }
  async deleteWorkspace(id: string, deleteFiles?: boolean) { return this.request<{ success: boolean }>('DELETE', `/workspaces/${id}`, { deleteFiles }); }

  async listDownloads() { return this.request<any[]>('GET', '/downloads'); }
  async download(url: string, options?: any) { return this.request<any>('POST', '/downloads', { url, options }); }

  connectWebSocket(): void {
    if (!this.config.wsUrl) return;
    try {
      this.ws = new (globalThis as any).WebSocket(this.config.wsUrl);
      this.ws.onopen = () => this.emit('ws:connected');
      this.ws.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          this.emit('ws:message', data);
          if (data.type) this.emit(`ws:${data.type}`, data);
        } catch {}
      };
      this.ws.onclose = () => { this.emit('ws:disconnected'); this.scheduleReconnect(); };
      this.ws.onerror = (err: any) => this.emit('ws:error', err);
    } catch (err) {
      this.emit('ws:error', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => { this.wsReconnectTimer = null; this.connectWebSocket(); }, 5000);
  }

  disconnectWebSocket(): void {
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  subscribe(channelType: string, targetId: string): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'subscribe', channelType, targetId }));
  }

  unsubscribe(channelId: string): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'unsubscribe', channelId }));
  }
}
