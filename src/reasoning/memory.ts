import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { MemoryEntry, OutcomeRecord, PatternRecord, ReasoningAction } from './types.js';

export class MemoryEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        confidence REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );
      CREATE TABLE IF NOT EXISTS outcome_records (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        error TEXT,
        command TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        context TEXT DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS pattern_records (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        frequency INTEGER DEFAULT 1,
        success_rate REAL DEFAULT 1.0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        examples TEXT DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key);
      CREATE INDEX IF NOT EXISTS idx_outcome_action ON outcome_records(action);
      CREATE INDEX IF NOT EXISTS idx_outcome_target ON outcome_records(target);
      CREATE INDEX IF NOT EXISTS idx_pattern_freq ON pattern_records(frequency DESC);
    `);
  }

  recordOutcome(outcome: OutcomeRecord): void {
    this.db.prepare(`
      INSERT INTO outcome_records (id, action, target, success, duration, error, command, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(outcome.id, outcome.action, outcome.target, outcome.success ? 1 : 0,
      outcome.duration, outcome.error || null, outcome.command, JSON.stringify(outcome.context));

    this.updatePattern(outcome);
  }

  private updatePattern(outcome: OutcomeRecord): void {
    const pattern = `${outcome.action}:${outcome.target}`;
    const existing = this.db.prepare('SELECT * FROM pattern_records WHERE pattern = ?').get(pattern) as any;

    if (existing) {
      const totalFreq = existing.frequency + 1;
      const successCount = existing.success_rate * existing.frequency + (outcome.success ? 1 : 0);
      const newRate = successCount / totalFreq;
      const examples = JSON.parse(existing.examples || '[]');
      if (examples.length < 10) examples.push(outcome.command);
      this.db.prepare(`
        UPDATE pattern_records SET frequency = ?, success_rate = ?, last_seen = CURRENT_TIMESTAMP, examples = ?
        WHERE pattern = ?
      `).run(totalFreq, newRate, JSON.stringify(examples), pattern);
    } else {
      this.db.prepare(`
        INSERT INTO pattern_records (id, pattern, frequency, success_rate, examples)
        VALUES (?, ?, 1, ?, ?)
      `).run(randomUUID(), pattern, outcome.success ? 1.0 : 0.0, JSON.stringify([outcome.command]));
    }
  }

  getOutcomeHistory(action: ReasoningAction, target: string, limit = 10): OutcomeRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM outcome_records WHERE action = ? AND target = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(action, target, limit) as any[];
    return rows.map(this.rowToOutcome);
  }

  getSuccessRate(action: ReasoningAction, target: string): number {
    const row = this.db.prepare(
      'SELECT AVG(success) as rate FROM outcome_records WHERE action = ? AND target = ?'
    ).get(action, target) as any;
    return row?.rate || 0.5;
  }

  getMostFrequentPatterns(limit = 20): PatternRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM pattern_records ORDER BY frequency DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(this.rowToPattern);
  }

  store(entry: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessed' | 'createdAt'>): MemoryEntry {
    const full: MemoryEntry = {
      id: randomUUID(),
      ...entry,
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
    };
    this.db.prepare(`
      INSERT INTO memory_entries (id, type, key, value, metadata, confidence, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(full.id, full.type, full.key, full.value, JSON.stringify(full.metadata),
      full.confidence, full.expiresAt?.toISOString() || null);
    return full;
  }

  retrieve(type: string, key: string): MemoryEntry | undefined {
    const row = this.db.prepare(
      'SELECT * FROM memory_entries WHERE type = ? AND key = ?'
    ).get(type, key) as any;
    if (!row) return undefined;
    this.db.prepare('UPDATE memory_entries SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    return this.rowToMemory(row);
  }

  getRecentContext(limit = 20): MemoryEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM memory_entries ORDER BY last_accessed DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(this.rowToMemory);
  }

  prune(maxAge = 30 * 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge).toISOString();
    const result = this.db.prepare('DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at < ?').run(cutoff);
    return result.changes;
  }

  close(): void { this.db.close(); }

  private rowToOutcome(row: any): OutcomeRecord {
    return {
      id: row.id, action: row.action, target: row.target,
      success: row.success === 1, duration: row.duration,
      error: row.error, command: row.command,
      timestamp: new Date(row.timestamp),
      context: JSON.parse(row.context || '{}'),
    };
  }

  private rowToPattern(row: any): PatternRecord {
    return {
      id: row.id, pattern: row.pattern, frequency: row.frequency,
      successRate: row.success_rate, lastSeen: new Date(row.last_seen),
      examples: JSON.parse(row.examples || '[]'),
    };
  }

  private rowToMemory(row: any): MemoryEntry {
    return {
      id: row.id, type: row.type, key: row.key, value: row.value,
      metadata: JSON.parse(row.metadata || '{}'), confidence: row.confidence,
      accessCount: row.access_count, lastAccessed: new Date(row.last_accessed),
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
  }
}
