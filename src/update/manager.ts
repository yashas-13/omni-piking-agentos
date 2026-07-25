import { InstallerManager } from '../installer/manager.js';
import { ToolRegistry } from '../registry/registry.js';
import { EventEmitter } from 'events';

export interface UpdateInfo {
  toolId: string;
  currentVersion: string;
  latestVersion: string;
  breakingChanges: boolean;
  securityPatch: boolean;
}

export class UpdateManager extends EventEmitter {
  private installer: InstallerManager;
  private registry: ToolRegistry;

  constructor(installer: InstallerManager, registry: ToolRegistry) {
    super();
    this.installer = installer;
    this.registry = registry;
  }

  async checkAll(): Promise<UpdateInfo[]> {
    const updates = await this.installer.checkForUpdates();
    const results: UpdateInfo[] = [];

    for (const [toolId, info] of updates) {
      results.push({
        toolId,
        currentVersion: info.current,
        latestVersion: info.available,
        breakingChanges: false,
        securityPatch: false
      });
    }

    this.emit('checkComplete', results);
    return results;
  }

  async updateTool(toolId: string): Promise<boolean> {
    this.emit('updateStart', { toolId });
    const result = await this.installer.update(toolId);
    this.emit('updateComplete', { toolId, success: result.success });
    return result.success;
  }

  async updateAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const installed = this.registry.listInstalled();

    for (const tool of installed) {
      try {
        const success = await this.updateTool(tool.toolId);
        results.set(tool.toolId, success);
      } catch {
        results.set(tool.toolId, false);
      }
    }

    return results;
  }
}
