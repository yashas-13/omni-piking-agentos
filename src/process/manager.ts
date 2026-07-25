import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

export interface TrackedProcess {
  id: string;
  name: string;
  command: string;
  pid: number;
  status: ProcessStatus;
  startedAt: Date;
  port?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  metadata?: Record<string, unknown>;
}

export type ProcessStatus = 'running' | 'paused' | 'stopped' | 'error';

export class ProcessManager extends EventEmitter {
  private processes: Map<string, TrackedProcess> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();

  track(id: string, name: string, command: string, proc: ChildProcess, port?: number): TrackedProcess {
    const tracked: TrackedProcess = {
      id,
      name,
      command,
      pid: proc.pid!,
      status: 'running',
      startedAt: new Date(),
      port
    };

    this.processes.set(id, tracked);
    this.childProcesses.set(id, proc);

    proc.on('exit', (code) => {
      const p = this.processes.get(id);
      if (p) {
        p.status = code === 0 ? 'stopped' : 'error';
        this.emit('processExit', { id, exitCode: code });
      }
    });

    proc.on('error', (err) => {
      const p = this.processes.get(id);
      if (p) {
        p.status = 'error';
        this.emit('processError', { id, error: err });
      }
    });

    this.emit('processTracked', tracked);
    return tracked;
  }

  get(id: string): TrackedProcess | undefined {
    return this.processes.get(id);
  }

  list(status?: ProcessStatus): TrackedProcess[] {
    const all = Array.from(this.processes.values());
    return status ? all.filter(p => p.status === status) : all;
  }

  listRunning(): TrackedProcess[] {
    return this.list('running');
  }

  pause(id: string): boolean {
    const proc = this.childProcesses.get(id);
    const tracked = this.processes.get(id);
    if (!proc || !tracked || tracked.status !== 'running') return false;

    try {
      proc.kill('SIGSTOP');
      tracked.status = 'paused';
      this.emit('processPaused', { id });
      return true;
    } catch {
      return false;
    }
  }

  resume(id: string): boolean {
    const proc = this.childProcesses.get(id);
    const tracked = this.processes.get(id);
    if (!proc || !tracked || tracked.status !== 'paused') return false;

    try {
      proc.kill('SIGCONT');
      tracked.status = 'running';
      this.emit('processResumed', { id });
      return true;
    } catch {
      return false;
    }
  }

  restart(id: string): boolean {
    const tracked = this.processes.get(id);
    if (!tracked) return false;

    this.kill(id);
    
    this.emit('processRestartRequested', {
      id,
      command: tracked.command,
      name: tracked.name
    });
    
    return true;
  }

  kill(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const proc = this.childProcesses.get(id);
    const tracked = this.processes.get(id);
    if (!proc || !tracked) return false;

    try {
      proc.kill(signal);
      tracked.status = 'stopped';
      this.childProcesses.delete(id);
      this.emit('processKilled', { id, signal });
      return true;
    } catch {
      return false;
    }
  }

  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const [id] of this.processes) {
      this.kill(id, signal);
    }
  }

  getStats(): { total: number; running: number; paused: number; stopped: number; error: number } {
    const all = Array.from(this.processes.values());
    return {
      total: all.length,
      running: all.filter(p => p.status === 'running').length,
      paused: all.filter(p => p.status === 'paused').length,
      stopped: all.filter(p => p.status === 'stopped').length,
      error: all.filter(p => p.status === 'error').length
    };
  }
}
