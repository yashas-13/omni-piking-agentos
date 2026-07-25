import { ReasoningIntent, IntentEntity, ReasoningAction, TemporalHint, ConditionalHint, Confidence } from './types.js';

const ACTION_PATTERNS: { action: ReasoningAction; patterns: RegExp[]; priority: number }[] = [
  { action: 'install',    patterns: [/\b(install|add|get|set\s*up|setup|provision|acquire|fetch|obtain)\b/i], priority: 1 },
  { action: 'update',     patterns: [/\b(update|upgrade|refresh|patch|bump)\b/i], priority: 1 },
  { action: 'verify',     patterns: [/\b(verify|check|validate|confirm|assert|test|ensure)\b/i], priority: 2 },
  { action: 'run',        patterns: [/\b(run|start|launch|execute|open|boot|initiate|fire)\b/i], priority: 1 },
  { action: 'stop',       patterns: [/\b(stop|kill|halt|terminate|shutdown|disable|deactivate)\b/i], priority: 1 },
  { action: 'build',      patterns: [/\b(build|compile|make|package|bundle|transpile)\b/i], priority: 2 },
  { action: 'test',       patterns: [/\b(test|lint|validate|check|verify|smoke|e2e|unit)\b/i], priority: 2 },
  { action: 'deploy',     patterns: [/\b(deploy|publish|release|ship|push|upload)\b/i], priority: 3 },
  { action: 'download',   patterns: [/\b(download|fetch|pull|grab|retrieve)\b/i], priority: 2 },
  { action: 'configure',  patterns: [/\b(config|configure|set|adjust|modify|tune|calibrate)\b/i], priority: 2 },
  { action: 'search',     patterns: [/\b(search|find|look|locate|discover|scan)\b/i], priority: 3 },
  { action: 'diagnose',   patterns: [/\b(diagnose|debug|investigate|trace|analyze|examine|inspect)\b/i], priority: 3 },
  { action: 'fix',        patterns: [/\b(fix|repair|resolve|patch|correct|remedy)\b/i], priority: 2 },
  { action: 'optimize',   patterns: [/\b(optimize|improve|enhance|speed|accelerate|tune)\b/i], priority: 3 },
  { action: 'explain',    patterns: [/\b(explain|describe|tell|what|how|why|show)\b/i], priority: 4 },
  { action: 'summarize',  patterns: [/\b(summarize|summary|brief|overview|recap)\b/i], priority: 4 },
  { action: 'compose',    patterns: [/\b(write|create|generate|build|produce|author)\b/i], priority: 2 },
  { action: 'decompose',  patterns: [/\b(break|split|divide|separate|decompose|dissect)\b/i], priority: 3 },
];

const TOOL_NAME_MAP: Record<string, string> = {
  'node': 'nodejs', 'nodejs': 'nodejs', 'npm': 'npm', 'yarn': 'npm', 'pnpm': 'npm',
  'python': 'python', 'pip': 'python', 'uv': 'uv', 'conda': 'python',
  'git': 'git', 'github': 'git', 'gitlab': 'git',
  'cargo': 'cargo', 'rust': 'cargo', 'rustup': 'cargo',
  'go': 'go', 'golang': 'go',
  'docker': 'docker', 'podman': 'docker', 'docker-compose': 'docker',
  'brew': 'homebrew', 'homebrew': 'homebrew',
  'winget': 'winget', 'choco': 'chocolatey', 'chocolatey': 'chocolatey',
  'codex': 'codex', 'openai': 'codex', 'gpt': 'codex',
  'claude': 'claude-code', 'anthropic': 'claude-code',
  'openclaw': 'openclaw', 'claw': 'openclaw', 'anyclaw': 'openclaw',
  '9router': '9router', 'router': '9router', 'omnirouter': '9router',
  'opencode': 'opencode', 'open-code': 'opencode',
  'hermes': 'hermes', 'meta': 'hermes',
  'rust-analyzer': 'rust-analyzer', 'clippy': 'cargo',
  'tsc': 'nodejs', 'typescript': 'nodejs', 'tsx': 'nodejs',
  'vite': 'nodejs', 'webpack': 'nodejs', 'esbuild': 'nodejs',
  'eslint': 'nodejs', 'prettier': 'nodejs',
};

const COMPOUND_SEPARATORS = /\s*(?:\s+and\s+|\s*,\s*|\s*;\s*|\s+then\s+|\s+also\s+|\s+plus\s+|\s+with\s+)\s*/i;
const TEMPORAL_PATTERNS: [RegExp, TemporalHint['type']][] = [
  [/\b(now|immediately|right\s+away|asap|at\s+once)\b/i, 'immediate'],
  [/\b(later|schedule|at\s+\d|tomorrow|next\s+week)\b/i, 'scheduled'],
  [/\b(always|every|repeat|daily|weekly|cron)\b/i, 'recurring'],
  [/\b(eventually|sometime|when\s+ready|defer|postpone)\b/i, 'deferred'],
];

const CONDITIONAL_PATTERNS = [
  /(?:if|when|unless|provided|assuming)\s+(.+?),\s*(.+?)(?:\s+else\s+(.+?))?$/i,
  /(?:in\s+case|should)\s+(.+?),\s*(.+?)/i,
];

const MODIFIER_PATTERNS: [RegExp, string][] = [
  [/\b(global|worldwide|system-wide)\b/i, 'scope=global'],
  [/\b(local|project|here)\b/i, 'scope=local'],
  [/\b(force|forced|mandatory)\b/i, 'force=true'],
  [/\b(latest|newest|recent)\b/i, 'version=latest'],
  [/\bv?([\d]+\.[\d]+[\.\d]*)\b/, 'version=$1'],
  [/\b(silent|quiet|no[-\s]output)\b/i, 'output=silent'],
  [/\b(verbose|detailed|full)\b/i, 'output=verbose'],
  [/\b(dry[-\s]run|simulate|preview|test)\b/i, 'mode=dry-run'],
  [/\b(sudo|admin|root|elevated)\b/i, 'privilege=elevated'],
];

export class EnhancedIntentParser {
  parse(input: string): ReasoningIntent {
    const trimmed = input.trim();
    const entities = this.extractEntities(trimmed);
    const temporal = this.detectTemporal(trimmed);
    const conditions = this.detectConditions(trimmed);
    const compound = this.isCompound(trimmed);
    const subIntents = compound ? this.splitCompound(trimmed) : undefined;

    const action = this.detectAction(trimmed);
    const target = this.detectTarget(trimmed, entities);
    const modifiers = this.extractModifiers(trimmed, entities);
    const confidence = this.calculateConfidence(action, target, entities, trimmed);

    return {
      action: action.action,
      target,
      modifiers,
      confidence,
      confidenceLevel: this.confidenceLevel(confidence),
      raw: trimmed,
      entities,
      temporal,
      conditions,
      compound,
      subIntents,
    };
  }

  private extractEntities(input: string): IntentEntity[] {
    const entities: IntentEntity[] = [];
    const lower = input.toLowerCase();

    for (const [name, id] of Object.entries(TOOL_NAME_MAP)) {
      const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        entities.push({ type: 'tool', value: name, normalized: id, confidence: 0.9 });
      }
    }

    for (const { patterns, action } of ACTION_PATTERNS) {
      for (const pat of patterns) {
        const match = input.match(pat);
        if (match) {
          entities.push({ type: 'action', value: match[0], normalized: action, confidence: 0.85 });
        }
      }
    }

    for (const [pat, mod] of MODIFIER_PATTERNS) {
      const match = input.match(pat);
      if (match) {
        const [key, value] = mod.split('=');
        entities.push({ type: 'modifier', value: match[0], normalized: `${key}:${value}`, confidence: 0.8 });
      }
    }

    const versionMatch = input.match(/\bv?([\d]+\.[\d]+[\.\d]*)\b/);
    if (versionMatch) {
      entities.push({ type: 'modifier', value: versionMatch[0], normalized: `version:${versionMatch[1]}`, confidence: 0.95 });
    }

    return entities;
  }

  private detectAction(input: string): { action: ReasoningAction; confidence: number } {
    let bestAction: ReasoningAction = 'verify';
    let bestConfidence = 0;

    for (const { action, patterns, priority } of ACTION_PATTERNS) {
      for (const pat of patterns) {
        if (pat.test(input)) {
          const baseConfidence = Math.min(pat.source.length / 15, 1);
          const priorityBonus = (5 - priority) * 0.05;
          const confidence = baseConfidence + priorityBonus;
          if (confidence > bestConfidence) {
            bestAction = action;
            bestConfidence = confidence;
          }
        }
      }
    }

    return { action: bestAction, confidence: Math.min(bestConfidence, 1) };
  }

  private detectTarget(input: string, entities: IntentEntity[]): string | undefined {
    const toolEntities = entities.filter(e => e.type === 'tool');
    if (toolEntities.length > 0) return toolEntities[0].normalized;

    const lower = input.toLowerCase();
    for (const [name, id] of Object.entries(TOOL_NAME_MAP)) {
      if (lower.includes(name)) return id;
    }
    return undefined;
  }

  private extractModifiers(input: string, entities: IntentEntity[]): Record<string, string> {
    const mods: Record<string, string> = {};
    const modifierEntities = entities.filter(e => e.type === 'modifier');
    for (const entity of modifierEntities) {
      const [key, value] = entity.normalized.split(':');
      mods[key] = value;
    }
    return mods;
  }

  private calculateConfidence(
    action: { action: ReasoningAction; confidence: number },
    target: string | undefined,
    entities: IntentEntity[],
    input: string
  ): number {
    let score = action.confidence * 0.4;
    if (target) score += 0.3;
    const toolEntities = entities.filter(e => e.type === 'tool');
    if (toolEntities.length > 0) score += 0.15;
    const wordCount = input.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 15) score += 0.1;
    if (input.length > 5) score += 0.05;
    return Math.min(score, 1);
  }

  private confidenceLevel(confidence: number): Confidence {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    if (confidence >= 0.3) return 'low';
    return 'uncertain';
  }

  private isCompound(input: string): boolean {
    return COMPOUND_SEPARATORS.test(input) && input.split(COMPOUND_SEPARATORS).length > 1;
  }

  private splitCompound(input: string): ReasoningIntent[] {
    const parts = input.split(COMPOUND_SEPARATORS).filter(Boolean);
    return parts.map(part => this.parse(part));
  }

  private detectTemporal(input: string): TemporalHint | undefined {
    for (const [pattern, type] of TEMPORAL_PATTERNS) {
      const match = input.match(pattern);
      if (match) return { type, value: match[0] };
    }
    return undefined;
  }

  private detectConditions(input: string): ConditionalHint[] {
    const conditions: ConditionalHint[] = [];
    for (const pattern of CONDITIONAL_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        conditions.push({
          condition: match[1]?.trim() || '',
          action: match[2]?.trim() || '',
          fallback: match[3]?.trim(),
        });
      }
    }
    return conditions;
  }
}
