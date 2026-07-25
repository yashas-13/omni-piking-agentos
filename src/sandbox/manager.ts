import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

export interface Sandbox { id: string; name: string; workDir: string; createdAt: Date; status: 'active' | 'destroyed' }
export interface SandboxResult { exitCode: number; stdout: string; stderr: string; duration: number }

export class SandboxManager {
  private sandboxes: Map<string, Sandbox> = new Map();
  private baseDir: string;
  constructor(baseDir: string) { this.baseDir = join(baseDir, 'sandboxes'); if (!existsSync(this.baseDir)) mkdirSync(this.baseDir, { recursive: true }); }

  createSandbox(name?: string): Sandbox {
    const id = randomUUID();
    const workDir = join(this.baseDir, id);
    mkdirSync(workDir, { recursive: true });
    const sandbox: Sandbox = { id, name: name || `sandbox-${id.slice(0, 8)}`, workDir, createdAt: new Date(), status: 'active' };
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  execute(sandboxId: string, command: string, options?: { timeout?: number; env?: Record<string, string> }): SandboxResult {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || sandbox.status !== 'active') throw new Error(`Sandbox ${sandboxId} not found or inactive`);
    const start = Date.now();
    try {
      const stdout = execSync(command, {
        cwd: sandbox.workDir, encoding: 'utf-8',
        timeout: options?.timeout || 30000,
        env: { ...process.env, ...options?.env, SANDBOX_ID: sandboxId, SANDBOX_DIR: sandbox.workDir },
      });
      return { exitCode: 0, stdout: stdout.trim(), stderr: '', duration: Date.now() - start };
    } catch (err: any) {
      return { exitCode: err.status || 1, stdout: '', stderr: err.stderr || err.message, duration: Date.now() - start };
    }
  }

  destroy(sandboxId: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return false;
    try { rmSync(sandbox.workDir, { recursive: true, force: true }); } catch {}
    sandbox.status = 'destroyed';
    this.sandboxes.delete(sandboxId);
    return true;
  }

  listSandboxes(): Sandbox[] { return Array.from(this.sandboxes.values()); }
  destroyAll(): void { for (const [id] of this.sandboxes) this.destroy(id); }
}
