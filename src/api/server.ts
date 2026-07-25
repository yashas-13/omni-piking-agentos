import express, { Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createServer, Server as HttpServer } from 'http';
import { ToolRegistry } from '../registry/registry.js';
import { InstallerManager } from '../installer/manager.js';
import { ProcessManager } from '../process/manager.js';
import { AgentHarness } from '../agent/harness.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { DownloadManager } from '../download/manager.js';
import { Planner } from '../planner/planner.js';
import { ChatEngine } from '../chat/engine.js';
import { ReasoningEngine } from '../reasoning/engine.js';
import { OpenAIClient } from '../openai/client.js';
import { TerminalRenderer } from '../terminal/renderer.js';
import { ConversationState } from '../conversation/state.js';
import { ToolCallProcessor } from '../toolcall/processor.js';
import { SandboxManager } from '../sandbox/manager.js';
import { CodeSearch } from '../search/code-search.js';
import { ShellOperations } from '../shell/operations.js';
import { SecurityManager } from '../security/manager.js';
import { UpdateManager } from '../update/manager.js';
import { VMManager } from '../vm/manager.js';

export interface APIConfig { port: number; host: string; }

export class APIServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private server: any;
  private config: APIConfig;
  private registry: ToolRegistry;
  private installer: InstallerManager;
  private processManager: ProcessManager;
  private agentHarness: AgentHarness;
  private workspaceManager: WorkspaceManager;
  private downloadManager: DownloadManager;
  private planner: Planner;
  private chatEngine: ChatEngine;
  private reasoningEngine: ReasoningEngine;
  private openaiClient: OpenAIClient;
  private terminalRenderer: TerminalRenderer;
  private conversationState: ConversationState;
  private toolCallProcessor: ToolCallProcessor;
  private sandboxManager: SandboxManager;
  private codeSearch: CodeSearch;
  private shellOps: ShellOperations;
  private securityManager: SecurityManager;
  private updateManager: UpdateManager;
  private vmManager: VMManager;
  private dashboardHtml: string | null = null;

  constructor(config: APIConfig, registry: ToolRegistry, installer: InstallerManager, processManager: ProcessManager, agentHarness: AgentHarness, workspaceManager: WorkspaceManager, downloadManager: DownloadManager, planner: Planner, chatEngine: ChatEngine, reasoningEngine: ReasoningEngine, openaiClient: OpenAIClient, terminalRenderer: TerminalRenderer, conversationState: ConversationState, toolCallProcessor: ToolCallProcessor, sandboxManager: SandboxManager, codeSearch: CodeSearch, shellOps: ShellOperations, securityManager: SecurityManager, updateManager: UpdateManager, vmManager: VMManager) {
    this.config = config;
    this.registry = registry;
    this.installer = installer;
    this.processManager = processManager;
    this.agentHarness = agentHarness;
    this.workspaceManager = workspaceManager;
    this.downloadManager = downloadManager;
    this.planner = planner;
    this.chatEngine = chatEngine;
    this.reasoningEngine = reasoningEngine;
    this.openaiClient = openaiClient;
    this.terminalRenderer = terminalRenderer;
    this.conversationState = conversationState;
    this.toolCallProcessor = toolCallProcessor;
    this.sandboxManager = sandboxManager;
    this.codeSearch = codeSearch;
    this.shellOps = shellOps;
    this.securityManager = securityManager;
    this.updateManager = updateManager;
    this.vmManager = vmManager;
    this.app = express();
    this.app.use(express.json());
    // CORS
    this.app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });
    // Error handler
    this.app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON', message: err.message });
      }
      console.error('[api] Error:', err.message);
      res.status(500).json({ error: 'Internal server error', message: err.message });
    });
    this.httpServer = createServer(this.app);
    this.loadDashboard();
    this.setupRoutes();
  }

  getHttpServer(): HttpServer { return this.httpServer; }

  private loadDashboard(): void {
    for (const p of [join(process.cwd(), 'dist', 'dashboard', 'index.html'), join(process.cwd(), 'src', 'dashboard', 'index.html')]) {
      if (existsSync(p)) { this.dashboardHtml = readFileSync(p, 'utf-8'); return; }
    }
  }

  private setupRoutes(): void {
    this.app.get('/dashboard', (_req, res) => { this.dashboardHtml ? res.type('html').send(this.dashboardHtml) : res.status(404).send('Dashboard not found'); });
    this.app.get('/', (_req, res) => { res.redirect('/dashboard'); });
    this.app.get('/health', (_req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });

    // Tools
    this.app.get('/tools', (req, res) => { res.json(this.registry.listTools(req.query.category as string, req.query.platform as string)); });
    this.app.get('/tools/installed', (_req, res) => { res.json(this.registry.listInstalled()); });
    this.app.get('/tools/updates', async (_req, res) => { try { res.json(Object.fromEntries(await this.installer.checkForUpdates())); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.get('/tools/:id', (req, res) => { const t = this.registry.getTool(req.params.id); t ? res.json(t) : res.status(404).json({ error: 'Not found' }); });
    this.app.post('/tools/install', async (req, res) => { try { res.json(await this.installer.install(req.body.toolId)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/tools/update', async (req, res) => { try { res.json(await this.installer.update(req.body.toolId)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.delete('/tools/:id', async (req, res) => { try { res.json({ success: await this.installer.uninstall(req.params.id) }); } catch (e) { res.status(500).json({ error: String(e) }); } });

    // Agents
    this.app.get('/agents', (_req, res) => { res.json(this.agentHarness.list()); });
    this.app.get('/agents/running', (_req, res) => { res.json(this.agentHarness.listRunning()); });
    this.app.post('/agents/start', async (req, res) => { try { res.json(await this.agentHarness.start(req.body.agentId, req.body.context)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/agents/stop', async (req, res) => { res.json({ success: await this.agentHarness.stop(req.body.agentId) }); });
    this.app.post('/agents/restart', async (req, res) => { res.json({ success: await this.agentHarness.restart(req.body.agentId) }); });

    // Processes
    this.app.get('/processes', (req, res) => { res.json(this.processManager.list(req.query.status as any)); });
    this.app.get('/processes/stats', (_req, res) => { res.json(this.processManager.getStats()); });
    this.app.post('/processes/:id/pause', (req, res) => { res.json({ success: this.processManager.pause(req.params.id) }); });
    this.app.post('/processes/:id/resume', (req, res) => { res.json({ success: this.processManager.resume(req.params.id) }); });
    this.app.post('/processes/:id/kill', (req, res) => { res.json({ success: this.processManager.kill(req.params.id, req.body.signal) }); });

    // Workspaces
    this.app.get('/workspaces', (_req, res) => { res.json(this.workspaceManager.list()); });
    this.app.post('/workspaces', (req, res) => { res.json(this.workspaceManager.create(req.body.name, req.body.projectPath)); });
    this.app.delete('/workspaces/:id', (req, res) => { res.json({ success: this.workspaceManager.delete(req.params.id, req.body.deleteFiles) }); });

    // Downloads
    this.app.get('/downloads', (_req, res) => { res.json(this.downloadManager.list()); });
    this.app.get('/downloads/active', (_req, res) => { res.json(this.downloadManager.listActive()); });
    this.app.post('/downloads', async (req, res) => { try { res.json(await this.downloadManager.download(req.body.url, req.body.options)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/downloads/:id/pause', (req, res) => { res.json({ success: this.downloadManager.pause(req.params.id) }); });
    this.app.post('/downloads/:id/resume', (req, res) => { res.json({ success: this.downloadManager.resume(req.params.id) }); });

    // Planner
    this.app.post('/planner/plan', async (req, res) => { try { res.json(await this.planner.generatePlan(req.body.goal)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/planner/execute', async (req, res) => { try { res.json(await this.planner.executePlan(req.body.planId)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/planner/cancel', (req, res) => { res.json({ success: this.planner.cancelPlan(req.body.planId) }); });
    this.app.get('/planner/plans', (_req, res) => { res.json(this.planner.listPlans()); });
    this.app.get('/planner/plans/:id', (req, res) => { const p = this.planner.getPlan(req.params.id); p ? res.json(p) : res.status(404).json({ error: 'Not found' }); });
    this.app.get('/planner/templates', (_req, res) => { res.json(this.planner.listTemplates()); });
    this.app.post('/planner/template/execute', async (req, res) => { try { res.json(await this.planner.executeTemplate(req.body.templateId)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/planner/parse', (req, res) => { res.json(this.planner.parseIntent(req.body.input)); });

    // Chat
    this.app.get('/chat/sessions', (_req, res) => { res.json(this.chatEngine.listSessions()); });
    this.app.post('/chat/sessions', (req, res) => { res.json(this.chatEngine.createSession(req.body.title)); });
    this.app.get('/chat/sessions/:id', (req, res) => { const s = this.chatEngine.getSession(req.params.id); s ? res.json(s) : res.status(404).json({ error: 'Not found' }); });
    this.app.delete('/chat/sessions/:id', (req, res) => { res.json({ success: this.chatEngine.deleteSession(req.params.id) }); });
    this.app.post('/chat/sessions/:id/message', async (req, res) => { try { res.json(await this.chatEngine.sendMessage(req.params.id, req.body.content)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    // execute-plan route removed — plans auto-execute via chat
    this.app.post('/chat/sessions/:id/clear', (req, res) => { res.json({ success: this.chatEngine.clearSession(req.params.id) }); });



    // OpenAI
    // OpenAI
    this.app.post('/openai/chat', async (req, res) => {
      try {
        let messages = req.body.messages;
        if (!messages && req.body.message) {
          messages = [{ role: 'user', content: req.body.message }];
        }
        res.json(await this.openaiClient.chat(messages, req.body.options));
      } catch (e) { res.status(500).json({ error: String(e) }); }
    });
    this.app.get('/openai/status', (_req, res) => { res.json({ available: this.openaiClient.isAvailable(), model: this.openaiClient.getModel(), baseUrl: this.openaiClient.getBaseUrl() }); });
    this.app.post('/openai/config', (req, res) => {
      const { apiKey, baseUrl, model } = req.body;
      if (apiKey) process.env.OPENAI_API_KEY = apiKey;
      if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl;
      if (model) process.env.OPENAI_MODEL = model;
      res.json({ success: true, available: !!apiKey, model: model || this.openaiClient.getModel() });
    });

    // Terminal
    this.app.get('/terminal/dashboard', (_req, res) => { const data = { tools: this.registry.listTools().map(t => ({ name: t.name, status: this.registry.getInstalledTool(t.id) ? 'installed' : 'available' })), agents: this.agentHarness.list().map(a => ({ name: a.definition.name, status: a.status, port: a.definition.port })), processes: this.processManager.getStats(), sessions: this.chatEngine.listSessions().length, plans: this.planner.listPlans().length, uptime: process.uptime().toFixed(0) + 's' }; res.type('text').send(this.terminalRenderer.renderDashboard(data)); });

    // Conversations
    this.app.get('/conversations', (_req, res) => { res.json(this.conversationState.listSessions()); });
    this.app.post('/conversations', (req, res) => { res.json(this.conversationState.createSession(req.body.title, req.body.model)); });
    this.app.get('/conversations/:id', (req, res) => { const s = this.conversationState.getSession(req.params.id); s ? res.json({ ...s, messages: this.conversationState.getHistory(req.params.id) }) : res.status(404).json({ error: 'Not found' }); });
    this.app.post('/conversations/:id/messages', (req, res) => { res.json(this.conversationState.addMessage(req.params.id, req.body.role, req.body.content, req.body.tokens)); });
    this.app.delete('/conversations/:id', (req, res) => { res.json({ success: this.conversationState.deleteSession(req.params.id) }); });

    // Tool Calls
    this.app.post('/toolcalls/execute', async (req, res) => { try { res.json(await this.toolCallProcessor.executeToolCall(req.body.toolCall)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.get('/toolcalls/tools', (_req, res) => { res.json(this.toolCallProcessor.getAvailableTools().map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))); });

    // Sandbox
    this.app.post('/sandbox/create', (req, res) => { res.json(this.sandboxManager.createSandbox(req.body.name)); });
    this.app.post('/sandbox/execute', (req, res) => { try { res.json(this.sandboxManager.execute(req.body.sandboxId, req.body.command, req.body.options)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.get('/sandbox/list', (_req, res) => { res.json(this.sandboxManager.listSandboxes()); });
    this.app.delete('/sandbox/:id', (req, res) => { res.json({ success: this.sandboxManager.destroy(req.params.id) }); });

    // Search
    this.app.post('/search/code', (req, res) => { res.json(this.codeSearch.search(req.body.query, req.body.path, req.body.options)); });
    this.app.post('/search/files', (req, res) => { res.json(this.codeSearch.searchFiles(req.body.pattern, req.body.path)); });
    this.app.get('/search/file', (req, res) => { res.type('text').send(this.codeSearch.getFileContent(req.query.path as string, Number(req.query.start), Number(req.query.end))); });

    // Shell
    this.app.get('/shell/shells', (_req, res) => { res.json(this.shellOps.getAvailableShells()); });
    this.app.post('/shell/execute', async (req, res) => { res.json(await this.shellOps.execute(req.body.command, req.body.options)); });

    // Reasoning
    this.app.post('/reasoning/think', async (req, res) => { try { res.json(await this.reasoningEngine.think(req.body.input)); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.get('/reasoning/patterns', (_req, res) => { res.json(this.reasoningEngine.getPatterns()); });
    this.app.get('/reasoning/context', (_req, res) => { res.json(this.reasoningEngine.getRecentContext()); });
    this.app.get('/reasoning/llm', (_req, res) => { res.json(this.reasoningEngine.getLLMProvider() || { type: 'none', name: 'None', model: 'N/A', available: false }); });

    // Security
    this.app.get('/security/policy', (_req, res) => { res.json(this.securityManager.getPolicy()); });
    this.app.post('/security/policy', (req, res) => { this.securityManager.updatePolicy(req.body); res.json({ success: true }); });
    this.app.post('/security/check', (req, res) => { res.json({ allowed: this.securityManager.isCommandAllowed(req.body.command) }); });

    // Updates
    this.app.get('/updates/check', async (_req, res) => { try { res.json(await this.updateManager.checkAll()); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/updates/update', async (req, res) => { try { res.json({ success: await this.updateManager.updateTool(req.body.toolId) }); } catch (e) { res.status(500).json({ error: String(e) }); } });
    this.app.post('/updates/update-all', async (_req, res) => { try { res.json(Object.fromEntries(await this.updateManager.updateAll())); } catch (e) { res.status(500).json({ error: String(e) }); } });

    // VMs
    this.app.get('/vms', (_req, res) => { res.json(this.vmManager.list()); });
    this.app.post('/vms', (req, res) => { res.json(this.vmManager.create(req.body.name, req.body.image)); });
    this.app.post('/vms/:id/start', (req, res) => { res.json({ success: this.vmManager.start(req.params.id) }); });
    this.app.post('/vms/:id/stop', (req, res) => { res.json({ success: this.vmManager.stop(req.params.id) }); });
    this.app.post('/vms/:id/snapshot', (req, res) => { res.json(this.vmManager.snapshot(req.params.id, req.body.name)); });
    this.app.delete('/vms/:id', (req, res) => { res.json({ success: this.vmManager.delete(req.params.id) }); });
    this.app.get('/vms/:id/snapshots', (req, res) => { res.json(this.vmManager.listSnapshots(req.params.id)); });

    // Status
    this.app.get('/status', (_req, res) => { res.json({ processes: this.processManager.getStats(), agents: this.agentHarness.listRunning().length, downloads: this.downloadManager.listActive().length, workspaces: this.workspaceManager.list().length, tools: this.registry.listTools().length, installed: this.registry.listInstalled().length, plans: this.planner.listPlans().length, sessions: this.chatEngine.listSessions().length, reasoning_available: this.reasoningEngine.getLLMProvider()?.available ?? false }); });
    this.app.get('/logs', (_req, res) => { res.json({ entries: [], message: 'Structured log aggregation ready' }); });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(`[api] listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => { this.server ? this.server.close(() => resolve()) : resolve(); });
  }
}
