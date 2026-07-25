import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { CLIController } from '../cli/controller.js';
import { ProcessManager } from '../process/manager.js';
import { AgentHarness } from '../agent/harness.js';
import { randomUUID } from 'crypto';

export interface StreamChannel {
  id: string;
  type: 'process' | 'agent' | 'plan' | 'log';
  targetId: string;
  clients: Set<WebSocket>;
}

export class StreamManager {
  private wss: WebSocketServer;
  private cli: CLIController;
  private processManager: ProcessManager;
  private agentHarness: AgentHarness;
  private channels: Map<string, StreamChannel> = new Map();
  private clientChannels: Map<WebSocket, Set<string>> = new Map();

  constructor(
    server: Server,
    cli: CLIController,
    processManager: ProcessManager,
    agentHarness: AgentHarness
  ) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.cli = cli;
    this.processManager = processManager;
    this.agentHarness = agentHarness;
    this.setupConnectionHandler();
    this.setupCLIListeners();
    this.setupProcessListeners();
    this.setupAgentListeners();
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = randomUUID();
      this.clientChannels.set(ws, new Set());

      ws.send(JSON.stringify({ type: 'connected', clientId }));

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        const channelIds = this.clientChannels.get(ws);
        if (channelIds) {
          for (const chId of channelIds) {
            const ch = this.channels.get(chId);
            if (ch) {
              ch.clients.delete(ws);
              if (ch.clients.size === 0) this.channels.delete(chId);
            }
          }
        }
        this.clientChannels.delete(ws);
      });

      ws.on('error', () => {
        this.clientChannels.delete(ws);
      });
    });
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case 'subscribe':
        this.subscribe(ws, msg.channelType, msg.targetId);
        break;
      case 'unsubscribe':
        this.unsubscribe(ws, msg.channelId);
        break;
      case 'list':
        ws.send(JSON.stringify({ type: 'channels', channels: this.listChannels() }));
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;
    }
  }

  subscribe(ws: WebSocket, channelType: string, targetId: string): string {
    const channelId = `${channelType}:${targetId}`;
    let channel = this.channels.get(channelId);
    if (!channel) {
      channel = { id: channelId, type: channelType as any, targetId, clients: new Set() };
      this.channels.set(channelId, channel);
    }
    channel.clients.add(ws);
    this.clientChannels.get(ws)?.add(channelId);
    ws.send(JSON.stringify({ type: 'subscribed', channelId }));
    return channelId;
  }

  unsubscribe(ws: WebSocket, channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.clients.delete(ws);
      this.clientChannels.get(ws)?.delete(channelId);
      if (channel.clients.size === 0) this.channels.delete(channelId);
    }
    ws.send(JSON.stringify({ type: 'unsubscribed', channelId }));
  }

  broadcast(channelId: string, data: any): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const payload = JSON.stringify(data);
    for (const client of channel.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  broadcastAll(data: any): void {
    const payload = JSON.stringify(data);
    for (const [ws] of this.clientChannels) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private setupCLIListeners(): void {
    this.cli.on('output', ({ id, stream, data }) => {
      this.broadcastAll({ type: 'cli:output', processId: id, stream, data });
      // Also broadcast to process-specific channel
      this.broadcast(`process:${id}`, { type: 'process:output', processId: id, stream, data });
    });
  }

  private setupProcessListeners(): void {
    this.processManager.on('processTracked', (proc) => {
      this.broadcastAll({ type: 'process:started', process: proc });
    });

    this.processManager.on('processExit', ({ id, exitCode }) => {
      this.broadcastAll({ type: 'process:exit', processId: id, exitCode });
    });

    this.processManager.on('processError', ({ id, error }) => {
      this.broadcastAll({ type: 'process:error', processId: id, error: String(error) });
    });
  }

  private setupAgentListeners(): void {
    this.agentHarness.on('agentStarted', (instance) => {
      this.broadcastAll({ type: 'agent:started', agent: { id: instance.definition.id, name: instance.definition.name } });
    });

    this.agentHarness.on('agentStopped', (instance) => {
      this.broadcastAll({ type: 'agent:stopped', agent: { id: instance.definition.id } });
    });

    this.agentHarness.on('agentProcessExit', ({ agentId, exitCode }) => {
      this.broadcastAll({ type: 'agent:exit', agentId, exitCode });
    });
  }

  setupPlannerListeners(planner: import('../planner/planner.js').Planner): void {
    planner.on('planStarted', (data) => {
      this.broadcastAll({ type: 'plan:started', ...data });
    });
    planner.on('planCompleted', (data) => {
      this.broadcastAll({ type: 'plan:completed', ...data });
    });
    planner.on('stepStarted', (data) => {
      this.broadcastAll({ type: 'plan:stepStarted', ...data });
    });
    planner.on('stepOutput', (data) => {
      this.broadcastAll({ type: 'plan:stepOutput', ...data });
    });
    planner.on('stepCompleted', (data) => {
      this.broadcastAll({ type: 'plan:stepCompleted', ...data });
    });
    planner.on('stepFailed', (data) => {
      this.broadcastAll({ type: 'plan:stepFailed', ...data });
    });
    planner.on('stepRetrying', (data) => {
      this.broadcastAll({ type: 'plan:stepRetrying', ...data });
    });
  }

  setupChatListeners(chatEngine: import('../chat/engine.js').ChatEngine): void {
    chatEngine.on('stepEvent', (data) => {
      this.broadcastAll({ type: 'chat:stepEvent', ...data });
    });
  }


  setupReasoningListeners(reasoning: import('../reasoning/engine.js').ReasoningEngine): void {
    reasoning.on('thinking', (data) => {
      this.broadcastAll({ type: 'reasoning:thinking', ...data });
    });
    reasoning.on('thoughtComplete', (data) => {
      this.broadcastAll({ type: 'reasoning:complete', id: data.id, confidence: data.confidence, llmAugmented: data.llmAugmented,
        chainOfThought: data.chainOfThought, intent: data.intent, conflicts: data.conflicts?.length || 0,
        planSteps: data.executionPlan?.steps?.length || 0 });
    });
    reasoning.on('outcomeRecorded', (data) => {
      this.broadcastAll({ type: 'reasoning:outcome', ...data });
    });
  }

  listChannels(): { id: string; type: string; targetId: string; clientCount: number }[] {
    return Array.from(this.channels.values()).map(ch => ({
      id: ch.id, type: ch.type, targetId: ch.targetId, clientCount: ch.clients.size,
    }));
  }

  getClientCount(): number {
    return this.clientChannels.size;
  }
}
