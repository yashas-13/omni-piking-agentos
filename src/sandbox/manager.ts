import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { SecurityManager } from '../security/manager.js';

export interface Sandbox { id: string; name: string; workDir: string; createdAt: Date; status: 'active' | 'destroyed' }
export interface SandboxResult { exitCode: number; stdout: string; stderr: string; duration: number }

export class SandboxManager {
  private readonly sandboxes = new Map<string, Sandbox>();
  private readonly baseDir: string;

  constructor(baseDir: string, private readonly security: SecurityManager = new SecurityManager({ baseDir })) {
    this.baseDir = join(baseDir, 'sandboxes');
    if (!existsSync(this.baseDir)) mkdirSync(this.baseDir, { recursive: true });
  }

  createSandbox(name?: string): Sandbox {
    const id = randomUUID();
    const workDir = join(this.baseDir, id);
    mkdirSync(workDir, { recursive: true, mode: 0o700 });
    const sandbox: Sandbox = { id, name: name || `sandbox-${id.slice(0, 8)}`, workDir, createdAt: new Date(), status: 'active' };
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  execute(sandboxId: string, command: string, options?: { timeout?: number; env?: Record<string, string>; allowShell?: boolean }): SandboxResult {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox || sandbox.status !== 'active') throw new Error(`Sandbox ${sandboxId} not found or inactive`);
    const start = Date.now();
    const allowShell = options?.allowShell ?? false;

    if (!this.security.isCommandAllowed(command, { allowShell })) {
      this.security.auditLog({ timestamp: new Date(), action: 'sandbox.execute', target: sandboxId, result: 'denied' });
      throw new Error('Command rejected by security policy');
    }

    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command];
    const result = spawnSync(shell, args, {
      cwd: sandbox.workDir,
      encoding: 'utf8',
      timeout: Math.min(Math.max(options?.timeout ?? 30000, 100), 300000),
      maxBuffer: 1024 * 1024,
      shell: false,
      windowsHide: true,
      env: { PATH: process.env.PATH || '', LANG: process.env.LANG || 'C', ...options?.env, SANDBOX_ID: sandboxId, SANDBOX_DIR: sandbox.workDir }
    });

    const timedOut = result.error?.name === 'Error' && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
    const exitCode = timedOut ? 124 : (typeof result.status === 'number' ? result.status : 1);
    const stdout = String(result.stdout ?? '');
    const stderr = String(result.stderr ?? result.error?.message ?? '');
    const finalResult: SandboxResult = { exitCode, stdout, stderr, duration: Date.now() - start };
    this.security.auditLog({ timestamp: new Date(), action: 'sandbox.execute', target: sandboxId, result: exitCode === 0 ? 'success' : `exit:${exitCode}` });
    return finalResult;
  }

  destroy(sandboxId: string): boolean {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return false;
    try { rmSync(sandbox.workDir, { recursive: true, force: true }); } catch { return false; }
    sandbox.status = 'destroyed';
    this.sandboxes.delete(sandboxId);
    return true;
  }

  listSandboxes(): Sandbox[] { return Array.from(this.sandboxes.values()); }
  destroyAll(): void { for (const id of [...this.sandboxes.keys()]) this.destroy(id); }
}
