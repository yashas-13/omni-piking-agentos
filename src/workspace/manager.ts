import { mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  projectPath?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceConfig {
  basePath: string;
  createSubdirs?: boolean;
}

export class WorkspaceManager extends EventEmitter {
  private config: WorkspaceConfig;
  private workspaces: Map<string, Workspace> = new Map();

  constructor(config: WorkspaceConfig) {
    super();
    this.config = config;
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!existsSync(this.config.basePath)) {
      mkdirSync(this.config.basePath, { recursive: true });
    }

    if (this.config.createSubdirs !== false) {
      const subdirs = ['projects', 'cache', 'temp', 'downloads', 'repositories', 'logs'];
      for (const subdir of subdirs) {
        const path = join(this.config.basePath, subdir);
        if (!existsSync(path)) {
          mkdirSync(path, { recursive: true });
        }
      }
    }
  }

  create(name: string, projectPath?: string): Workspace {
    const id = randomUUID();
    const workspacePath = join(this.config.basePath, 'projects', `${name}-${id.slice(0, 8)}`);

    mkdirSync(workspacePath, { recursive: true });

    if (this.config.createSubdirs !== false) {
      const subdirs = ['src', 'build', 'dist', 'tests', 'docs', '.agentos'];
      for (const subdir of subdirs) {
        mkdirSync(join(workspacePath, subdir), { recursive: true });
      }
    }

    const workspace: Workspace = {
      id,
      name,
      path: workspacePath,
      createdAt: new Date(),
      projectPath
    };

    this.workspaces.set(id, workspace);
    this.emit('workspaceCreated', workspace);

    return workspace;
  }

  get(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  list(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  delete(id: string, deleteFiles: boolean = false): boolean {
    const workspace = this.workspaces.get(id);
    if (!workspace) return false;

    if (deleteFiles && existsSync(workspace.path)) {
      rmSync(workspace.path, { recursive: true, force: true });
    }

    this.workspaces.delete(id);
    this.emit('workspaceDeleted', { id });
    return true;
  }

  getPath(id: string, subdir?: string): string | undefined {
    const workspace = this.workspaces.get(id);
    if (!workspace) return undefined;

    return subdir ? join(workspace.path, subdir) : workspace.path;
  }

  getCachePath(): string {
    return join(this.config.basePath, 'cache');
  }

  getTempPath(): string {
    return join(this.config.basePath, 'temp');
  }

  getDownloadsPath(): string {
    return join(this.config.basePath, 'downloads');
  }

  getLogsPath(): string {
    return join(this.config.basePath, 'logs');
  }

  scanExisting(): Workspace[] {
    const projectsPath = join(this.config.basePath, 'projects');
    if (!existsSync(projectsPath)) return [];

    const entries = readdirSync(projectsPath);
    const found: Workspace[] = [];

    for (const entry of entries) {
      const entryPath = join(projectsPath, entry);
      const stat = statSync(entryPath);
      
      if (stat.isDirectory()) {
        const parts = entry.split('-');
        const name = parts.slice(0, -1).join('-') || entry;
        const id = parts[parts.length - 1] || randomUUID();

        const workspace: Workspace = {
          id,
          name,
          path: entryPath,
          createdAt: stat.birthtime || stat.ctime
        };

        this.workspaces.set(id, workspace);
        found.push(workspace);
      }
    }

    return found;
  }
}
