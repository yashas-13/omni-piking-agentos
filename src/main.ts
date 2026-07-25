import { join } from 'path';
import { APP_NAME, APP_VERSION, DEFAULT_PORT, DB_NAME } from './config.js';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { createServer } from 'http';
import { ToolRegistry } from './registry/registry.js';
import { CLIController } from './cli/controller.js';
import { InstallerManager } from './installer/manager.js';
import { ProcessManager } from './process/manager.js';
import { AgentHarness } from './agent/harness.js';
import { WorkspaceManager } from './workspace/manager.js';
import { DownloadManager } from './download/manager.js';
import { APIServer } from './api/server.js';
import { SecurityManager } from './security/manager.js';
import { UpdateManager } from './update/manager.js';
import { Planner } from './planner/planner.js';
import { StreamManager } from './websocket/stream.js';
import { PluginManager } from './plugin/manager.js';
import { ChatEngine } from './chat/engine.js';
import { ReasoningEngine } from './reasoning/engine.js';
import { OpenAIClient } from './openai/client.js';
import { TerminalRenderer } from './terminal/renderer.js';
import { ConversationState } from './conversation/state.js';
import { ToolCallProcessor } from './toolcall/processor.js';
import { SandboxManager } from './sandbox/manager.js';
import { CodeSearch } from './search/code-search.js';
import { ShellOperations } from './shell/operations.js';
import { VMManager } from './vm/manager.js';
import { ToolDefinition } from './registry/types.js';

const BASE_DIR = join(homedir(), '.agentos');
const DB_PATH = join(BASE_DIR, DB_NAME);
const DOWNLOADS_PATH = join(BASE_DIR, 'downloads');
const PLUGINS_DIR = join(BASE_DIR, 'plugins');

function ensureDirs(): void {
  for (const dir of [BASE_DIR, DOWNLOADS_PATH, PLUGINS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function registerDefaultTools(registry: ToolRegistry): void {
  const tools: ToolDefinition[] = [
    { id: 'nodejs', name: 'Node.js', description: 'JavaScript runtime', category: 'language', officialSource: 'https://nodejs.org', installer: { type: 'npm', command: 'node --version' }, updater: { type: 'npm', command: 'nvm install --lts' }, verifier: { type: 'version', command: 'node --version' }, executable: { name: 'node' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['javascript', 'runtime'] },
    { id: 'npm', name: 'npm', description: 'Node package manager', category: 'package-manager', officialSource: 'https://npmjs.com', installer: { type: 'npm', command: 'npm --version' }, updater: { type: 'npm', command: 'npm install -g npm@latest' }, verifier: { type: 'version', command: 'npm --version' }, executable: { name: 'npm' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['package-manager'] },
    { id: 'python', name: 'Python', description: 'Python programming language', category: 'language', officialSource: 'https://python.org', installer: { type: 'pip', command: 'python3 --version' }, updater: { type: 'pip', command: 'python3 -m pip install --upgrade pip' }, verifier: { type: 'version', command: 'python3 --version' }, executable: { name: 'python3' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['python'] },
    { id: 'git', name: 'Git', description: 'Version control system', category: 'vcs', officialSource: 'https://git-scm.com', installer: { type: 'apt', command: 'apt-get install -y git' }, updater: { type: 'apt', command: 'apt-get update && apt-get upgrade git' }, verifier: { type: 'version', command: 'git --version' }, executable: { name: 'git' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['version-control'] },
    { id: 'codex', name: 'Codex CLI', description: 'OpenAI Codex coding agent', category: 'ai-agent', officialSource: 'https://github.com/openai/codex', installer: { type: 'npm', command: 'npm install -g @openai/codex' }, updater: { type: 'npm', command: 'npm install -g @openai/codex@latest' }, verifier: { type: 'version', command: 'codex --version' }, executable: { name: 'codex' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'coding-agent'] },
    { id: 'claude-code', name: 'Claude Code', description: 'Anthropic Claude coding agent', category: 'ai-agent', officialSource: 'https://github.com/anthropics/claude-code', installer: { type: 'npm', command: 'npm install -g @anthropic-ai/claude-code' }, updater: { type: 'npm', command: 'npm install -g @anthropic-ai/claude-code@latest' }, verifier: { type: 'version', command: 'claude --version' }, executable: { name: 'claude' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'coding-agent'] },
    { id: 'openclaw', name: 'OpenClaw', description: 'Multi-channel AI gateway', category: 'ai-agent', officialSource: 'https://github.com/openclaw/openclaw', installer: { type: 'npm', command: 'npm install -g openclaw' }, updater: { type: 'npm', command: 'npm install -g openclaw@latest' }, verifier: { type: 'version', command: 'openclaw --version' }, executable: { name: 'openclaw' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'gateway'] },
    { id: '9router', name: '9Router', description: 'AI model router', category: 'ai-agent', officialSource: 'https://www.npmjs.com/package/9router', installer: { type: 'npm', command: 'npm install -g 9router@latest' }, updater: { type: 'npm', command: 'npm install -g 9router@latest' }, verifier: { type: 'version', command: '9router --version' }, executable: { name: '9router' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'router'] },
    { id: 'opencode', name: 'OpenCode', description: 'Open-source coding assistant', category: 'ai-agent', officialSource: 'https://github.com/opencode-ai/opencode', installer: { type: 'npm', command: 'npm install -g opencode' }, updater: { type: 'npm', command: 'npm install -g opencode@latest' }, verifier: { type: 'version', command: 'opencode --version' }, executable: { name: 'opencode' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'coding-agent'] },
    { id: 'hermes', name: 'Hermes', description: 'Meta Hermes LLM runtime', category: 'ai-agent', officialSource: 'https://github.com/nicepkg/hermes', installer: { type: 'npm', command: 'npm install -g hermes-cli' }, updater: { type: 'npm', command: 'npm install -g hermes-cli@latest' }, verifier: { type: 'version', command: 'hermes --version' }, executable: { name: 'hermes' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['ai', 'llm'] },
    { id: 'cargo', name: 'Cargo', description: 'Rust package manager', category: 'package-manager', officialSource: 'https://crates.io', installer: { type: 'cargo', command: 'cargo --version' }, updater: { type: 'cargo', command: 'rustup update' }, verifier: { type: 'version', command: 'cargo --version' }, executable: { name: 'cargo' }, platform: ['windows', 'linux', 'macos'], tags: ['rust'] },
    { id: 'uv', name: 'uv', description: 'Fast Python package installer', category: 'package-manager', officialSource: 'https://github.com/astral-sh/uv', installer: { type: 'binary', command: 'curl -LsSf https://astral.sh/uv/install.sh | sh' }, updater: { type: 'binary', command: 'uv self update' }, verifier: { type: 'version', command: 'uv --version' }, executable: { name: 'uv' }, platform: ['windows', 'linux', 'macos'], tags: ['python'] },
    { id: 'go', name: 'Go', description: 'Go programming language', category: 'language', officialSource: 'https://go.dev', installer: { type: 'binary', command: 'go version' }, updater: { type: 'binary', command: 'go get -u ./...' }, verifier: { type: 'version', command: 'go version' }, executable: { name: 'go' }, platform: ['android', 'windows', 'linux', 'macos'], tags: ['go'] },
    { id: 'homebrew', name: 'Homebrew', description: 'macOS/Linux package manager', category: 'package-manager', officialSource: 'https://brew.sh', installer: { type: 'binary', command: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' }, updater: { type: 'binary', command: 'brew update && brew upgrade' }, verifier: { type: 'version', command: 'brew --version' }, executable: { name: 'brew' }, platform: ['linux', 'macos'], tags: ['package-manager'] },
    { id: 'winget', name: 'winget', description: 'Windows Package Manager', category: 'package-manager', officialSource: 'https://github.com/microsoft/winget-cli', installer: { type: 'winget', command: 'winget --version' }, updater: { type: 'winget', command: 'winget upgrade --all' }, verifier: { type: 'version', command: 'winget --version' }, executable: { name: 'winget' }, platform: ['windows'], tags: ['windows'] },
    { id: 'chocolatey', name: 'Chocolatey', description: 'Windows package manager', category: 'package-manager', officialSource: 'https://chocolatey.org', installer: { type: 'choco', command: 'choco --version' }, updater: { type: 'choco', command: 'choco upgrade all -y' }, verifier: { type: 'version', command: 'choco --version' }, executable: { name: 'choco' }, platform: ['windows'], tags: ['windows'] },
    { id: 'docker', name: 'Docker', description: 'Container platform', category: 'container', officialSource: 'https://docker.com', installer: { type: 'binary', command: 'docker --version' }, updater: { type: 'binary', command: 'docker pull docker:latest' }, verifier: { type: 'version', command: 'docker --version' }, executable: { name: 'docker' }, platform: ['windows', 'linux', 'macos'], tags: ['container'] },
  ];
  for (const tool of tools) registry.registerTool(tool);
}

function registerDefaultAgents(harness: AgentHarness): void {
  harness.registerAgent({ id: 'openclaw-gateway', name: 'OpenClaw Gateway', type: 'service', toolId: 'openclaw', command: 'openclaw', args: ['gateway', 'run', '--force', '--port', '18789'], port: 18789, autoRestart: true, maxRetries: 3 });
  harness.registerAgent({ id: 'codex-server', name: 'Codex Server', type: 'service', toolId: 'codex', command: 'codex', args: ['serve', '--port', '18923'], port: 18923, autoRestart: true, maxRetries: 3 });
  harness.registerAgent({ id: '9router', name: '9Router', type: 'service', toolId: '9router', command: '9router', args: ['serve', '--port', '20128'], port: 20128, autoRestart: true, maxRetries: 3 });
}

async function main(): Promise<void> {
  console.log(`[${APP_NAME.toLowerCase()}] Starting ${APP_NAME} Core v${APP_VERSION}...`);
  ensureDirs();

  // Core modules
  const registry = new ToolRegistry(DB_PATH);
  const cli = new CLIController();
  const installer = new InstallerManager(cli, registry);
  const processManager = new ProcessManager();
  const agentHarness = new AgentHarness(cli, processManager, registry);
  const workspaceManager = new WorkspaceManager({ basePath: BASE_DIR });
  const downloadManager = new DownloadManager(DOWNLOADS_PATH);
  const securityManager = new SecurityManager();
  const updateManager = new UpdateManager(installer, registry);
  const vmManager = new VMManager();
  const planner = new Planner(cli, installer, registry);
  const reasoningEngine = new ReasoningEngine(registry);
  await reasoningEngine.initialize();
  const openaiClient = new OpenAIClient();

  const chatEngine = new ChatEngine(planner, agentHarness, cli, registry, reasoningEngine, openaiClient);

  // Codex-equivalent modules
  const terminalRenderer = new TerminalRenderer();
  const conversationState = new ConversationState(DB_PATH);
  const toolCallProcessor = new ToolCallProcessor();
  const sandboxManager = new SandboxManager(BASE_DIR);
  const codeSearch = new CodeSearch();
  const shellOps = new ShellOperations();

  registerDefaultTools(registry);
  registerDefaultAgents(agentHarness);

  // HTTP server for API + WebSocket
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const api = new APIServer({ port, host: '0.0.0.0' }, registry, installer, processManager, agentHarness, workspaceManager, downloadManager, planner, chatEngine, reasoningEngine, openaiClient, terminalRenderer, conversationState, toolCallProcessor, sandboxManager, codeSearch, shellOps, securityManager, updateManager, vmManager);

  await api.start();

  // WebSocket on the same HTTP server
  const httpServer = api.getHttpServer();
  const streamManager = new StreamManager(httpServer, cli, processManager, agentHarness);

  // Wire chat engine events to WebSocket broadcast
  chatEngine.on('messageAdded', ({ sessionId, message }) => {
    streamManager.broadcastAll({ type: 'chat:message', sessionId, message });
  });
  chatEngine.on('sessionCreated', (session) => {
    streamManager.broadcastAll({ type: 'chat:sessionCreated', session });
  });
  chatEngine.on('systemEvent', (evt) => {
    streamManager.broadcastAll({ type: 'chat:systemEvent', ...evt });
  });
  chatEngine.on('stepEvent', (evt) => {
    streamManager.broadcastAll({ type: 'chat:stepEvent', ...evt });
  });

  // Wire planner events to WebSocket broadcast
  streamManager.setupPlannerListeners(planner);
  streamManager.setupChatListeners(chatEngine);
  streamManager.setupReasoningListeners(reasoningEngine);

  // Plugin system
  const pluginManager = new PluginManager(PLUGINS_DIR, registry, agentHarness, planner);
  const loadedCount = await pluginManager.loadAll();

  const toolCount = registry.listTools().length;
  console.log(`[${APP_NAME.toLowerCase()}] Registered ${toolCount} tools, ${registry.listInstalled().length} installed`);
  console.log(`[${APP_NAME.toLowerCase()}] Loaded ${loadedCount} plugins`);
  console.log(`[${APP_NAME.toLowerCase()}] API:    http://0.0.0.0:${port}`);
  console.log(`[${APP_NAME.toLowerCase()}] WS:     ws://0.0.0.0:${port}/ws`);
  console.log(`[${APP_NAME.toLowerCase()}] Dash:   http://localhost:${port}/dashboard`);

  const shutdown = async () => {
    console.log(`\n[${APP_NAME.toLowerCase()}] Shutting down...`);
    processManager.killAll();
    for (const a of agentHarness.listRunning()) await agentHarness.stop(a.definition.id);
    sandboxManager.destroyAll();
    conversationState.close();
    await api.stop();
    registry.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(`[${APP_NAME.toLowerCase()}] Fatal:`, err); process.exit(1); });
