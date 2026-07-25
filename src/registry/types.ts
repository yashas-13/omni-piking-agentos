export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  officialSource: string;
  installer: InstallerAdapter;
  updater: UpdateAdapter;
  verifier: VerifyAdapter;
  executable: ExecutableConfig;
  environment?: EnvironmentConfig;
  platform: Platform[];
  tags: string[];
}

export type ToolCategory = 
  | 'ai-agent' 
  | 'package-manager' 
  | 'build-tool' 
  | 'language' 
  | 'vcs' 
  | 'container' 
  | 'database' 
  | 'utility';

export type Platform = 'android' | 'ios' | 'windows' | 'linux' | 'macos' | 'web';

export interface InstallerAdapter {
  type: 'npm' | 'pip' | 'cargo' | 'brew' | 'apt' | 'winget' | 'choco' | 'git' | 'binary' | 'custom';
  command: string;
  preInstall?: string[];
  postInstall?: string[];
  timeout?: number;
}

export interface UpdateAdapter {
  type: 'npm' | 'pip' | 'cargo' | 'brew' | 'apt' | 'winget' | 'choco' | 'binary' | 'custom';
  command: string;
}

export interface VerifyAdapter {
  type: 'version' | 'which' | 'exists' | 'custom';
  command: string;
}

export interface ExecutableConfig {
  name: string;
  args?: string[];
  port?: number;
  healthCheck?: string;
}

export interface EnvironmentConfig {
  variables?: Record<string, string>;
  paths?: string[];
  requiredTools?: string[];
}

export interface InstalledTool {
  id: string;
  toolId: string;
  version: string;
  installedAt: Date;
  updatedAt: Date;
  status: ToolStatus;
  path?: string;
  pid?: number;
  port?: number;
  metadata?: Record<string, unknown>;
}

export type ToolStatus = 'installed' | 'running' | 'stopped' | 'error' | 'updating';
