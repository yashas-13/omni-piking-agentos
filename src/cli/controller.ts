import { spawn, ChildProcess, ExecOptions } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface CommandResult {
  id: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
}

export class CLIController extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private outputBuffers: Map<string, { stdout: string; stderr: string }> = new Map();

  async execute(
    command: string,
    args: string[] = [],
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const id = randomUUID();
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: options.shell ?? false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.processes.set(id, proc);
      this.outputBuffers.set(id, { stdout: '', stderr: '' });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        this.outputBuffers.get(id)!.stdout = stdout;
        this.emit('output', { id, stream: 'stdout', data: chunk });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        this.outputBuffers.get(id)!.stderr = stderr;
        this.emit('output', { id, stream: 'stderr', data: chunk });
      });

      const timeoutId = options.timeout 
        ? setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Command timed out after ${options.timeout}ms`));
          }, options.timeout)
        : undefined;

      proc.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.processes.delete(id);
        this.outputBuffers.delete(id);

        resolve({
          id,
          exitCode: code ?? 1,
          stdout,
          stderr,
          duration: Date.now() - startTime
        });
      });

      proc.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.processes.delete(id);
        this.outputBuffers.delete(id);
        reject(err);
      });
    });
  }

  startProcess(
    command: string,
    args: string[] = [],
    options: CommandOptions = {}
  ): string {
    const id = randomUUID();

    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? false,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    this.processes.set(id, proc);
    this.outputBuffers.set(id, { stdout: '', stderr: '' });

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const buf = this.outputBuffers.get(id);
      if (buf) buf.stdout += chunk;
      this.emit('output', { id, stream: 'stdout', data: chunk });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const buf = this.outputBuffers.get(id);
      if (buf) buf.stderr += chunk;
      this.emit('output', { id, stream: 'stderr', data: chunk });
    });

    proc.on('close', (code) => {
      this.processes.delete(id);
      this.emit('processExit', { id, exitCode: code });
    });

    proc.on('error', (err) => {
      this.processes.delete(id);
      this.emit('processError', { id, error: err });
    });

    return id;
  }

  killProcess(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;

    proc.kill(signal);
    return true;
  }

  getProcess(id: string): ChildProcess | undefined {
    return this.processes.get(id);
  }

  listProcesses(): string[] {
    return Array.from(this.processes.keys());
  }

  getOutput(id: string): { stdout: string; stderr: string } | undefined {
    return this.outputBuffers.get(id);
  }

  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const [id, proc] of this.processes) {
      proc.kill(signal);
    }
    this.processes.clear();
  }
}
