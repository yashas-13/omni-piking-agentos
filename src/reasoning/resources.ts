import { execSync } from 'child_process';
import { ResourceState, InstalledResource, AvailableResource, SpaceInfo, MemoryInfo, NetworkState } from './types.js';
import { ToolRegistry } from '../registry/registry.js';

export class ResourceOracle {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async assess(): Promise<ResourceState> {
    const [diskSpace, memory, network, installedTools, availableTools] = await Promise.all([
      this.getDiskSpace(),
      this.getMemory(),
      this.checkNetwork(),
      this.getInstalledTools(),
      this.getAvailableTools(),
    ]);

    return {
      diskSpace,
      memory,
      network,
      installedTools,
      availableTools,
      processes: [],
      compatibility: {},
    };
  }

  canExecute(command: string, requirements: string[]): { ok: boolean; reasons: string[] } {
    const reasons: string[] = [];
    for (const req of requirements) {
      if (req.startsWith('tool:')) {
        const toolId = req.slice(5);
        const installed = this.registry.getInstalledTool(toolId);
        if (!installed) reasons.push(`Tool '${toolId}' not installed`);
      }
      if (req === 'internet' || req === 'credentials') {
        // checked asynchronously, skip in sync check
      }
    }
    return { ok: reasons.length === 0, reasons };
  }

  checkDiskSpace(neededMB: number): boolean {
    try {
      const output = execSync("df -BM / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' }).trim();
      const availableMB = parseInt(output, 10);
      return !isNaN(availableMB) && availableMB >= neededMB;
    } catch {
      return true;
    }
  }

  private async getDiskSpace(): Promise<SpaceInfo> {
    try {
      const output = execSync("df -B1 / | tail -1", { encoding: 'utf-8' }).trim();
      const parts = output.split(/\s+/);
      const total = parseInt(parts[1], 10) || 0;
      const available = parseInt(parts[3], 10) || 0;
      const used = total - available;
      return { total, available, used, percentFree: total > 0 ? (available / total) * 100 : 0 };
    } catch {
      return { total: 0, available: 0, used: 0, percentFree: 100 };
    }
  }

  private async getMemory(): Promise<MemoryInfo> {
    try {
      const output = execSync("free -b | grep Mem", { encoding: 'utf-8' }).trim();
      const parts = output.split(/\s+/);
      const total = parseInt(parts[1], 10) || 0;
      const available = parseInt(parts[6], 10) || parseInt(parts[3], 10) || 0;
      return { total, available, percentFree: total > 0 ? (available / total) * 100 : 0 };
    } catch {
      return { total: 0, available: 0, percentFree: 100 };
    }
  }

  private async checkNetwork(): Promise<NetworkState> {
    try {
      const start = Date.now();
      execSync('ping -c 1 -W 2 8.8.8.8', { encoding: 'utf-8', timeout: 3000 });
      return { online: true, latency: Date.now() - start, dnsResolved: true };
    } catch {
      return { online: false };
    }
  }

  private async getInstalledTools(): Promise<InstalledResource[]> {
    const installed = this.registry.listInstalled();
    return installed.map(t => ({
      toolId: t.toolId,
      name: t.toolId,
      version: t.version,
      path: t.path,
      status: 'stopped' as const,
      port: t.port,
      lastVerified: t.updatedAt,
    }));
  }

  private async getAvailableTools(): Promise<AvailableResource[]> {
    const tools = this.registry.listTools();
    const installedIds = new Set(this.registry.listInstalled().map(t => t.toolId));
    return tools
      .filter(t => !installedIds.has(t.id))
      .map(t => ({
        toolId: t.id,
        name: t.name,
        category: t.category,
        canInstall: true,
        requiredDependencies: [],
        estimatedInstallSize: 'unknown',
      }));
  }
}
