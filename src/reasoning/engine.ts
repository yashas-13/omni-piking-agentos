import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { join } from 'path';
import { homedir } from 'os';
import {
  ReasoningResult, ReasoningIntent, GoalNode, DAG, Conflict,
  ChainOfThoughtStep, ExecutionPlan, ExecutionStep, MemoryEntry,
  OutcomeRecord,
} from './types.js';
import { EnhancedIntentParser } from './intent.js';
import { GoalDecomposer } from './goals.js';
import { DAGBuilder } from './dag.js';
import { ResourceOracle } from './resources.js';
import { ConflictResolver } from './conflicts.js';
import { MemoryEngine } from './memory.js';
import { LLMProviderManager } from './llm.js';
import { ToolRegistry } from '../registry/registry.js';

const SYSTEM_PROMPT = `You are an AI reasoning engine for a developer tool management system.
Analyze the user's request and produce a JSON plan with:
1. Decomposed goals (array of {description, action, target, priority})
2. Execution steps with dependencies
3. Potential conflicts or risks
4. Confidence score (0-1)

Respond ONLY with valid JSON. No markdown, no explanation outside JSON.`;

export class ReasoningEngine extends EventEmitter {
  private parser: EnhancedIntentParser;
  private decomposer: GoalDecomposer;
  private dagBuilder: DAGBuilder;
  private resourceOracle: ResourceOracle;
  private conflictResolver: ConflictResolver;
  private memory: MemoryEngine;
  private llm: LLMProviderManager;
  private registry: ToolRegistry;
  private dbPath: string;

  constructor(registry: ToolRegistry) {
    super();
    this.registry = registry;
    this.dbPath = join(homedir(), '.agentos', 'agentos.db');
    this.parser = new EnhancedIntentParser();
    this.decomposer = new GoalDecomposer();
    this.dagBuilder = new DAGBuilder();
    this.resourceOracle = new ResourceOracle(registry);
    this.conflictResolver = new ConflictResolver();
    this.memory = new MemoryEngine(this.dbPath);
    this.llm = new LLMProviderManager();
  }

  async initialize(): Promise<void> {
    const provider = await this.llm.detect();
    if (provider) {
      console.log(`[reasoning] LLM detected: ${provider.name} (${provider.model})`);
    } else {
      console.log('[reasoning] No LLM available, using rule-based reasoning only');
    }
  }

  async think(input: string): Promise<ReasoningResult> {
    const startTime = Date.now();
    this.emit('thinking', { input, timestamp: new Date() });

    const chainOfThought: ChainOfThoughtStep[] = [];
    let stepIndex = 0;

    // Step 1: Parse intent
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Parsing natural language input to extract intent, entities, and modifiers',
      action: 'parse_intent',
      confidence: 0.9,
      evidence: [`Input: "${input}"`],
    });
    const intent = this.parser.parse(input);

    // Step 2: Check memory for past outcomes
    chainOfThought.push({
      index: stepIndex++,
      thought: `Checking memory for past outcomes of ${intent.action}:${intent.target || 'unknown'}`,
      action: 'memory_lookup',
      confidence: 0.8,
      evidence: [],
    });
    const memoryInfluences = this.checkMemory(intent);
    const pastSuccessRate = intent.target
      ? this.memory.getSuccessRate(intent.action, intent.target)
      : 0.5;
    chainOfThought[chainOfThought.length - 1].evidence.push(
      `Past success rate: ${(pastSuccessRate * 100).toFixed(0)}%`
    );

    // Step 3: Decompose goal
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Decomposing goal into sub-goals and determining execution order',
      action: 'decompose_goal',
      confidence: 0.85,
      evidence: [`Compound: ${intent.compound}`, `Sub-intents: ${intent.subIntents?.length || 1}`],
    });
    const goal = this.decomposer.decompose(intent);

    // Step 4: Build DAG
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Building dependency graph and identifying parallel execution opportunities',
      action: 'build_dag',
      confidence: 0.9,
      evidence: [],
    });
    const flatGoals = this.decomposer.flatten(goal);
    const dag = this.dagBuilder.buildFromGoals(flatGoals);
    chainOfThought[chainOfThought.length - 1].evidence.push(
      `Nodes: ${dag.nodes.size}, Roots: ${dag.rootNodes.length}, Leaves: ${dag.leafNodes.length}`
    );

    // Step 5: Check resources
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Assessing system resources and tool availability',
      action: 'check_resources',
      confidence: 0.95,
      evidence: [],
    });
    const resources = await this.resourceOracle.assess();
    chainOfThought[chainOfThought.length - 1].evidence.push(
      `Disk: ${(resources.diskSpace.percentFree).toFixed(1)}% free`,
      `Memory: ${(resources.memory.percentFree).toFixed(1)}% free`,
      `Installed: ${resources.installedTools.length} tools`
    );

    // Step 6: Resolve conflicts
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Detecting and resolving conflicts in the execution plan',
      action: 'resolve_conflicts',
      confidence: 0.85,
      evidence: [],
    });
    const conflicts = this.conflictResolver.resolve(dag);
    this.conflictResolver.applyResolutions(dag, conflicts);
    chainOfThought[chainOfThought.length - 1].evidence.push(
      `Conflicts found: ${conflicts.length}`,
      `Applied: ${conflicts.filter(c => c.resolution.applied).length}`
    );

    // Step 7: Optionally augment with LLM
    let llmAugmented = false;
    if (this.llm.isAvailable() && (intent.confidence < 0.5 || intent.compound)) {
      chainOfThought.push({
        index: stepIndex++,
        thought: 'Augmenting reasoning with LLM for complex/uncertain intent',
        action: 'llm_augment',
        confidence: 0.7,
        evidence: [],
      });
      const llmResult = await this.llmAugment(input, intent);
      if (llmResult) {
        llmAugmented = true;
        chainOfThought[chainOfThought.length - 1].evidence.push('LLM augmentation successful');
      }
    }

    // Step 8: Build execution plan
    chainOfThought.push({
      index: stepIndex++,
      thought: 'Synthesizing final execution plan with timing and parallelism',
      action: 'build_plan',
      confidence: 0.9,
      evidence: [],
    });
    const executionPlan = this.buildExecutionPlan(dag);

    // Step 9: Record outcome (will be updated after execution)
    this.memory.store({
      type: 'context',
      key: `last_think:${Date.now()}`,
      value: input,
      metadata: { intent: intent.action, target: intent.target },
      confidence: intent.confidence,
    });

    const result: ReasoningResult = {
      id: randomUUID(),
      input,
      intent,
      goal,
      dag,
      conflicts,
      resources: {
        diskSpace: resources.diskSpace,
        memory: resources.memory,
        installedTools: resources.installedTools,
      },
      memoryInfluences,
      llmAugmented,
      chainOfThought,
      confidence: this.calculateOverallConfidence(intent, pastSuccessRate, conflicts.length),
      executionPlan,
      timestamp: new Date(),
    };

    this.emit('thoughtComplete', result);
    return result;
  }

  recordExecution(action: string, target: string, success: boolean, duration: number, command: string, error?: string): void {
    const outcome: OutcomeRecord = {
      id: randomUUID(),
      action: action as any,
      target,
      success,
      duration,
      error,
      command,
      timestamp: new Date(),
      context: {},
    };
    this.memory.recordOutcome(outcome);
    this.emit('outcomeRecorded', outcome);
  }

  getPatterns() { return this.memory.getMostFrequentPatterns(); }
  getOutcomeHistory(action: string, target: string) { return this.memory.getOutcomeHistory(action as any, target); }
  getRecentContext() { return this.memory.getRecentContext(); }
  getLLMProvider() { return this.llm.getProvider(); }

  private checkMemory(intent: ReasoningIntent): MemoryEntry[] {
    const influences: MemoryEntry[] = [];
    const context = this.memory.getRecentContext(5);
    influences.push(...context);
    if (intent.target) {
      const history = this.memory.getOutcomeHistory(intent.action, intent.target, 5);
      for (const h of history) {
        influences.push({
          id: h.id, type: 'outcome', key: `${h.action}:${h.target}`,
          value: h.success ? 'success' : 'failure',
          metadata: { duration: h.duration, error: h.error },
          confidence: 0.8, accessCount: 1, lastAccessed: h.timestamp,
          createdAt: h.timestamp,
        });
      }
    }
    return influences;
  }

  private async llmAugment(input: string, intent: ReasoningIntent): Promise<string | null> {
    const prompt = `Analyze this developer task and suggest an optimized execution plan.
Task: "${input}"
Detected intent: ${intent.action} ${intent.target || 'unknown'}
Confidence: ${(intent.confidence * 100).toFixed(0)}%
Provide: decomposed steps, dependencies, risks, and estimated durations.`;
    const response = await this.llm.query({ prompt, systemPrompt: SYSTEM_PROMPT, maxTokens: 512, temperature: 0.3 });
    return response?.content || null;
  }

  private buildExecutionPlan(dag: DAG): ExecutionPlan {
    const steps: ExecutionStep[] = [];
    for (const [, node] of dag.nodes) {
      if (node.status === 'skipped') continue;
      steps.push({
        id: node.id,
        description: node.description,
        command: node.command,
        action: node.action,
        dependencies: node.dependencies,
        estimatedDuration: node.estimatedDuration,
        retryable: node.maxRetries > 0,
      });
    }
    const groups = this.dagBuilder.getParallelGroups(dag);
    const totalDuration = steps.reduce((sum, s) => sum + s.estimatedDuration, 0);
    return { steps, totalEstimatedDuration: totalDuration, parallelGroups: groups, criticalPath: dag.criticalPath };
  }

  private calculateOverallConfidence(intent: ReasoningIntent, pastSuccessRate: number, conflictCount: number): number {
    let score = intent.confidence * 0.4;
    score += pastSuccessRate * 0.3;
    score += Math.max(0, 1 - conflictCount * 0.1) * 0.3;
    return Math.min(Math.max(score, 0.1), 1);
  }
}
