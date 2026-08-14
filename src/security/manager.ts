import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface SecurityPolicy {
  allowedCommands: string[];
  deniedCommands: string[];
  networkRestrictions: boolean;
  auditLogging: boolean;
  credentialEncryption: boolean;
  allowShell: boolean;
  maxCommandLength: number;
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  target: string;
  user?: string;
  result: string;
}

const DEFAULT_DENIED = [
  'rm -rf /', 'rm -rf /*', 'mkfs', 'fdisk', 'parted', 'dd if=',
  ':(){:|:&};:', 'shutdown', 'reboot', 'halt', 'poweroff',
  'curl | sh', 'wget | sh', 'curl | bash', 'wget | bash'
];

const SHELL_META = /[;&|`$()<>\n\r]/;

export class SecurityManager {
  private policy: SecurityPolicy;
  private readonly auditPath?: string;

  constructor(options?: { baseDir?: string }) {
    this.policy = {
      allowedCommands: [],
      deniedCommands: DEFAULT_DENIED,
      networkRestrictions: false,
      auditLogging: true,
      credentialEncryption: true,
      allowShell: false,
      maxCommandLength: 8192
    };
    if (options?.baseDir) {
      const dir = join(options.baseDir, 'audit');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.auditPath = join(dir, 'security.log');
    }
  }

  getPolicy(): SecurityPolicy {
    return { ...this.policy, deniedCommands: [...this.policy.deniedCommands], allowedCommands: [...this.policy.allowedCommands] };
  }

  updatePolicy(patch: Partial<SecurityPolicy>): void {
    this.policy = {
      ...this.policy,
      ...patch,
      maxCommandLength: Math.max(1, patch.maxCommandLength ?? this.policy.maxCommandLength)
    };
  }

  isCommandAllowed(command: string, options?: { allowShell?: boolean }): boolean {
    const normalized = command.trim();
    if (!normalized || normalized.length > this.policy.maxCommandLength) return false;
    const lower = normalized.toLowerCase();
    if (this.policy.deniedCommands.some(d => lower.includes(d.toLowerCase()))) return false;

    const shellAllowed = options?.allowShell ?? this.policy.allowShell;
    if (!shellAllowed && SHELL_META.test(normalized)) return false;

    if (this.policy.allowedCommands.length === 0) return true;
    return this.policy.allowedCommands.some(prefix => {
      const p = prefix.trim().toLowerCase();
      return lower === p || lower.startsWith(`${p} `);
    });
  }

  auditLog(entry: AuditEntry): void {
    if (!this.policy.auditLogging) return;
    const line = JSON.stringify({ ...entry, timestamp: entry.timestamp.toISOString() });
    console.log(`[audit] ${entry.timestamp.toISOString()} ${entry.action} -> ${entry.target} [${entry.result}]`);
    if (this.auditPath) {
      try { appendFileSync(this.auditPath, `${line}\n`, { encoding: 'utf8', mode: 0o600 }); }
      catch (err) { console.error('[security] failed to persist audit event:', err); }
    }
  }
}
