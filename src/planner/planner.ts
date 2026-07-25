import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { StepStatus, PlanStatus,
  TaskPlan, PlanStep, StepAction,
  PlannerConfig, ParsedIntent, WorkflowTemplate
} from './types.js';
import { CLIController } from '../cli/controller.js';
import { InstallerManager } from '../installer/manager.js';
import { ToolRegistry } from '../registry/registry.js';

const DEFAULT_CONFIG: PlannerConfig = {
  maxParallelSteps: 3,
  defaultTimeout: 60_000,
  defaultRetries: 2,
  retryDelay: 2000,
};

const ACTION_PATTERNS: { action: StepAction; patterns: RegExp[] }[] = [
  { action: 'install',  patterns: [/\b(install|add|get|set up|setup|provision)\b/i] },
  { action: 'update',   patterns: [/\b(update|upgrade|refresh)\b/i] },
  { action: 'verify',   patterns: [/\b(verify|check|validate|confirm)\b/i] },
  { action: 'run',      patterns: [/\b(run|start|launch|execute|open)\b/i] },
  { action: 'stop',     patterns: [/\b(stop|kill|halt|terminate)\b/i] },
  { action: 'build',    patterns: [/\b(build|compile|make|package)\b/i] },
  { action: 'test',     patterns: [/\b(test|lint|validate)\b/i] },
  { action: 'deploy',   patterns: [/\b(deploy|publish|release|ship)\b/i] },
  { action: 'download', patterns: [/\b(download|fetch|pull|grab)\b/i] },
  { action: 'configure', patterns: [/\b(config|configure|set|adjust)\b/i] },
];

const TOOL_NAME_MAP: Record<string, string> = {
  'node': 'nodejs', 'nodejs': 'nodejs', 'npm': 'npm',
  'python': 'python', 'pip': 'pip', 'uv': 'uv',
  'git': 'git', 'cargo': 'cargo', 'rust': 'cargo',
  'go': 'go', 'golang': 'go',
  'docker': 'docker', 'brew': 'homebrew', 'homebrew': 'homebrew',
  'winget': 'winget', 'choco': 'chocolatey', 'chocolatey': 'chocolatey',
  'codex': 'codex', 'openai': 'codex',
  'claude': 'claude-code', 'anthropic': 'claude-code',
  'openclaw': 'openclaw', 'claw': 'openclaw',
  '9router': '9router', 'router': '9router',
  'opencode': 'opencode', 'hermes': 'hermes',
};

export class Planner extends EventEmitter {
  private cli: CLIController;
  private installer: InstallerManager;
  private registry: ToolRegistry;
  private config: PlannerConfig;
  private plans: Map<string, TaskPlan> = new Map();
  private templates: Map<string, WorkflowTemplate> = new Map();
  private cancelled = new Set<string>();

  constructor(
    cli: CLIController,
    installer: InstallerManager,
    registry: ToolRegistry,
    config?: Partial<PlannerConfig>
  ) {
    super();
    this.cli = cli;
    this.installer = installer;
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerBuiltinTemplates();
  }

  parseIntent(input: string): ParsedIntent {
    let bestAction: StepAction = 'run';
    let bestConfidence = 0;
    for (const { action, patterns } of ACTION_PATTERNS) {
      for (const pat of patterns) {
        if (pat.test(input)) {
          const confidence = Math.min(pat.source.length / 20, 1);
          if (confidence > bestConfidence) {
            bestAction = action;
            bestConfidence = confidence;
          }
        }
      }
    }
    const target = this.extractTarget(input);
    return { action: bestAction, target, modifiers: this.extractModifiers(input), confidence: bestConfidence || 0.5 };
  }

  private extractTarget(input: string): string | undefined {
    const lower = input.toLowerCase();
    for (const [name, id] of Object.entries(TOOL_NAME_MAP)) {
      if (lower.includes(name)) return id;
    }
    return undefined;
  }

  private extractModifiers(input: string): Record<string, string> {
    const mods: Record<string, string> = {};
    const versionMatch = input.match(/\bv?([\d]+\.[\d]+[\.\d]*)\b/);
    if (versionMatch) mods.version = versionMatch[1];
    if (/\bglobal\b/i.test(input)) mods.scope = 'global';
    if (/\blocal\b/i.test(input)) mods.scope = 'local';
    if (/\bforce\b/i.test(input)) mods.force = 'true';
    return mods;
  }

  async generatePlan(goal: string): Promise<TaskPlan> {
    const intent = this.parseIntent(goal);
    const steps: PlanStep[] = [];
    let index = 0;

    if (intent.target) {
      const tool = this.registry.getTool(intent.target);
      const installed = this.registry.getInstalledTool(intent.target);

      switch (intent.action) {
        case 'install':
          if (!installed) {
            steps.push(this.makeStep(index++, 'verify', `Check ${tool?.name || intent.target}`, { command: tool?.verifier.command, toolId: intent.target }));
            steps.push(this.makeStep(index++, 'install', `Install ${tool?.name || intent.target}`, { command: tool?.installer.command, toolId: intent.target, dependsOn: [steps[0].id] }));
          } else {
            steps.push(this.makeStep(index++, 'verify', `${tool?.name || intent.target} already installed (v${installed.version})`, { command: tool?.verifier.command, toolId: intent.target }));
          }
          break;
        case 'update':
          steps.push(this.makeStep(index++, 'update', `Update ${tool?.name || intent.target}`, { command: tool?.updater.command, toolId: intent.target }));
          steps.push(this.makeStep(index++, 'verify', 'Verify update', { command: tool?.verifier.command, toolId: intent.target, dependsOn: [steps[0].id] }));
          break;
        case 'verify':
          steps.push(this.makeStep(index++, 'verify', `Verify ${tool?.name || intent.target}`, { command: tool?.verifier.command, toolId: intent.target }));
          break;
        case 'run':
          if (tool) {
            steps.push(this.makeStep(index++, 'check', `Check ${tool.name}`, { command: tool.verifier.command, toolId: intent.target }));
            steps.push(this.makeStep(index++, 'run', `Start ${tool.name}`, { command: tool.executable.name, toolId: intent.target, dependsOn: [steps[0].id] }));
          }
          break;
        case 'stop':
          steps.push(this.makeStep(index++, 'run', `Stop ${tool?.name || intent.target}`, { command: `pkill -f '${tool?.executable.name || intent.target}'`, toolId: intent.target }));
          break;
        default:
          steps.push(this.makeStep(index++, intent.action, goal, {}));
      }
    } else {
      steps.push(this.makeStep(index++, 'custom', goal, { command: goal }));
    }

    const plan: TaskPlan = {
      id: randomUUID(), goal, steps,
      dependencies: this.buildDependencies(steps), status: 'pending' as PlanStatus, createdAt: new Date(),
    };
    this.plans.set(plan.id, plan);
    this.emit('planCreated', plan);
    return plan;
  }

  private makeStep(index: number, action: StepAction, description: string, opts: { command?: string; toolId?: string; timeout?: number; dependsOn?: string[] }): PlanStep {
    return {
      id: randomUUID(), index, action, description,
      command: opts.command, toolId: opts.toolId,
      timeout: opts.timeout || this.config.defaultTimeout,
      retries: 0, maxRetries: this.config.defaultRetries, status: 'pending' as StepStatus,
    };
  }

  private buildDependencies(steps: PlanStep[]): TaskPlan['dependencies'] {
    const deps: TaskPlan['dependencies'] = [];
    for (const step of steps) {
      if (step.dependsOn) {
        for (const from of step.dependsOn) {
          deps.push({ from, to: step.id, type: 'blocks' });
        }
      }
    }
    return deps;
  }

  async executePlan(planId: string): Promise<TaskPlan | undefined> {
    const plan = this.plans.get(planId);
    if (!plan) return undefined;
    plan.status = 'running';
    this.emit('planStarted', plan);
    this.cancelled.delete(planId);

    for (const step of plan.steps) {
      if (this.cancelled.has(planId)) {
        plan.status = 'cancelled';
        this.emit('planCancelled', plan);
        return plan;
      }
      if (step.dependsOn?.length) {
        const depsMet = step.dependsOn.every(depId => {
          const dep = plan.steps.find(s => s.id === depId);
          return dep?.status === 'completed';
        });
        if (!depsMet) { step.status = 'skipped'; continue; }
      }
      await this.executeStep(step);
    }

    plan.status = plan.steps.every(s => s.status === 'completed' || s.status === 'skipped') ? 'completed' : 'failed';
    plan.completedAt = new Date();
    this.emit('planCompleted', plan);
    return plan;
  }

  private async executeStep(step: PlanStep): Promise<void> {
    step.status = 'running';
    this.emit('stepStarted', step);
    let lastError: string | undefined;

    while (step.retries <= step.maxRetries) {
      try {
        if (!step.command) {
          step.status = 'completed';
          step.result = { exitCode: 0, stdout: 'no command', stderr: '', duration: 0 };
          break;
        }
        const result = await this.cli.execute(step.command.split(' ')[0], step.command.split(' ').slice(1), { timeout: step.timeout });
        step.result = { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, duration: result.duration };
        if (result.exitCode === 0) { step.status = 'completed'; break; }
        lastError = result.stderr || `exit code ${result.exitCode}`;
        step.retries++;
        if (step.retries <= step.maxRetries) {
          this.emit('stepRetrying', { step, attempt: step.retries });
          await new Promise(r => setTimeout(r, this.config.retryDelay * step.retries));
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        step.retries++;
        if (step.retries <= step.maxRetries) await new Promise(r => setTimeout(r, this.config.retryDelay * step.retries));
      }
    }

    if (step.status !== 'completed') {
      step.status = 'failed';
      this.emit('stepFailed', { step, error: lastError });
    }
    this.emit('stepCompleted', step);
  }

  cancelPlan(planId: string): boolean {
    this.cancelled.add(planId);
    const plan = this.plans.get(planId);
    if (plan) { plan.status = 'cancelled'; this.emit('planCancelled', plan); return true; }
    return false;
  }

  private registerBuiltinTemplates(): void {
    this.templates.set('setup-dev-env', {
      id: 'setup-dev-env', name: 'Setup Development Environment',
      description: 'Install Node.js, Python, Git and verify',
      triggers: ['setup', 'environment', 'dev env'],
      steps: [
        { index: 0, action: 'install', description: 'Install Git', command: 'apt-get install -y git', toolId: 'git', retries: 0, maxRetries: 2 },
        { index: 1, action: 'install', description: 'Install Node.js', command: 'apt-get install -y nodejs', toolId: 'nodejs', retries: 0, maxRetries: 2 },
        { index: 2, action: 'install', description: 'Install Python', command: 'apt-get install -y python3', toolId: 'python', retries: 0, maxRetries: 2 },
        { index: 3, action: 'verify', description: 'Verify all', command: 'node --version && python3 --version && git --version', retries: 0, maxRetries: 1 },
      ],
    });
    this.templates.set('setup-ai-agents', {
      id: 'setup-ai-agents', name: 'Setup AI Agents',
      description: 'Install Codex, Claude Code, OpenClaw, 9Router',
      triggers: ['ai', 'agents', 'codex', 'claude', 'openclaw'],
      steps: [
        { index: 0, action: 'install', description: 'Install Codex CLI', command: 'npm install -g @openai/codex', toolId: 'codex', retries: 0, maxRetries: 3 },
        { index: 1, action: 'install', description: 'Install Claude Code', command: 'npm install -g @anthropic-ai/claude-code', toolId: 'claude-code', retries: 0, maxRetries: 3 },
        { index: 2, action: 'install', description: 'Install OpenClaw', command: 'npm install -g openclaw', toolId: 'openclaw', retries: 0, maxRetries: 3 },
        { index: 3, action: 'install', description: 'Install 9Router', command: 'npm install -g 9router@latest', toolId: '9router', retries: 0, maxRetries: 3 },
        { index: 4, action: 'verify', description: 'Verify all agents', command: 'codex --version && claude --version && openclaw --version && 9router --version', retries: 0, maxRetries: 1 },
      ],
    });
    this.templates.set('check-all-updates', {
      id: 'check-all-updates', name: 'Check All Updates',
      description: 'Check for updates on all installed tools',
      triggers: ['update', 'updates', 'upgrade'],
      steps: [
        { index: 0, action: 'check', description: 'Check npm updates', command: 'npm outdated -g', retries: 0, maxRetries: 1 },
        { index: 1, action: 'check', description: 'Check pip updates', command: 'pip list --outdated', retries: 0, maxRetries: 1 },
      ],
    });
  }

  matchTemplate(input: string): WorkflowTemplate | undefined {
    const lower = input.toLowerCase();
    for (const template of this.templates.values()) {
      if (template.triggers.some(t => lower.includes(t))) return template;
    }
    return undefined;
  }

  async executeTemplate(templateId: string): Promise<TaskPlan | undefined> {
    const template = this.templates.get(templateId);
    if (!template) return undefined;
    const plan: TaskPlan = {
      id: randomUUID(), goal: template.name,
      steps: template.steps.map(s => ({ ...s, id: randomUUID(), status: 'pending' as StepStatus })),
      dependencies: [],
      status: 'pending',
      createdAt: new Date(),
    };
    this.plans.set(plan.id, plan);
    this.emit('planCreated', plan);
    return this.executePlan(plan.id);
  }

  registerTemplate(template: WorkflowTemplate): void { this.templates.set(template.id, template); }
  listTemplates(): WorkflowTemplate[] { return Array.from(this.templates.values()); }
  getPlan(planId: string): TaskPlan | undefined { return this.plans.get(planId); }
  listPlans(): TaskPlan[] { return Array.from(this.plans.values()); }
}
