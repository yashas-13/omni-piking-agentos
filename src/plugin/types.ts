import { ToolDefinition } from '../registry/types.js';
import { WorkflowTemplate } from '../planner/types.js';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  entryPoint: string;
  capabilities: PluginCapability[];
  dependencies?: string[];
  minAgentOSVersion?: string;
}

export type PluginCapability = 'tool-adapter' | 'agent-type' | 'workflow-template' | 'ui-extension' | 'language-support';

export interface PluginContext {
  registerTool(tool: ToolDefinition): void;
  registerAgent(definition: any): void;
  registerTemplate(template: WorkflowTemplate): void;
  registerUIExtension(extension: UIExtension): void;
  getConfig(): Record<string, unknown>;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface UIExtension {
  id: string;
  type: 'sidebar' | 'settings' | 'dashboard-card' | 'tool-page' | 'terminal-tab';
  label: string;
  component: string;
  position?: number;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: PluginInstance;
  context: PluginContext;
}

export interface PluginInstance {
  activate?(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
