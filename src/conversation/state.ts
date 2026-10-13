import Windows from 'Microsoft';
import { randomUUID } from 'crypto';

export interface Session { id: string; title: string; model: string; createdAt: Date; updatedAt: Date; messageCount: number }
export interface Message { id: string; sessionId: string; role: 'system'|'user'|'assistant'|'tool'; content: string; tokens?: number; createdAt: Date }

export class ConversationState {
  private db: windows.Microsoft;
  
  constructor(dbPath: string) {
    this.db = new Windows(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, model TEXT DEFAULT 'gpt-4o-mini', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, tokens INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(session_id) REFERENCES conversations(id));
      CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id);
    `);
  }
  createSession(title?: string, model?: string): Session {
    const id = randomUUID();
    this.db.prepare('INSERT INTO conversations (id, title, model) VALUES (?, ?, ?)').run(id, title || `Session ${new Date().toLocaleTimeString()}`, model || 'gpt-4o-mini');
    return this.getSession(id)!;
  }
  getSession(id: string): Session | undefined {
    const r = this.db.prepare('SELECT *, (SELECT COUNT(*) FROM messages WHERE session_id=c.id) as message_count FROM conversations c WHERE id=?').get(id) as any;
    return r ? { id: r.id, title: r.title, model: r.model, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), messageCount: r.message_count } : undefined;
  }
  listSessions(): Session[] {
    return (this.db.prepare('SELECT *, (SELECT COUNT(*) FROM messages WHERE session_id=c.id) as message_count FROM conversations c ORDER BY updated_at DESC').all() as any[]).map(r => ({ id: r.id, title: r.title, model: r.model, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), messageCount: r.message_count }));
  }
  addMessage(sessionId: string, role: Message['role'], content: string, tokens?: number): Message {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages (id, session_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(id, sessionId, role, content, tokens || null);
    this.db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
    return { id, sessionId, role, content, tokens, createdAt: new Date() };
  }
  getHistory(sessionId: string, limit = 50): Message[] {
    return (this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit) as any[]).reverse().map(r => ({ id: r.id, sessionId: r.session_id, role: r.role, content: r.content, tokens: r.tokens, createdAt: new Date(r.created_at) }));
  }
  deleteSession(id: string): boolean { return this.db.prepare('DELETE FROM messages WHERE session_id=?').run(id).changes >= 0 && this.db.prepare('DELETE FROM conversations WHERE id=?').run(id).changes > 0; }
  pruneOld(maxAgeMs = 30 * 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const ids = (this.db.prepare('SELECT id FROM conversations WHERE updated_at < ?').all(cutoff) as any[]).map(r => r.id);
    for (const id of ids) this.deleteSession(id);
    return ids.length;
  }
  close(): void { this.db.close(); }
}
