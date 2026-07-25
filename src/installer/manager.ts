import { CLIController } from '../cli/controller.js';
import { ToolRegistry } from '../registry/registry.js';
import { ToolDefinition, InstalledTool } from '../registry/types.js';
import { EventEmitter } from 'events';

export interface InstallResult {
  success: boolean;
  toolId: string;
  version?: string;
  path?: string;
  error?: string;
  duration: number;
}

export class InstallerManager extends EventEmitter {
  private cli: CLIController;
  private registry: ToolRegistry;
  private activeInstalls: Map<string, AbortController> = new Map();

  constructor(cli: CLIController, registry: ToolRegistry) {
    super();
    this.cli = cli;
    this.registry = registry;
  }

  async install(toolId: string): Promise<InstallResult> {
    const tool = this.registry.getTool(toolId);
    if (!tool) {
      return {
        success: false,
        toolId,
        error: `Tool '${toolId}' not found in registry`,
        duration: 0
      };
    }

    const existing = this.registry.getInstalledTool(toolId);
    if (existing?.status === 'installed') {
      return {
        success: true,
        toolId,
        version: existing.version,
        path: existing.path,
        duration: 0
      };
    }

    const startTime = Date.now();
    this.emit('installStart', { toolId });

    try {
      const result = await this.cli.execute(
        tool.installer.command.split(' ')[0],
        tool.installer.command.split(' ').slice(1),
        { timeout: tool.installer.timeout || 120000 }
      );

      if (result.exitCode === 0) {
        const version = await this.verifyTool(tool);
        this.registry.recordInstallation(toolId, version);
        
        this.emit('installComplete', { toolId, version });
        
        return {
          success: true,
          toolId,
          version,
          duration: Date.now() - startTime
        };
      } else {
        this.emit('installFailed', { toolId, error: result.stderr });
        
        return {
          success: false,
          toolId,
          error: result.stderr || `Installation failed with exit code ${result.exitCode}`,
          duration: Date.now() - startTime
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit('installFailed', { toolId, error });
      
      return {
        success: false,
        toolId,
        error,
        duration: Date.now() - startTime
      };
    }
  }

  async update(toolId: string): Promise<InstallResult> {
    const tool = this.registry.getTool(toolId);
    if (!tool) {
      return {
        success: false,
        toolId,
        error: `Tool '${toolId}' not found in registry`,
        duration: 0
      };
    }

    const startTime = Date.now();
    this.emit('updateStart', { toolId });

    try {
      const result = await this.cli.execute(
        tool.updater.command.split(' ')[0],
        tool.updater.command.split(' ').slice(1),
        { timeout: 120000 }
      );

      if (result.exitCode === 0) {
        const version = await this.verifyTool(tool);
        this.registry.updateToolStatus(toolId, 'installed');
        
        this.emit('updateComplete', { toolId, version });
        
        return {
          success: true,
          toolId,
          version,
          duration: Date.now() - startTime
        };
      } else {
        return {
          success: false,
          toolId,
          error: result.stderr || `Update failed with exit code ${result.exitCode}`,
          duration: Date.now() - startTime
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        toolId,
        error,
        duration: Date.now() - startTime
      };
    }
  }

  async uninstall(toolId: string): Promise<boolean> {
    const installed = this.registry.getInstalledTool(toolId);
    if (!installed) return false;

    const tool = this.registry.getTool(toolId);
    if (!tool) return false;

    try {
      const uninstallCmd = this.getUninstallCommand(tool);
      await this.cli.execute(
        uninstallCmd.split(' ')[0],
        uninstallCmd.split(' ').slice(1)
      );
      
      this.registry.removeInstallation(toolId);
      this.emit('uninstallComplete', { toolId });
      return true;
    } catch {
      return false;
    }
  }

  private getUninstallCommand(tool: ToolDefinition): string {
    switch (tool.installer.type) {
      case 'npm':
        return `npm uninstall -g ${tool.executable.name}`;
      case 'pip':
        return `pip uninstall -y ${tool.executable.name}`;
      case 'cargo':
        return `cargo uninstall ${tool.executable.name}`;
      default:
        return `rm -f $(which ${tool.executable.name})`;
    }
  }

  async verifyTool(tool: ToolDefinition): Promise<string> {
    try {
      const result = await this.cli.execute(
        tool.verifier.command.split(' ')[0],
        tool.verifier.command.split(' ').slice(1),
        { timeout: 10000 }
      );
      
      const output = result.stdout.trim();
      const versionMatch = output.match(/[\d]+\.[\d]+[\.\d]*/);
      return versionMatch ? versionMatch[0] : output.split('\n')[0];
    } catch {
      return 'unknown';
    }
  }

  async checkForUpdates(): Promise<Map<string, { current: string; available: string }>> {
    const updates = new Map<string, { current: string; available: string }>();
    const installed = this.registry.listInstalled();

    for (const tool of installed) {
      const toolDef = this.registry.getTool(tool.toolId);
      if (!toolDef) continue;

      try {
        const currentVersion = tool.version;
        const latestVersion = await this.getLatestVersion(toolDef);
        
        if (latestVersion && latestVersion !== currentVersion) {
          updates.set(tool.toolId, {
            current: currentVersion,
            available: latestVersion
          });
        }
      } catch {
        // Skip tools that can't check for updates
      }
    }

    return updates;
  }

  private async getLatestVersion(tool: ToolDefinition): Promise<string | null> {
    switch (tool.installer.type) {
      case 'npm': {
        const result = await this.cli.execute('npm', ['view', tool.executable.name, 'version']);
        return result.exitCode === 0 ? result.stdout.trim() : null;
      }
      case 'pip': {
        const result = await this.cli.execute('pip', ['index', 'versions', tool.executable.name]);
        if (result.exitCode === 0) {
          const match = result.stdout.match(/LATEST:\s*([\d.]+)/);
          return match ? match[1] : null;
        }
        return null;
      }
      default:
        return null;
    }
  }

  cancelInstall(toolId: string): boolean {
    const controller = this.activeInstalls.get(toolId);
    if (!controller) return false;
    
    controller.abort();
    this.activeInstalls.delete(toolId);
    return true;
  }
}
