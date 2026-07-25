import { randomUUID } from 'crypto';
import { DAG, DAGNode, GoalNode, ReasoningAction } from './types.js';

export class DAGBuilder {
  buildFromGoals(goals: GoalNode[]): DAG {
    const nodes = new Map<string, DAGNode>();
    const rootNodes: string[] = [];
    const leafNodes: string[] = [];

    for (const goal of goals) {
      const node = this.goalToNode(goal);
      nodes.set(node.id, node);
    }

    this.wireDependencies(nodes, goals);
    this.identifyRootsAndLeaves(nodes, rootNodes, leafNodes);
    const criticalPath = this.findCriticalPath(nodes);

    return { id: randomUUID(), nodes, rootNodes, leafNodes, criticalPath };
  }

  private goalToNode(goal: GoalNode): DAGNode {
    const intent = goal.intents[0];
    return {
      id: goal.id,
      goalId: goal.id,
      description: goal.description,
      action: intent?.action || 'verify',
      command: this.inferCommand(goal),
      toolId: intent?.target,
      dependencies: [],
      dependents: [],
      status: 'pending',
      retries: 0,
      maxRetries: 3,
      timeout: 60000,
      parallelizable: this.isParallelizable(goal),
      estimatedDuration: goal.estimatedDuration,
      priority: goal.priority,
    };
  }

  private inferCommand(goal: GoalNode): string | undefined {
    const intent = goal.intents[0];
    if (!intent) return undefined;
    if (intent.target) {
      const toolCommands: Record<string, Record<string, string>> = {
        install: { codex: 'npm install -g @openai/codex', 'claude-code': 'npm install -g @anthropic-ai/claude-code', openclaw: 'npm install -g openclaw', '9router': 'npm install -g 9router@latest' },
        verify: { codex: 'codex --version', 'claude-code': 'claude --version', openclaw: 'openclaw --version', '9router': '9router --version', nodejs: 'node --version', python: 'python3 --version', git: 'git --version' },
        run: { codex: 'codex serve', openclaw: 'openclaw gateway run', '9router': '9router serve' },
        stop: { codex: 'killall codex', openclaw: 'killall openclaw', '9router': 'killall 9router' },
      };
      const cmds = toolCommands[intent.action];
      if (cmds && cmds[intent.target]) return cmds[intent.target];
    }
    if (intent.action === 'build') return 'npm run build';
    if (intent.action === 'test') return 'npm test';
    return undefined;
  }

  private isParallelizable(goal: GoalNode): boolean {
    if (goal.type === 'compound') return false;
    const intent = goal.intents[0];
    if (!intent) return true;
    if (['install', 'update', 'download'].includes(intent.action)) return true;
    if (['verify', 'check', 'test'].includes(intent.action)) return true;
    if (['run', 'start', 'stop'].includes(intent.action)) return false;
    return true;
  }

  private wireDependencies(nodes: Map<string, DAGNode>, goals: GoalNode[]): void {
    const installGoals = goals.filter(g => g.intents[0]?.action === 'install');
    const verifyGoals = goals.filter(g => g.intents[0]?.action === 'verify');

    for (const verify of verifyGoals) {
      const matchingInstall = installGoals.find(i => i.intents[0]?.target === verify.intents[0]?.target);
      if (matchingInstall) {
        const vNode = nodes.get(verify.id);
        const iNode = nodes.get(matchingInstall.id);
        if (vNode && iNode) {
          vNode.dependencies.push(iNode.id);
          iNode.dependents.push(vNode.id);
        }
      }
    }

    for (const goal of goals) {
      if (goal.intents[0]?.action === 'build') {
        const installNodes = Array.from(nodes.values()).filter(n => n.action === 'install');
        const buildNode = nodes.get(goal.id);
        if (buildNode) {
          for (const iNode of installNodes) {
            if (!buildNode.dependencies.includes(iNode.id)) {
              buildNode.dependencies.push(iNode.id);
              iNode.dependents.push(buildNode.id);
            }
          }
        }
      }
    }
  }

  private identifyRootsAndLeaves(nodes: Map<string, DAGNode>, roots: string[], leaves: string[]): void {
    for (const [id, node] of nodes) {
      if (node.dependencies.length === 0) roots.push(id);
      if (node.dependents.length === 0) leaves.push(id);
    }
  }

  private findCriticalPath(nodes: Map<string, DAGNode>): string[] {
    const path: string[] = [];
    let longest = 0;
    for (const [id, node] of nodes) {
      if (node.dependents.length === 0) {
        const weight = this.nodeWeight(node, nodes);
        if (weight > longest) {
          longest = weight;
          path.length = 0;
          this.tracePath(node, nodes, path);
        }
      }
    }
    return path;
  }

  private nodeWeight(node: DAGNode, nodes: Map<string, DAGNode>): number {
    let weight = node.estimatedDuration;
    for (const depId of node.dependencies) {
      const dep = nodes.get(depId);
      if (dep) weight += this.nodeWeight(dep, nodes);
    }
    return weight;
  }

  private tracePath(node: DAGNode, nodes: Map<string, DAGNode>, path: string[]): void {
    path.unshift(node.id);
    for (const depId of node.dependencies) {
      const dep = nodes.get(depId);
      if (dep) {
        const currentWeight = this.nodeWeight(node, nodes) - node.estimatedDuration;
        const depWeight = this.nodeWeight(dep, nodes);
        if (depWeight >= currentWeight) {
          this.tracePath(dep, nodes, path);
          break;
        }
      }
    }
  }

  getParallelGroups(dag: DAG): string[][] {
    const groups: string[][] = [];
    const visited = new Set<string>();
    let ready = dag.rootNodes.filter(id => !visited.has(id));

    while (ready.length > 0) {
      const parallelizable = ready.filter(id => {
        const node = dag.nodes.get(id)!;
        return node.parallelizable && node.dependencies.every(d => visited.has(d));
      });

      if (parallelizable.length > 0) {
        groups.push(parallelizable);
        for (const id of parallelizable) visited.add(id);
      } else {
        const sequential = ready.find(id => {
          const node = dag.nodes.get(id)!;
          return node.dependencies.every(d => visited.has(d));
        });
        if (sequential) {
          groups.push([sequential]);
          visited.add(sequential);
        } else break;
      }

      ready = Array.from(dag.nodes.keys()).filter(id => !visited.has(id));
    }

    return groups;
  }
}
