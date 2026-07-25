// ─── Core Reasoning Types ───────────────────────────────────────

export type ReasoningAction =
  | 'install' | 'update' | 'verify' | 'run' | 'stop'
  | 'build' | 'test' | 'deploy' | 'check' | 'download'
  | 'configure' | 'search' | 'diagnose' | 'fix' | 'optimize'
  | 'explain' | 'summarize' | 'compose' | 'decompose' | 'custom';

export type Confidence = 'high' | 'medium' | 'low' | 'uncertain';

export interface ReasoningIntent {
  action: ReasoningAction;
  target?: string;
  modifiers: Record<string, string>;
  confidence: number;
  confidenceLevel: Confidence;
  raw: string;
  entities: IntentEntity[];
  temporal?: TemporalHint;
  conditions?: ConditionalHint[];
  compound: boolean;
  subIntents?: ReasoningIntent[];
}

export interface IntentEntity {
  type: 'tool' | 'action' | 'modifier' | 'target' | 'time' | 'condition';
  value: string;
  normalized: string;
  confidence: number;
}

export interface TemporalHint {
  type: 'immediate' | 'scheduled' | 'recurring' | 'deferred';
  value?: string;
}

export interface ConditionalHint {
  condition: string;
  action: string;
  fallback?: string;
}

// ─── Goal Decomposition ────────────────────────────────────────

export interface GoalNode {
  id: string;
  description: string;
  type: 'compound' | 'atomic' | 'conditional' | 'loop';
  status: GoalStatus;
  children: GoalNode[];
  intents: ReasoningIntent[];
  priority: number;
  estimatedDuration: number;
  requirements: string[];
  results?: GoalResult[];
}

export type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'skipped';

export interface GoalResult {
  goalId: string;
  success: boolean;
  output: string;
  duration: number;
  timestamp: Date;
}

// ─── DAG Planning ──────────────────────────────────────────────

export interface DAGNode {
  id: string;
  goalId: string;
  description: string;
  action: ReasoningAction;
  command?: string;
  toolId?: string;
  dependencies: string[];
  dependents: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  retries: number;
  maxRetries: number;
  timeout: number;
  result?: StepResult;
  parallelizable: boolean;
  estimatedDuration: number;
  priority: number;
}

export interface DAG {
  id: string;
  nodes: Map<string, DAGNode>;
  rootNodes: string[];
  leafNodes: string[];
  criticalPath: string[];
}

export interface StepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timestamp: Date;
}

// ─── Resource Oracle ───────────────────────────────────────────

export interface ResourceState {
  installedTools: InstalledResource[];
  availableTools: AvailableResource[];
  diskSpace: SpaceInfo;
  memory: MemoryInfo;
  processes: ProcessInfo[];
  network: NetworkState;
  compatibility: CompatibilityMap;
}

export interface InstalledResource {
  toolId: string;
  name: string;
  version: string;
  path?: string;
  status: 'running' | 'stopped' | 'error';
  port?: number;
  lastVerified: Date;
}

export interface AvailableResource {
  toolId: string;
  name: string;
  category: string;
  canInstall: boolean;
  requiredDependencies: string[];
  estimatedInstallSize: string;
}

export interface SpaceInfo {
  total: number;
  available: number;
  used: number;
  percentFree: number;
}

export interface MemoryInfo {
  total: number;
  available: number;
  percentFree: number;
}

export interface ProcessInfo {
  name: string;
  pid: number;
  cpu: number;
  memory: number;
  status: string;
}

export interface NetworkState {
  online: boolean;
  latency?: number;
  dnsResolved?: boolean;
}

export interface CompatibilityMap {
  [toolId: string]: {
    compatible: boolean;
    reasons: string[];
    alternatives: string[];
  };
}

// ─── Conflict Resolution ───────────────────────────────────────

export interface Conflict {
  type: 'resource' | 'dependency' | 'ordering' | 'semantic' | 'version';
  description: string;
  involvedNodes: string[];
  resolution: ConflictResolution;
}

export interface ConflictResolution {
  strategy: 'deduplicate' | 'reorder' | 'parallelize' | 'skip' | 'merge' | 'split';
  description: string;
  applied: boolean;
}

// ─── Memory ────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  type: 'outcome' | 'pattern' | 'preference' | 'error' | 'context';
  key: string;
  value: string;
  metadata: Record<string, unknown>;
  confidence: number;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export interface OutcomeRecord {
  id: string;
  action: ReasoningAction;
  target: string;
  success: boolean;
  duration: number;
  error?: string;
  command: string;
  timestamp: Date;
  context: Record<string, unknown>;
}

export interface PatternRecord {
  id: string;
  pattern: string;
  frequency: number;
  successRate: number;
  lastSeen: Date;
  examples: string[];
}

// ─── LLM ───────────────────────────────────────────────────────

export type LLMProviderType = 'ollama' | 'openai-compatible' | 'openai' | 'none';

export interface LLMProvider {
  type: LLMProviderType;
  name: string;
  baseUrl: string;
  model: string;
  available: boolean;
  latency: number;
  maxTokens: number;
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  format?: 'text' | 'json';
}

export interface LLMResponse {
  content: string;
  parsed?: Record<string, unknown>;
  tokens: { prompt: number; completion: number };
  latency: number;
  provider: string;
}

// ─── Reasoning Result ──────────────────────────────────────────

export interface ReasoningResult {
  id: string;
  input: string;
  intent: ReasoningIntent;
  goal: GoalNode;
  dag: DAG;
  conflicts: Conflict[];
  resources: Partial<ResourceState>;
  memoryInfluences: MemoryEntry[];
  llmAugmented: boolean;
  chainOfThought: ChainOfThoughtStep[];
  confidence: number;
  executionPlan: ExecutionPlan;
  timestamp: Date;
}

export interface ChainOfThoughtStep {
  index: number;
  thought: string;
  action: string;
  confidence: number;
  evidence: string[];
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  totalEstimatedDuration: number;
  parallelGroups: string[][];
  criticalPath: string[];
}

export interface ExecutionStep {
  id: string;
  description: string;
  command?: string;
  action: ReasoningAction;
  dependencies: string[];
  estimatedDuration: number;
  retryable: boolean;
  rollbackCommand?: string;
}
