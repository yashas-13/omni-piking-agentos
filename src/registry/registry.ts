import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { ToolDefinition, InstalledTool, ToolStatus } from './types.js';

export class ToolRegistry {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        official_source TEXT,
        installer_type TEXT,
        installer_command TEXT,
        updater_type TEXT,
        updater_command TEXT,
        verifier_type TEXT,
        verifier_command TEXT,
        executable_name TEXT,
        executable_port INTEGER,
        platform TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS installed_tools (
        id TEXT PRIMARY KEY,
        tool_id TEXT NOT NULL,
        version TEXT,
        installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'installed',
        path TEXT,
        pid INTEGER,
        port INTEGER,
        metadata TEXT,
        FOREIGN KEY (tool_id) REFERENCES tools(id)
      );
    `);
  }

  registerTool(tool: ToolDefinition): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tools 
      (id, name, description, category, official_source, installer_type, installer_command, 
       updater_type, updater_command, verifier_type, verifier_command, executable_name, 
       executable_port, platform, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tool.id,
      tool.name,
      tool.description,
      tool.category,
      tool.officialSource,
      tool.installer.type,
      tool.installer.command,
      tool.updater.type,
      tool.updater.command,
      tool.verifier.type,
      tool.verifier.command,
      tool.executable.name,
      tool.executable.port || null,
      JSON.stringify(tool.platform),
      JSON.stringify(tool.tags)
    );
  }

  getTool(toolId: string): ToolDefinition | undefined {
    const row = this.db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!row) return undefined;
    return this.rowToTool(row);
  }

  listTools(category?: string, platform?: string): ToolDefinition[] {
    let query = 'SELECT * FROM tools';
    const params: any[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    if (platform) {
      query += category ? ' AND' : ' WHERE';
      query += ' platform LIKE ?';
      params.push(`%${platform}%`);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToTool(row));
  }

  private rowToTool(row: any): ToolDefinition {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      officialSource: row.official_source,
      installer: {
        type: row.installer_type,
        command: row.installer_command
      },
      updater: {
        type: row.updater_type,
        command: row.updater_command
      },
      verifier: {
        type: row.verifier_type,
        command: row.verifier_command
      },
      executable: {
        name: row.executable_name,
        port: row.executable_port
      },
      platform: JSON.parse(row.platform || '[]'),
      tags: JSON.parse(row.tags || '[]')
    };
  }

  // Installed tools management
  recordInstallation(toolId: string, version: string, path?: string): InstalledTool {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO installed_tools (id, tool_id, version, path, status)
      VALUES (?, ?, ?, ?, 'installed')
    `);
    stmt.run(id, toolId, version, path || null);

    return {
      id,
      toolId,
      version,
      installedAt: new Date(),
      updatedAt: new Date(),
      status: 'installed',
      path
    };
  }

  updateToolStatus(toolId: string, status: ToolStatus, pid?: number, port?: number): void {
    const stmt = this.db.prepare(`
      UPDATE installed_tools 
      SET status = ?, pid = ?, port = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tool_id = ?
    `);
    stmt.run(status, pid || null, port || null, toolId);
  }

  getInstalledTool(toolId: string): InstalledTool | undefined {
    const row = this.db.prepare(
      'SELECT * FROM installed_tools WHERE tool_id = ?'
    ).get(toolId) as any;
    
    if (!row) return undefined;

    return {
      id: row.id,
      toolId: row.tool_id,
      version: row.version,
      installedAt: new Date(row.installed_at),
      updatedAt: new Date(row.updated_at),
      status: row.status,
      path: row.path,
      pid: row.pid,
      port: row.port,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  listInstalled(): InstalledTool[] {
    const rows = this.db.prepare('SELECT * FROM installed_tools').all() as any[];
    return rows.map(row => ({
      id: row.id,
      toolId: row.tool_id,
      version: row.version,
      installedAt: new Date(row.installed_at),
      updatedAt: new Date(row.updated_at),
      status: row.status,
      path: row.path,
      pid: row.pid,
      port: row.port,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  removeInstallation(toolId: string): void {
    this.db.prepare('DELETE FROM installed_tools WHERE tool_id = ?').run(toolId);
  }

  close(): void {
    this.db.close();
  }
}
