import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { PluginManifest, PluginContext, PluginInstance, LoadedPlugin, UIExtension } from './types.js';
import { ToolRegistry } from '../registry/registry.js';
import { AgentHarness } from '../agent/harness.js';
import { Planner } from '../planner/planner.js';

export class PluginManager extends EventEmitter {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private extensions: UIExtension[] = [];
  private registry: ToolRegistry;
  private agentHarness: AgentHarness;
  private planner: Planner;
  private pluginsDir: string;

  constructor(
    pluginsDir: string,
    registry: ToolRegistry,
    agentHarness: AgentHarness,
    planner: Planner
  ) {
    super();
    this.pluginsDir = pluginsDir;
    this.registry = registry;
    this.agentHarness = agentHarness;
    this.planner = planner;
  }

  async loadAll(): Promise<number> {
    if (!existsSync(this.pluginsDir)) return 0;

    const entries = readdirSync(this.pluginsDir);
    let loaded = 0;

    for (const entry of entries) {
      const pluginDir = join(this.pluginsDir, entry);
      if (!statSync(pluginDir).isDirectory()) continue;

      try {
        await this.loadPlugin(pluginDir);
        loaded++;
      } catch (err) {
        console.error(`[plugin] Failed to load ${entry}:`, err);
      }
    }

    return loaded;
  }

  async loadPlugin(pluginDir: string): Promise<LoadedPlugin | null> {
    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`No plugin.json found in ${pluginDir}`);
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already loaded`);
    }

    const context = this.createContext();
    const entryPath = join(pluginDir, manifest.entryPoint);

    let instance: PluginInstance;
    if (existsSync(entryPath)) {
      const mod = await import(entryPath);
      instance = mod.default || mod;
    } else {
      instance = {};
    }

    const loaded: LoadedPlugin = { manifest, instance, context };
    this.plugins.set(manifest.id, loaded);

    if (instance.activate) {
      await instance.activate(context);
    }

    this.emit('pluginLoaded', manifest);
    return loaded;
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (plugin.instance.deactivate) {
      await plugin.instance.deactivate();
    }

    this.plugins.delete(pluginId);
    this.emit('pluginUnloaded', plugin.manifest);
    return true;
  }

  private createContext(): PluginContext {
    return {
      registerTool: (tool) => {
        this.registry.registerTool(tool);
        this.emit('toolRegistered', tool);
      },
      registerAgent: (def) => {
        this.agentHarness.registerAgent(def);
        this.emit('agentRegistered', def);
      },
      registerTemplate: (template) => {
        this.planner.registerTemplate(template);
        this.emit('templateRegistered', template);
      },
      registerUIExtension: (ext) => {
        this.extensions.push(ext);
        this.emit('uiExtensionRegistered', ext);
      },
      getConfig: () => ({}),
      log: (level, message) => {
        console.log(`[plugin:${level}] ${message}`);
      },
    };
  }

  get(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  listUIExtensions(): UIExtension[] {
    return [...this.extensions];
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
}
