# ⚡ Omni-Piking v2.2 — AgentOS Core

> **The AI Agent King** — An autonomous agent orchestrator that manages, routes, and controls multiple CLI coding agents through a single unified dashboard.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Omni-Piking Core                      │
├─────────────┬──────────────┬──────────────┬─────────────┤
│  AI Planner │ Agent Harness│ Memory Engine│  Reasoning   │
├─────────────┴──────────────┴──────────────┴─────────────┤
│                    CLI Controller                        │
├─────────────┬──────────────────┬────────────────────────┤
│  Installer  │  Process Manager │   Update Manager       │
├─────────────┴──────────────────┴────────────────────────┤
│                    9Router Gateway                       │
│               http://localhost:20128/v1                  │
└─────────────────────────────────────────────────────────┘
```

## ✨ Features

### 🧠 AI Planner
- Natural language intent parsing with confidence scoring
- Multi-step plan generation with dependency analysis
- Autonomous execution with retry strategies
- Built-in templates for common operations

### 🤖 Agent Harness
- Agent lifecycle management (start/stop/restart)
- Process scheduling and resource allocation
- Context sharing between agents
- Real-time status monitoring

### 💬 Chat Engine
- **Conversational AI** — greetings, identity, chitchat detection
- **Shell execution** — `$ command` for direct shell access
- **Autonomous planning** — natural language triggers auto-execution
- **Multi-session** — create and manage multiple chat sessions
- **Slash commands** — `/help`, `/status`, `/tools`, `/agent`, `/plans`

### 📊 Dashboard
- **Live connection status** with signal bars and latency monitoring
- **Glass morphism** design with modern dark theme
- **Mobile-first** responsive layout with bottom navigation
- **Real-time WebSocket** events for all operations
- **17 panels** — Dashboard, Chat, Planner, Tools, Agents, Terminal, Logs, Workspaces, Reasoning, Security, VMs, Settings, OpenAI, Conversations, Tool Calls, Sandbox, Search, Shell

### 🔧 Tool Registry
- 17 pre-registered tools (Node.js, Python, Git, Codex, Claude Code, OpenCode, etc.)
- Official source verification
- Install/uninstall/update lifecycle
- Category filtering (AI Agents, Languages, Package Managers, VCS, Containers)

### 🧠 Reasoning Engine
- 7-step chain-of-thought reasoning
- Rule-based fallback (no LLM required)
- LLM augmentation via OpenAI/Ollama (optional)
- Pattern learning from execution history

### 🔒 Security
- Encrypted credential storage
- Command allow/deny policies
- Audit logging
- Workspace isolation

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yashas-13/omni-piking-agentos.git
cd omni-piking-agentos

# Install dependencies
npm install

# Build TypeScript
npx tsc

# Copy dashboard
cp src/dashboard/index.html dist/dashboard/

# Start the server
PORT=9420 node dist/main.js
```

Open `http://localhost:9420/dashboard` in your browser.

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | System status overview |
| `GET` | `/tools` | List all registered tools |
| `GET` | `/tools/installed` | List installed tools |
| `POST` | `/tools/install` | Install a tool |
| `POST` | `/tools/update` | Update a tool |
| `DELETE` | `/tools/:id` | Uninstall a tool |

### Chat Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/chat/sessions` | List all sessions |
| `POST` | `/chat/sessions` | Create new session |
| `GET` | `/chat/sessions/:id` | Get session with messages |
| `POST` | `/chat/sessions/:id/message` | Send a message |
| `POST` | `/chat/sessions/:id/clear` | Clear session messages |
| `DELETE` | `/chat/sessions/:id` | Delete a session |

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/running` | List running agents |
| `POST` | `/agents/start` | Start an agent |
| `POST` | `/agents/stop` | Stop an agent |
| `POST` | `/agents/restart` | Restart an agent |

### Planner Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/planner/plan` | Generate a plan |
| `POST` | `/planner/execute` | Execute a plan |
| `POST` | `/planner/cancel` | Cancel a plan |
| `GET` | `/planner/plans` | List all plans |
| `GET` | `/planner/templates` | List plan templates |

### Reasoning Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/reasoning/think` | Run chain-of-thought |
| `GET` | `/reasoning/llm` | Check LLM availability |
| `GET` | `/reasoning/patterns` | Learned patterns |
| `GET` | `/reasoning/context` | Recent context |

### WebSocket Events

Connect to `ws://localhost:9420/ws` for real-time events:

```json
{ "type": "connected", "clientId": "..." }
{ "type": "chat:message", "sessionId": "...", "message": {...} }
{ "type": "plan:started", "goal": "...", "stepCount": 3 }
{ "type": "plan:stepCompleted", "stepId": "...", "duration": 1234 }
{ "type": "agent:started", "agent": { "name": "..." } }
{ "type": "process:started", "processId": "..." }
```

## 🔧 Configuration

### Environment Variables

```bash
PORT=9420                    # API server port
OPENAI_API_KEY=sk-...        # OpenAI API key (BYOK)
OPENAI_BASE_URL=...          # Custom OpenAI-compatible endpoint
OPENAI_MODEL=gpt-4o-mini     # Model to use
```

### BYOK (Bring Your Own Key)

Configure OpenAI directly from the dashboard Settings panel or via API:

```bash
curl -X POST http://localhost:9420/openai/config \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"sk-...","baseUrl":"https://api.openai.com/v1","model":"gpt-4o-mini"}'
```

## 📁 Project Structure

```
agentos-core/
├── src/
│   ├── main.ts              # Entry point, wires all modules
│   ├── config.ts            # App configuration (port, name)
│   ├── api/
│   │   └── server.ts        # Express HTTP + WebSocket server
│   ├── chat/
│   │   ├── engine.ts        # Chat engine with conversational AI
│   │   └── types.ts         # Chat types and interfaces
│   ├── planner/
│   │   └── planner.ts       # Intent parsing, plan generation/execution
│   ├── reasoning/
│   │   ├── engine.ts        # Chain-of-thought reasoning
│   │   ├── patterns.ts      # Pattern learning
│   │   ├── context.ts       # Context management
│   │   ├── conflicts.ts     # Conflict resolution
│   │   └── llm.ts           # LLM integration
│   ├── agent/
│   │   └── harness.ts       # Agent lifecycle management
│   ├── cli/
│   │   └── controller.ts    # Shell command execution
│   ├── registry/
│   │   └── registry.ts      # Tool registry (17 tools)
│   ├── installer/
│   │   └── manager.ts       # Install/update/uninstall
│   ├── process/
│   │   └── manager.ts       # Process tracking
│   ├── workspace/
│   │   └── manager.ts       # Workspace isolation
│   ├── download/
│   │   └── manager.ts       # Download management
│   ├── update/
│   │   └── manager.ts       # Update checking
│   ├── vm/
│   │   └── manager.ts       # VM management
│   ├── security/
│   │   └── manager.ts       # Security policies
│   ├── openai/
│   │   └── client.ts        # OpenAI BYOK client
│   ├── terminal/
│   │   └── renderer.ts      # Terminal output rendering
│   ├── conversation/
│   │   ├── state.ts         # Conversation state
│   │   └── toolcall.ts      # Tool call processing
│   ├── sandbox/
│   │   └── manager.ts       # Sandbox isolation
│   ├── search/
│   │   └── code.ts          # Code search (ripgrep)
│   ├── shell/
│   │   └── operations.ts    # Shell operations
│   └── dashboard/
│       └── index.html       # Single-file dashboard (2000+ lines)
├── docs/
│   ├── ARCHITECTURE.md      # Architecture deep-dive
│   ├── API.md               # Full API documentation
│   ├── DEPLOYMENT.md        # Deployment guide
│   └── CHANGELOG.md         # Version history
├── package.json
├── tsconfig.json
└── README.md
```

## 🧩 Embedded Agents

| Agent | Port | Status | Description |
|-------|------|--------|-------------|
| Codex CLI | — | ✅ Available | OpenAI Codex coding agent |
| Claude Code | — | ✅ Available | Anthropic Claude coding agent |
| OpenCode | — | ✅ Available | Open-source coding agent |
| Qwen Code | — | ✅ Available | Alibaba Qwen coding agent |
| Hermes | — | ✅ Available | NousResearch Hermes agent |

All agents route through **9Router** at `localhost:20128/v1`.

## 📱 Mobile Support

The dashboard is fully responsive with:
- **Bottom navigation** for quick panel switching
- **Swipeable sidebar** and session panels
- **Touch-friendly** buttons and inputs
- **Safe area** support for notched devices
- **Glass morphism** design that looks premium on mobile

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ (ESM) |
| Language | TypeScript 5.x |
| HTTP Server | Express.js |
| WebSocket | ws |
| Database | SQLite (better-sqlite3) |
| Frontend | Single-file HTML/CSS/JS |
| Design | Glass morphism, Inter + JetBrains Mono |
| Build | `npx tsc` |

## 📄 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Changelog](docs/CHANGELOG.md)

## 📜 License

MIT License — Built with ⚡ by Omni-Piking

---

**Omni-Piking** — *The AI Agent King* 👑
