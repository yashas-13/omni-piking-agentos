# API Reference — Omni-Piking AgentOS

Base URL: `http://localhost:9420`

## System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | System status (tools, agents, sessions, plans) |
| `GET` | `/health` | Health check |

## Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tools` | List all tools (query: `?category=`, `?platform=`) |
| `GET` | `/tools/installed` | List installed tools |
| `GET` | `/tools/updates` | Check for available updates |
| `GET` | `/tools/:id` | Get tool details |
| `POST` | `/tools/install` | Install tool (`{ toolId }`) |
| `POST` | `/tools/update` | Update tool (`{ toolId }`) |
| `DELETE` | `/tools/:id` | Uninstall tool |

## Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/running` | List running agents |
| `POST` | `/agents/start` | Start agent (`{ agentId, context? }`) |
| `POST` | `/agents/stop` | Stop agent (`{ agentId }`) |
| `POST` | `/agents/restart` | Restart agent (`{ agentId }`) |

## Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/chat/sessions` | List all sessions |
| `POST` | `/chat/sessions` | Create session (`{ title? }`) |
| `GET` | `/chat/sessions/:id` | Get session with messages |
| `POST` | `/chat/sessions/:id/message` | Send message (`{ content }`) |
| `POST` | `/chat/sessions/:id/clear` | Clear session messages |
| `DELETE` | `/chat/sessions/:id` | Delete session |

### Chat Message Response

```json
{
  "id": "uuid",
  "role": "assistant",
  "content": "Response text",
  "timestamp": "2026-07-25T02:00:00.000Z",
  "metadata": {
    "type": "conversation|shell|planResult|help|status|error",
    "duration": 1234,
    "exitCode": 0
  }
}
```

## Planner

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/planner/plan` | Generate plan (`{ goal }`) |
| `POST` | `/planner/execute` | Execute plan (`{ planId }`) |
| `POST` | `/planner/cancel` | Cancel plan (`{ planId }`) |
| `GET` | `/planner/plans` | List all plans |
| `GET` | `/planner/plans/:id` | Get plan details |
| `GET` | `/planner/templates` | List plan templates |
| `POST` | `/planner/template/execute` | Execute template (`{ templateId }`) |
| `POST` | `/planner/parse` | Parse intent (`{ input }`) |

## Reasoning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/reasoning/think` | Chain-of-thought reasoning (`{ input }`) |
| `GET` | `/reasoning/llm` | Check LLM availability |
| `GET` | `/reasoning/patterns` | Learned patterns |
| `GET` | `/reasoning/context` | Recent context |

## OpenAI (BYOK)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/openai/status` | Check OpenAI configuration |
| `POST` | `/openai/config` | Set API key (`{ apiKey, baseUrl?, model? }`) |
| `POST` | `/openai/chat` | Send chat completion (`{ message }` or `{ messages }`) |

## Processes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/processes` | List processes |
| `GET` | `/processes/stats` | Process statistics |
| `POST` | `/processes/:id/pause` | Pause process |
| `POST` | `/processes/:id/resume` | Resume process |
| `POST` | `/processes/:id/kill` | Kill process |

## Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/workspaces` | List workspaces |
| `POST` | `/workspaces` | Create workspace (`{ name, projectPath? }`) |
| `DELETE` | `/workspaces/:id` | Delete workspace |

## Downloads

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/downloads` | List downloads |
| `GET` | `/downloads/active` | Active downloads |
| `POST` | `/downloads` | Start download (`{ url, options? }`) |
| `POST` | `/downloads/:id/pause` | Pause download |
| `POST` | `/downloads/:id/resume` | Resume download |

## Security

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/security/policy` | Get security policy |
| `POST` | `/security/check` | Check command (`{ command }`) |

## VMs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/vms` | List VMs |
| `POST` | `/vms` | Create VM (`{ name, image }`) |
| `POST` | `/vms/:id/start` | Start VM |
| `POST` | `/vms/:id/stop` | Stop VM |
| `DELETE` | `/vms/:id` | Delete VM |
| `POST` | `/vms/:id/snapshot` | Snapshot VM |

## WebSocket Protocol

Connect: `ws://localhost:9420/ws`

### Client → Server
```json
{ "type": "ping" }
```

### Server → Client Events
```json
{ "type": "connected", "clientId": "..." }
{ "type": "chat:message", "sessionId": "...", "message": { "role": "...", "content": "..." } }
{ "type": "plan:started", "goal": "...", "stepCount": 3 }
{ "type": "plan:stepStarted", "stepId": "...", "stepIndex": 0, "description": "...", "command": "..." }
{ "type": "plan:stepOutput", "stepId": "...", "exitCode": 0, "duration": 1234 }
{ "type": "plan:stepCompleted", "stepId": "...", "duration": 1234, "stdout": "..." }
{ "type": "plan:stepFailed", "stepId": "...", "error": "..." }
{ "type": "plan:completed", "goal": "...", "status": "completed", "duration": 5000 }
{ "type": "agent:started", "agent": { "id": "...", "name": "..." } }
{ "type": "agent:stopped", "agent": { "id": "..." } }
{ "type": "process:started", "processId": "...", "process": { "name": "..." } }
{ "type": "process:exit", "processId": "...", "exitCode": 0 }
{ "type": "reasoning:thinking", "input": "..." }
{ "type": "reasoning:complete", "confidence": 0.85, "planSteps": 3 }
{ "type": "reasoning:outcome", "action": "install", "target": "codex", "success": true }
```
