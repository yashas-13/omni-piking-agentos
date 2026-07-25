import { EventEmitter } from 'events';
import { CLIController } from '../cli/controller.js';
import { ProcessManager } from '../process/manager.js';
import { ToolRegistry } from '../registry/registry.js';
import { randomUUID } from 'crypto';

export interface AgentDefinition {
  id: string;
  name: string;
  type: 'cli' | 'service' | 'worker';
  toolId: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  port?: number;
  autoRestart?: boolean;
  maxRetries?: number;
  healthCheck?: string;
}

export interface AgentInstance {
  id: string;
  definition: AgentDefinition;
  processId?: string;
  status: AgentStatus;
  startedAt?: Date;
  context: AgentContext;
  retryCount: number;
}

export type AgentStatus = 'idle' | 'running' | 'error' | 'stopped' | 'restarting';

export interface AgentContext {
  workspaceId?: string;
  projectId?: string;
  variables: Record<string, unknown>;
  history: AgentMessage[];
}

export interface AgentMessage {
  id: string;
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

export class AgentHarness extends EventEmitter {
  private cli: CLIController;
  private processManager: ProcessManager;
  private registry: ToolRegistry;
  private agents: Map<string, AgentInstance> = new Map();
  private definitions: Map<string, AgentDefinition> = new Map();

  constructor(
    cli: CLIController,
    processManager: ProcessManager,
    registry: ToolRegistry
  ) {
    super();
    this.cli = cli;
    this.processManager = processManager;
    this.registry = registry;

    this.processManager.on('processExit', ({ id, exitCode }) => {
      this.handleProcessExit(id, exitCode);
    });
  }

  registerAgent(definition: AgentDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  async start(agentId: string, context?: Partial<AgentContext>): Promise<AgentInstance> {
    const definition = this.definitions.get(agentId);
    if (!definition) {
      throw new Error(`Agent '${agentId}' not registered`);
    }

    const existing = this.agents.get(agentId);
    if (existing?.status === 'running') {
      return existing;
    }

    const instance: AgentInstance = {
      id: randomUUID(),
      definition,
      status: 'running',
      startedAt: new Date(),
      context: {
        variables: context?.variables || {},
        history: context?.history || []
      },
      retryCount: 0
    };

    this.agents.set(agentId, instance);

    const args = definition.args || [];
    const proc = this.cli.startProcess(definition.command, args, {
      env: definition.env,
      shell: true
    });

    instance.processId = this.processManager.track(
      agentId,
      definition.name,
      `${definition.command} ${args.join(' ')}`,
      this.cli.getProcess(proc) as any,
      definition.port
    ).id;

    this.emit('agentStarted', instance);
    return instance;
  }

  async stop(agentId: string): Promise<boolean> {
    const instance = this.agents.get(agentId);
    if (!instance || instance.status !== 'running') return false;

    if (instance.processId) {
      this.processManager.kill(instance.processId);
    }

    instance.status = 'stopped';
    this.emit('agentStopped', instance);
    return true;
  }

  async restart(agentId: string): Promise<boolean> {
    const instance = this.agents.get(agentId);
    if (!instance) return false;

    instance.status = 'restarting';
    this.emit('agentRestarting', instance);

    await this.stop(agentId);
    
    setTimeout(async () => {
      try {
        await this.start(agentId, {
          variables: instance.context.variables,
          history: instance.context.history
        });
      } catch (err) {
        this.emit('agentRestartFailed', { agentId, error: err });
      }
    }, 1000);

    return true;
  }

  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  listRunning(): AgentInstance[] {
    return this.list().filter(a => a.status === 'running');
  }

  async sendMessage(agentId: string, content: string): Promise<AgentMessage> {
    const instance = this.agents.get(agentId);
    if (!instance) throw new Error(`Agent '${agentId}' not found`);

    const message: AgentMessage = {
      id: randomUUID(),
      timestamp: new Date(),
      role: 'user',
      content
    };

    instance.context.history.push(message);
    this.emit('messageSent', { agentId, message });

    return message;
  }

  getContext(agentId: string): AgentContext | undefined {
    return this.agents.get(agentId)?.context;
  }

  setContextVariable(agentId: string, key: string, value: unknown): void {
    const instance = this.agents.get(agentId);
    if (instance) {
      instance.context.variables[key] = value;
    }
  }

  private handleProcessExit(processId: string, exitCode: number | null): void {
    for (const [agentId, instance] of this.agents) {
      if (instance.processId === processId) {
        if (exitCode !== 0 && instance.definition.autoRestart) {
          const maxRetries = instance.definition.maxRetries || 3;
          if (instance.retryCount < maxRetries) {
            instance.retryCount++;
            instance.status = 'restarting';
            this.emit('agentAutoRestarting', { agentId, retryCount: instance.retryCount });
            
            setTimeout(() => {
              this.start(agentId, {
                variables: instance.context.variables,
                history: instance.context.history
              });
            }, 2000 * instance.retryCount);
          } else {
            instance.status = 'error';
            this.emit('agentMaxRetriesReached', { agentId });
          }
        } else {
          instance.status = exitCode === 0 ? 'stopped' : 'error';
        }
        
        this.emit('agentProcessExit', { agentId, exitCode });
        break;
      }
    }
  }

  async checkHealth(agentId: string): Promise<boolean> {
    const instance = this.agents.get(agentId);
    if (!instance || instance.status !== 'running') return false;

    const definition = instance.definition;
    if (!definition.healthCheck) return true;

    try {
      const result = await this.cli.execute(
        definition.healthCheck.split(' ')[0],
        definition.healthCheck.split(' ').slice(1),
        { timeout: 5000 }
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}
