export interface SecurityPolicy {
  allowedCommands: string[];
  deniedCommands: string[];
  networkRestrictions: boolean;
  auditLogging: boolean;
  credentialEncryption: boolean;
}

export class SecurityManager {
  private policy: SecurityPolicy;

  constructor() {
    this.policy = {
      allowedCommands: [],
      deniedCommands: ['rm -rf /', 'mkfs', 'dd if='],
      networkRestrictions: false,
      auditLogging: true,
      credentialEncryption: true
    };
  }

  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  updatePolicy(patch: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...patch };
  }

  isCommandAllowed(command: string): boolean {
    if (this.policy.deniedCommands.some(d => command.includes(d))) return false;
    if (this.policy.allowedCommands.length === 0) return true;
    return this.policy.allowedCommands.some(a => command.startsWith(a));
  }

  auditLog(entry: { timestamp: Date; action: string; target: string; user?: string; result: string }): void {
    if (!this.policy.auditLogging) return;
    console.log(`[audit] ${entry.timestamp.toISOString()} ${entry.action} -> ${entry.target} [${entry.result}]`);
  }
}
