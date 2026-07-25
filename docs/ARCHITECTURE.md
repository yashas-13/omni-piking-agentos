# Architecture Guide — Omni-Piking AgentOS

## System Overview

Omni-Piking is a single-process Node.js application that acts as a secure control plane for managing AI coding agents. It does NOT embed third-party tools — instead, it verifies, installs, and invokes them through their official distribution channels.

## Core Modules

### 1. API Server (`src/api/server.ts`)
- Express.js HTTP server with CORS, JSON parsing, error handling
- WebSocket server for real-time event streaming
- 80+ REST endpoints organized by domain
- Dashboard HTML served from memory at startup

### 2. Chat Engine (`src/chat/engine.ts`)
- Multi-session conversation management
- Message routing: shell commands, slash commands, conversational AI, planner
- Conversational detection with regex patterns for greetings, thanks, identity, farewell
- Autonomous plan execution triggered by natural language

### 3. AI Planner (`src/planner/planner.ts`)
- Intent parsing with confidence scoring
- Multi-step plan generation with dependency analysis
- Built-in templates for common operations
- Plan execution with retry strategies and rollback

### 4. Reasoning Engine (`src/reasoning/`)
- 7-step chain-of-thought reasoning pipeline
- Pattern learning from execution history
- Conflict detection and resolution
- LLM augmentation via OpenAI/Ollama (optional)
- Rule-based fallback when no LLM available

### 5. Agent Harness (`src/agent/harness.ts`)
- Agent lifecycle management (start/stop/restart)
- Process spawning and monitoring
- Resource allocation and limits
- Context sharing between agents

### 6. CLI Controller (`src/cli/controller.ts`)
- Shell command execution with timeout enforcement
- stdout/stderr capture
- Exit code handling
- Process queuing

### 7. Tool Registry (`src/registry/registry.ts`)
- 17 pre-registered developer tools
- Category and platform filtering
- Install status tracking
- Official source verification

### 8. Security Manager (`src/security/manager.ts`)
- Command allow/deny policies
- Encrypted credential storage
- Audit logging
- Workspace isolation

## Data Flow

```
User Input → Chat Engine → Intent Parser → Plan Generator
                                              ↓
                              Agent Harness → CLI Controller → Tool Execution
                                              ↓
                              Result Collector → Response Formatter → User
```

## WebSocket Events

All state changes are broadcast via WebSocket:

- `connected` — Client connected
- `chat:message` — New chat message
- `plan:started` — Plan execution started
- `plan:stepStarted` — Individual step started
- `plan:stepCompleted` — Step finished successfully
- `plan:stepFailed` — Step failed
- `plan:completed` — Plan finished
- `agent:started` — Agent process started
- `agent:stopped` — Agent process stopped
- `process:started` — Shell process started
- `process:exit` — Shell process exited
- `reasoning:thinking` — Chain-of-thought in progress
- `reasoning:complete` — Reasoning finished

## Port Architecture

| Port | Service | Description |
|------|---------|-------------|
| 9420 | Omni-Piking Core | HTTP API + WebSocket + Dashboard |
| 20128 | 9Router Gateway | AI model routing gateway |
| 10402 | Loki Auto | Browser extension proxy |

## Database

SQLite at `~/.agentos/omniping.db`:
- Chat sessions and messages
- Plans and execution history
- Reasoning patterns and context
- Tool installation metadata
- Security audit log
