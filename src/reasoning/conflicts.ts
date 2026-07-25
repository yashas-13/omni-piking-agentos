import { DAG, DAGNode, Conflict, ConflictResolution } from './types.js';

export class ConflictResolver {
  resolve(dag: DAG): Conflict[] {
    const conflicts: Conflict[] = [];
    conflicts.push(...this.findDuplicates(dag));
    conflicts.push(...this.findCycles(dag));
    conflicts.push(...this.findMissingDeps(dag));
    conflicts.push(...this.findResourceConflicts(dag));
    return conflicts;
  }

  private findDuplicates(dag: DAG): Conflict[] {
    const conflicts: Conflict[] = [];
    const byAction = new Map<string, DAGNode[]>();
    for (const [, node] of dag.nodes) {
      const key = `${node.action}:${node.toolId || ''}`;
      const existing = byAction.get(key) || [];
      existing.push(node);
      byAction.set(key, existing);
    }
    for (const [key, nodes] of byAction) {
      if (nodes.length > 1) {
        conflicts.push({
          type: 'semantic',
          description: `Duplicate action: ${key} (${nodes.length} nodes)`,
          involvedNodes: nodes.map(n => n.id),
          resolution: { strategy: 'deduplicate', description: `Keep first occurrence, skip rest`, applied: false },
        });
      }
    }
    return conflicts;
  }

  private findCycles(dag: DAG): Conflict[] {
    const conflicts: Conflict[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): boolean => {
      if (inStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart);
        conflicts.push({
          type: 'dependency',
          description: `Dependency cycle detected`,
          involvedNodes: cycle,
          resolution: { strategy: 'reorder', description: `Break cycle at ${nodeId}`, applied: false },
        });
        return true;
      }
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);
      const node = dag.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          if (dfs(dep, [...path])) return true;
        }
      }
      inStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const [id] of dag.nodes) {
      if (!visited.has(id)) dfs(id, []);
    }
    return conflicts;
  }

  private findMissingDeps(dag: DAG): Conflict[] {
    const conflicts: Conflict[] = [];
    for (const [id, node] of dag.nodes) {
      for (const depId of node.dependencies) {
        if (!dag.nodes.has(depId)) {
          conflicts.push({
            type: 'dependency',
            description: `Missing dependency: node ${id} depends on non-existent ${depId}`,
            involvedNodes: [id],
            resolution: { strategy: 'skip', description: `Remove broken dependency`, applied: false },
          });
        }
      }
    }
    return conflicts;
  }

  private findResourceConflicts(dag: DAG): Conflict[] {
    const conflicts: Conflict[] = [];
    const runningNodes = Array.from(dag.nodes.values()).filter(n => (n.action as string) === 'run');
    const stopNodes = Array.from(dag.nodes.values()).filter(n => (n.action as string) === 'stop');
    for (const run of runningNodes) {
      for (const stop of stopNodes) {
        if (run.toolId && run.toolId === stop.toolId) {
          if (!run.dependencies.includes(stop.id) && !stop.dependencies.includes(run.id)) {
            conflicts.push({
              type: 'ordering',
              description: `Conflict: start ${run.toolId} and stop ${run.toolId} have no ordering`,
              involvedNodes: [run.id, stop.id],
              resolution: { strategy: 'reorder', description: `Stop before start`, applied: false },
            });
          }
        }
      }
    }
    return conflicts;
  }

  applyResolutions(dag: DAG, conflicts: Conflict[]): void {
    for (const conflict of conflicts) {
      switch (conflict.resolution.strategy) {
        case 'deduplicate': {
          const keep = conflict.involvedNodes[0];
          for (let i = 1; i < conflict.involvedNodes.length; i++) {
            const nodeId = conflict.involvedNodes[i];
            const node = dag.nodes.get(nodeId);
            if (node) {
              node.status = 'skipped';
              for (const depId of node.dependents) {
                const dep = dag.nodes.get(depId);
                if (dep) {
                  dep.dependencies = dep.dependencies.filter(d => d !== nodeId);
                }
              }
            }
          }
          conflict.resolution.applied = true;
          break;
        }
        case 'reorder': {
          for (let i = 1; i < conflict.involvedNodes.length; i++) {
            const nodeId = conflict.involvedNodes[i];
            const prevId = conflict.involvedNodes[i - 1];
            const node = dag.nodes.get(nodeId);
            if (node && !node.dependencies.includes(prevId)) {
              node.dependencies.push(prevId);
            }
          }
          conflict.resolution.applied = true;
          break;
        }
        case 'skip': {
          for (const nodeId of conflict.involvedNodes) {
            const node = dag.nodes.get(nodeId);
            if (node) node.status = 'skipped';
          }
          conflict.resolution.applied = true;
          break;
        }
      }
    }
  }
}
