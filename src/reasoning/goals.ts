import { randomUUID } from 'crypto';
import { GoalNode, GoalStatus, ReasoningIntent, GoalResult } from './types.js';

export class GoalDecomposer {
  decompose(intent: ReasoningIntent): GoalNode {
    if (intent.compound && intent.subIntents && intent.subIntents.length > 1) {
      return this.buildCompoundGoal(intent);
    }
    return this.buildAtomicGoal(intent);
  }

  private buildCompoundGoal(intent: ReasoningIntent): GoalNode {
    const children = (intent.subIntents || []).map(sub => this.buildAtomicGoal(sub));

    const prioritized = children.sort((a, b) => {
      const aPrereq = this.hasInstallPrereq(a);
      const bPrereq = this.hasInstallPrereq(b);
      if (aPrereq && !bPrereq) return -1;
      if (!aPrereq && bPrereq) return 1;
      return a.priority - b.priority;
    });

    return {
      id: randomUUID(),
      description: intent.raw,
      type: 'compound',
      status: 'pending',
      children: prioritized,
      intents: [intent],
      priority: 1,
      estimatedDuration: children.reduce((sum, c) => sum + c.estimatedDuration, 0),
      requirements: this.gatherRequirements(children),
    };
  }

  private buildAtomicGoal(intent: ReasoningIntent): GoalNode {
    const duration = this.estimateDuration(intent);
    const priority = this.calculatePriority(intent);
    const requirements = this.determineRequirements(intent);

    return {
      id: randomUUID(),
      description: this.describeGoal(intent),
      type: 'atomic',
      status: 'pending',
      children: [],
      intents: [intent],
      priority,
      estimatedDuration: duration,
      requirements,
    };
  }

  private describeGoal(intent: ReasoningIntent): string {
    const parts: string[] = [];
    parts.push(intent.action);
    if (intent.target) parts.push(intent.target);
    const mods = Object.entries(intent.modifiers).map(([k, v]) => `${k}=${v}`);
    if (mods.length) parts.push(`[${mods.join(', ')}]`);
    return parts.join(' ');
  }

  private estimateDuration(intent: ReasoningIntent): number {
    const baseDurations: Record<string, number> = {
      install: 30000, update: 20000, verify: 2000, run: 5000,
      stop: 2000, build: 60000, test: 30000, deploy: 120000,
      check: 3000, download: 15000, configure: 5000, search: 2000,
      diagnose: 10000, fix: 15000, optimize: 20000, explain: 1000,
      summarize: 1000, compose: 5000, decompose: 2000, custom: 5000,
    };
    let base = baseDurations[intent.action] || 5000;
    if (intent.modifiers['scope'] === 'global') base *= 2;
    if (intent.modifiers['force'] === 'true') base *= 0.8;
    if (intent.modifiers['output'] === 'verbose') base *= 1.2;
    return base;
  }

  private calculatePriority(intent: ReasoningIntent): number {
    let p = 5;
    if (['install', 'build', 'deploy'].includes(intent.action)) p = 1;
    else if (['run', 'start', 'stop'].includes(intent.action)) p = 2;
    else if (['verify', 'test', 'check'].includes(intent.action)) p = 3;
    else if (['explain', 'summarize'].includes(intent.action)) p = 5;
    if (intent.confidence > 0.8) p = Math.max(1, p - 1);
    return p;
  }

  private determineRequirements(intent: ReasoningIntent): string[] {
    const reqs: string[] = [];
    if (intent.target) reqs.push(`tool:${intent.target}`);
    if (intent.action === 'install') reqs.push('internet');
    if (intent.action === 'build') reqs.push('compiler');
    if (intent.action === 'deploy') reqs.push('internet', 'credentials');
    if (intent.action === 'run') reqs.push(`tool:${intent.target || 'system'}`);
    return reqs;
  }

  private hasInstallPrereq(goal: GoalNode): boolean {
    return goal.intents.some(i => i.action === 'install');
  }

  private gatherRequirements(children: GoalNode[]): string[] {
    const all = new Set<string>();
    for (const child of children) {
      for (const req of child.requirements) all.add(req);
    }
    return Array.from(all);
  }

  flatten(root: GoalNode): GoalNode[] {
    const result: GoalNode[] = [];
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      queue.push(...node.children);
    }
    return result;
  }

  getCriticalPath(root: GoalNode): GoalNode[] {
    const all = this.flatten(root);
    const sorted = all.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.estimatedDuration - a.estimatedDuration;
    });
    return sorted.filter(n => n.type === 'atomic');
  }
}
