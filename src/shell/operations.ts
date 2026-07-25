import { spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';

export interface ShellInfo { name: string; path: string; version: string; available: boolean }
export interface ShellResult { exitCode: number; stdout: string; stderr: string; duration: number }

export class ShellOperations extends EventEmitter {
  private defaultShell: string;
  constructor() { super(); this.defaultShell = this.detectShell(); }

  detectShell(): string {
    const shells = ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/bin/dash'];
    for (const s of shells) { try { execSync(`test -x "${s}"`, { stdio: 'ignore' }); return s; } catch {} }
    return '/bin/sh';
  }

  getAvailableShells(): ShellInfo[] {
    const paths = ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/bin/dash', '/usr/bin/zsh'];
    return paths.map(p => {
      let version = ''; let available = false;
      try { version = execSync(`"${p}" --version 2>&1 | head -1`, { encoding: 'utf-8', timeout: 2000 }).trim(); available = true; } catch {}
      return { name: p.split('/').pop() || p, path: p, version, available };
    }).filter(s => s.available);
  }

  setDefaultShell(path: string): void { this.defaultShell = path; }
  getDefaultShell(): string { return this.defaultShell; }

  execute(command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<ShellResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const proc = spawn(this.defaultShell, ['-c', command], {
        cwd: options?.cwd, env: { ...process.env, ...options?.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); this.emit('output', { stream: 'stdout', data: d.toString() }); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); this.emit('output', { stream: 'stderr', data: d.toString() }); });
      const timer = options?.timeout ? setTimeout(() => { proc.kill('SIGTERM'); }, options.timeout) : undefined;
      proc.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim(), duration: Date.now() - start }); });
      proc.on('error', () => { if (timer) clearTimeout(timer); resolve({ exitCode: 1, stdout: '', stderr: 'Failed to start shell', duration: Date.now() - start }); });
    });
  }
}
