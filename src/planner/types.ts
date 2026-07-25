export interface TaskPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  dependencies: Dependency[];
  status: PlanStatus;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export type PlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PlanStep {
  id: string;
  index: number;
  action: StepAction;
  description: string;
  command?: string;
  toolId?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  retries: number;
  maxRetries: number;
  status: StepStatus;
  result?: StepResult;
  dependsOn?: string[];
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export type StepAction =
  | 'install' | 'update' | 'verify' | 'run' | 'stop'
  | 'build' | 'test' | 'deploy' | 'check' | 'download'
  | 'configure' | 'custom';

export interface Dependency {
  from: string;
  to: string;
  type: 'blocks' | 'enables';
}

export interface PlannerConfig {
  maxParallelSteps: number;
  defaultTimeout: number;
  defaultRetries: number;
  retryDelay: number;
}

export interface ParsedIntent {
  action: StepAction;
  target?: string;
  modifiers: Record<string, string>;
  confidence: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  steps: TemplateStep[];
}

export interface TemplateStep {
  index: number;
  action: StepAction;
  description: string;
  command?: string;
  toolId?: string;
  retries: number;
  maxRetries: number;
  dependsOn?: string[];
}
