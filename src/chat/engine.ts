import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { ChatMessage, ChatSession, ChatMode } from './types.js';
import { Planner } from '../planner/planner.js';
import { ReasoningEngine } from '../reasoning/engine.js';
import { AgentHarness } from '../agent/harness.js';
import { CLIController } from '../cli/controller.js';
import { ToolRegistry } from '../registry/registry.js';
import { OpenAIClient } from '../openai/client.js';

export class ChatEngine extends EventEmitter {
  private planner: Planner;
  private agentHarness: AgentHarness;
  private cli: CLIController;
  private registry: ToolRegistry;
  private reasoning: ReasoningEngine | null;
  private openai: OpenAIClient | null;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(planner: Planner, agentHarness: AgentHarness, cli: CLIController, registry: ToolRegistry, reasoning?: ReasoningEngine, openai?: OpenAIClient) {
    super();
    this.planner = planner;
    this.agentHarness = agentHarness;
    this.cli = cli;
    this.registry = registry;
    this.reasoning = reasoning || null;
    this.openai = openai || null;
  }

  createSession(title?: string): ChatSession {
    const session: ChatSession = {
      id: randomUUID(),
      title: title || `Chat ${new Date().toLocaleTimeString()}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      mode: 'planner',
    };
    this.sessions.set(session.id, session);
    this.emit('sessionCreated', session);
    return session;
  }

  getSession(id: string): ChatSession | undefined { return this.sessions.get(id); }

  listSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  deleteSession(id: string): boolean { return this.sessions.delete(id); }

  clearSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.messages = [];
    session.updatedAt = new Date();
    return true;
  }

  async sendMessage(sessionId: string, content: string): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const userMsg: ChatMessage = {
      id: randomUUID(), role: 'user', content, timestamp: new Date(),
    };
    session.messages.push(userMsg);
    session.updatedAt = new Date();
    this.emit('messageAdded', { sessionId, message: userMsg });

    const reply = await this.routeMessage(content, session);
    session.messages.push(reply);
    session.updatedAt = new Date();
    this.emit('messageAdded', { sessionId, message: reply });
    return reply;
  }

  private async routeMessage(content: string, session: ChatSession): Promise<ChatMessage> {
    const trimmed = content.trim();

    if (trimmed.startsWith('$ ') || trimmed.startsWith('> '))
      return this.handleShell(trimmed.slice(2), session);

    if (trimmed.startsWith('/mode '))
      return this.handleModeSwitch(trimmed.slice(6).trim(), session);

    if (trimmed === '/help' || trimmed === '?')
      return this.handleHelp(session);

    if (trimmed === '/status')
      return this.handleStatus(session);

    if (trimmed === '/tools')
      return this.handleListTools(session);

    if (trimmed.startsWith('/agent '))
      return this.handleAgentCommand(trimmed.slice(7).trim(), session);

    if (trimmed.startsWith('/exec '))
      return this.handleExecPlan(trimmed.slice(6).trim(), session);

    if (trimmed.startsWith('/auto '))
      return this.handleAutoToggle(trimmed.slice(6).trim(), session);

    if (trimmed === '/plans')
      return this.handleListPlans(session);

    // Conversational detection — greet, questions, chitchat
    const lower = trimmed.toLowerCase();
    if (/^(hi|hello|hey|howdy|sup|yo|greetings|good morning|good afternoon|good evening|how are you|what's up|whats up|hola|namaste)\b/.test(lower)) {
      return this.handleConversation(trimmed, session, 'greeting');
    }
    if (/^(thanks|thank you|thx|ty|cheers|appreciate|awesome|great|cool|nice|perfect)\b/.test(lower)) {
      return this.handleConversation(trimmed, session, 'thanks');
    }
    if (/^(who are you|what are you|what can you do|what do you do|tell me about yourself|help me understand|explain yourself)\b/.test(lower)) {
      return this.handleConversation(trimmed, session, 'identity');
    }
    if (/^(bye|goodbye|see ya|later|peace|quit|exit|close)\b/.test(lower)) {
      return this.handleConversation(trimmed, session, 'farewell');
    }
    // Short non-command inputs (<=3 words, no action patterns) -> conversational
    const wordCount = trimmed.split(/\s+/).length;
    const hasActionWord = /\b(install|update|verify|run|start|launch|stop|kill|build|test|deploy|download|configure|setup|set up|create|delete|remove|add|list|show|check|find|search|open|close|enable|disable|restart|reset|backup|restore)\b/i.test(trimmed);
    if (wordCount <= 4 && !hasActionWord && !/[\|;&`$]/.test(trimmed) && trimmed.length < 60) {
      return this.handleConversation(trimmed, session, 'chat');
    }

    return this.handlePlanner(trimmed, session);
  }

  // ─── CONVERSATIONAL RESPONSES ────────────────────────────────
  private handleConversation(input: string, session: ChatSession, type: string): ChatMessage {
    const lower = input.toLowerCase().trim();
    let content = '';

    switch (type) {
      case 'greeting': {
        const greetings = [
          "Hey there! 👋 I'm **Omni-Piking**, your AI agent king. What can I do for you?",
          "Hello! 🧠 I'm Omni-Piking — ready to install, configure, or manage any dev tool. What's up?",
          "Hi! 👑 Omni-Piking here. I can manage agents, run shell commands, plan tasks, and more. How can I help?",
          "Hey! I'm your agent orchestrator. Try `/help` to see what I can do, or just tell me what you need.",
          "Yo! 🚀 Omni-Piking ready to roll. Want to install something, check status, or just chat?",
        ];
        content = greetings[Math.floor(Math.random() * greetings.length)];
        break;
      }
      case 'thanks': {
        const thanks = [
          "You're welcome! 🙌 Let me know if you need anything else.",
          "Happy to help! 👑 That's what Omni-Piking is here for.",
          "Anytime! 🚀 Feel free to ask if more tasks come up.",
          "No problem! I'm always here when you need me.",
        ];
        content = thanks[Math.floor(Math.random() * thanks.length)];
        break;
      }
      case 'identity': {
        content = `I'm **Omni-Piking** 🧠👑 — an AI agent orchestrator and coding assistant.

**What I can do:**
- 📦 Install, update, and manage dev tools (Codex, Claude Code, OpenCode, etc.)
- 🖥️ Execute shell commands and manage processes
- 🤖 Start, stop, and monitor AI agents
- 📋 Plan and autonomously execute multi-step tasks
- 🔧 Configure tool settings and API keys (BYOK)
- 💬 Answer questions and chat about anything

**Key commands:**
- \`$ <command>\` — run shell directly
- \`/tools\` — list all registered tools
- \`/status\` — system overview
- \`/agent start <id>\` — start an agent
- \`/help\` — full command list

I work through the **9Router** gateway at \`localhost:20128\` and manage agents on port \`9420\`. What would you like to do?`;
        break;
      }
      case 'farewell': {
        const farewells = [
          "See you later! 👋 I'll be here when you need me.",
          "Bye! 🧠 Your agents are in good hands. Come back anytime.",
          "Take care! 👑 Omni-Piking signing off for now.",
          "Later! 🚀 Just ping me when you're ready to get back to work.",
        ];
        content = farewells[Math.floor(Math.random() * farewells.length)];
        break;
      }
      default: {
        content = this.generateChatResponse(lower, session);
        break;
      }
    }

    return {
      id: randomUUID(), role: 'assistant', content, timestamp: new Date(),
      metadata: { type: 'conversation', conversationType: type },
    };
  }

  private generateChatResponse(input: string, session: ChatSession): string {
    const msgCount = session.messages.filter(m => m.role === 'user').length;
    const history = session.messages.map(m => m.content.toLowerCase()).join(' ');

    if (input.includes('help') || input.includes('what can you')) {
      return "I'm your AI agent king! 👑 Try `/help` for commands, or just describe what you want — I'll figure out how to do it.";
    }
    if (input.includes('status') || input.includes('how are') || input.includes('doing')) {
      return "All systems operational! 🟢 The 9Router gateway is running, and I'm ready to manage agents and tools. Try `/status` for details.";
    }
    if (input.includes('name') || input.includes('who')) {
      return "I'm **Omni-Piking** 🧠 — the AI coding agent that acts as a king, with other agents as my commanders and ministers. No politics, no gimmicks!";
    }
    if (input.includes('plan') || input.includes('think') || input.includes('reason')) {
      return "I have a built-in reasoning engine! Ask me to plan something complex and I'll break it down into steps and execute autonomously.";
    }
    if (input.includes('agent') || input.includes('codex') || input.includes('claude')) {
      return "I manage multiple agents — Codex, Claude Code, OpenCode, Qwen Code, and more. Use `/tools` to see them all, or `/agent start <id>` to launch one.";
    }
    if (msgCount <= 2) {
      return "I hear you! I'm best at technical tasks — installing tools, running commands, planning workflows, or chatting about code. What interests you?";
    }
    return "Interesting! Tell me more — or if you have a task, I can plan and execute it autonomously. Try typing what you want done.";
  }
  // ─── SHELL EXECUTION ──────────────────────────────────────────
  private async handleShell(command: string, session: ChatSession): Promise<ChatMessage> {
    const startTime = Date.now();
    this.emit('systemEvent', { sessionId: session.id, type: 'shell', command });
    this.emit('stepEvent', { sessionId: session.id, type: 'shell:started', command });

    try {
      const result = await this.cli.execute(
        command.split(' ')[0], command.split(' ').slice(1), { timeout: 60_000 }
      );
      const duration = Date.now() - startTime;
      const parts: string[] = [];
      if (result.stdout.trim()) parts.push(result.stdout.trim());
      if (result.stderr.trim()) parts.push(`**stderr:**\n${result.stderr.trim()}`);

      const content = parts.join('\n\n') || `*(exit code ${result.exitCode}, ${duration}ms)*`;

      this.emit('stepEvent', {
        sessionId: session.id, type: 'shell:completed',
        command, exitCode: result.exitCode, duration, stdout: result.stdout, stderr: result.stderr,
      });

      return {
        id: randomUUID(), role: 'tool', content, timestamp: new Date(),
        metadata: {
          type: 'shell', exitCode: result.exitCode, duration,
          stdout: result.stdout, stderr: result.stderr,
        },
      };
    } catch (err) {
      this.emit('stepEvent', { sessionId: session.id, type: 'shell:error', command, error: String(err) });
      return {
        id: randomUUID(), role: 'system',
        content: `**Shell Error:** \`${err instanceof Error ? err.message : String(err)}\``,
        timestamp: new Date(), metadata: { type: 'error' },
      };
    }
  }

  // ─── PLANNER WITH AUTONOMOUS EXECUTION ─────────────────────────
  private async handlePlanner(input: string, session: ChatSession): Promise<ChatMessage> {
    const startTime = Date.now();
    this.emit('systemEvent', { sessionId: session.id, type: 'planning', input });
    this.emit('stepEvent', { sessionId: session.id, type: 'planner:thinking', input });

    // Check for template match first
    const template = this.planner.matchTemplate(input);
    if (template) {
      this.emit('stepEvent', { sessionId: session.id, type: 'planner:template', templateId: template.id, name: template.name });
    }

    const intent = this.planner.parseIntent(input);
    const plan = await this.planner.generatePlan(input);

    // Build verbose intent section
    let response = '';
    response += `🧠 **Intent Analysis**\n`;
    response += `- Action: \`${intent.action}\`\n`;
    if (intent.target) response += `- Target: \`${intent.target}\`\n`;
    response += `- Confidence: ${Math.round(intent.confidence * 100)}%\n`;
    if (Object.keys(intent.modifiers).length) {
      response += `- Modifiers: ${Object.entries(intent.modifiers).map(([k, v]) => `\`${k}=${v}\``).join(', ')}\n`;
    }
    response += `\n📋 **Plan:** ${plan.goal} (${plan.steps.length} steps)\n\n`;

    for (let i = 0; i < plan.steps.length; i++) {
      const s = plan.steps[i];
      const actionIcon: Record<string, string> = {
        install: '📦', update: '🔄', verify: '✅', run: '▶️', stop: '⏹️',
        build: '🔨', test: '🧪', deploy: '🚀', check: '🔍', download: '⬇️', configure: '⚙️',
      };
      response += `${actionIcon[s.action] || '•'} **Step ${i + 1}:** ${s.description}\n`;
      if (s.command) response += `   \`\`\`\n   $ ${s.command}\n   \`\`\`\n`;
    }

    // Autonomous execution — execute the plan immediately
    this.emit('stepEvent', { sessionId: session.id, type: 'planner:executing', planId: plan.id, steps: plan.steps.length });
    const executedPlan = await this.planner.executePlan(plan.id);
    if (!executedPlan) {
      return {
        id: randomUUID(), role: 'system', content: 'Failed to execute plan', timestamp: new Date(), metadata: { type: 'error' },
      };
    }
    const execDuration = Date.now() - startTime;

    // Build verbose execution results
    response += `\n---\n🚀 **Autonomous Execution Results** (${execDuration}ms)\n\n`;

    let allSuccess = true;
    for (let i = 0; i < executedPlan.steps.length; i++) {
      const s = executedPlan.steps[i];
      const icon = s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'skipped' ? '⏭️' : '⏸️';
      if (s.status === 'failed') allSuccess = false;
      response += `${icon} **Step ${i + 1}:** ${s.description}\n`;
      if (s.result) {
        response += `   Status: \`${s.status}\` | Exit: \`${s.result.exitCode}\` | Duration: \`${s.result.duration}ms\`\n`;
        if (s.result.stdout.trim()) {
          const lines = s.result.stdout.trim().split('\n');
          const preview = lines.length > 10 ? lines.slice(0, 10).join('\n') + `\n   ... (${lines.length - 10} more lines)` : lines.join('\n');
          response += `   **stdout:**\n   \`\`\`\n   ${preview.replace(/\n/g, '\n   ')}\n   \`\`\`\n`;
        }
        if (s.result.stderr.trim()) {
          response += `   **stderr:**\n   \`\`\`\n   ${s.result.stderr.trim().replace(/\n/g, '\n   ')}\n   \`\`\`\n`;
        }
      } else if (s.status === 'skipped') {
        response += `   *(skipped)*\n`;
      }
      response += `\n`;
    }

    const summaryIcon = allSuccess ? '✅' : '⚠️';
    response += `${summaryIcon} **Summary:** ${executedPlan.steps.filter(s => s.status === 'completed').length}/${executedPlan.steps.length} steps completed | Plan status: \`${executedPlan.status}\`\n`;

    this.emit('stepEvent', {
      sessionId: session.id, type: 'planner:completed',
      planId: plan.id, status: executedPlan.status, duration: execDuration,
      completedSteps: executedPlan.steps.filter(s => s.status === 'completed').length,
      totalSteps: executedPlan.steps.length,
    });

    return {
      id: randomUUID(), role: 'assistant', content: response, timestamp: new Date(),
      metadata: {
        type: 'planResult', planId: plan.id, status: executedPlan.status,
        duration: execDuration, autoExecuted: true,
        steps: executedPlan.steps.map(s => ({
          description: s.description, status: s.status,
          exitCode: s.result?.exitCode, duration: s.result?.duration,
          stdout: s.result?.stdout?.slice(0, 500), stderr: s.result?.stderr?.slice(0, 500),
        })),
      },
    };
  }

  // ─── MANUAL PLAN EXECUTION ────────────────────────────────────
  private async handleExecPlan(planId: string, session: ChatSession): Promise<ChatMessage> {
    this.emit('systemEvent', { sessionId: session.id, type: 'exec', planId });
    try {
      const plan = await this.planner.executePlan(planId);
    if (!plan) {
      return {
        id: randomUUID(), role: 'system', content: 'Plan not found or failed', timestamp: new Date(), metadata: { type: 'error' },
      };
    }
      const parts = plan.steps.map((s, i) => {
        const icon = s.status === 'completed' ? '✅' : '❌';
        let line = `${icon} Step ${i + 1}: ${s.description} — \`${s.status}\``;
        if (s.result) line += ` (exit ${s.result.exitCode}, ${s.result.duration}ms)`;
        if (s.result?.stdout?.trim()) line += `\n\`\`\`\n${s.result.stdout.trim().slice(0, 300)}\n\`\`\``;
        return line;
      });
      return {
        id: randomUUID(), role: 'assistant',
        content: `🚀 **Plan Executed:** ${plan.goal}\n\n${parts.join('\n\n')}\n\nStatus: \`${plan.status}\``,
        timestamp: new Date(), metadata: { type: 'planResult', planId, status: plan.status },
      };
    } catch (err) {
      return {
        id: randomUUID(), role: 'system',
        content: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(), metadata: { type: 'error' },
      };
    }
  }

  // ─── AUTO TOGGLE ──────────────────────────────────────────────
  private handleAutoToggle(value: string, session: ChatSession): ChatMessage {
    const mode = value.trim().toLowerCase();
    if (mode === 'on' || mode === 'off') {
      return {
        id: randomUUID(), role: 'system', timestamp: new Date(),
        content: `Autonomous execution **${mode}**.`,
        metadata: { type: 'autoToggle', mode },
      };
    }
    return {
      id: randomUUID(), role: 'system', timestamp: new Date(),
      content: `Usage: /auto on|off`,
      metadata: { type: 'error' },
    };
  }

  // ─── LIST PLANS ───────────────────────────────────────────────
  private handleListPlans(session: ChatSession): ChatMessage {
    const plans = this.planner.listPlans();
    if (!plans.length) return {
      id: randomUUID(), role: 'assistant', timestamp: new Date(),
      content: 'No plans yet. Type a natural language instruction to create one.',
      metadata: { type: 'planList' },
    };
    const lines = plans.map(p => {
      const icon = p.status === 'completed' ? '✅' : p.status === 'failed' ? '❌' : p.status === 'running' ? '🔄' : '⏸️';
      return `${icon} **${p.goal}** — ${p.steps.length} steps — \`${p.status}\` (\`${p.id.slice(0, 8)}\`)`;
    });
    return {
      id: randomUUID(), role: 'assistant', timestamp: new Date(),
      content: `**Plans** (${plans.length})\n\n${lines.join('\n')}`,
      metadata: { type: 'planList' },
    };
  }

  // ─── MODE SWITCH ──────────────────────────────────────────────
  private handleModeSwitch(mode: string, session: ChatSession): ChatMessage {
    const validModes: ChatMode[] = ['planner', 'agent', 'shell'];
    if (validModes.includes(mode as ChatMode)) {
      session.mode = mode as ChatMode;
      return {
        id: randomUUID(), role: 'system', timestamp: new Date(),
        content: `Switched to **${mode}** mode.`,
        metadata: { type: 'modeSwitch', mode },
      };
    }
    return {
      id: randomUUID(), role: 'system', timestamp: new Date(),
      content: `Unknown mode: ${mode}. Valid: ${validModes.join(', ')}`,
      metadata: { type: 'error' },
    };
  }

  // ─── HELP ─────────────────────────────────────────────────────
  private handleHelp(_session: ChatSession): ChatMessage {
    return {
      id: randomUUID(), role: 'assistant', timestamp: new Date(),
      content: `**AgentOS Chat Commands**

🧠 **Autonomous Execution** (default):
  Type any instruction — plan auto-generates and auto-executes.
  Examples: "install codex", "check for updates", "setup ai agents"

🖥️ **Shell Commands:**
  $ <command> — execute a shell command directly
  Examples: $ node --version, $ ls -la

📋 **Plan Management:**
  /plans — list all plans
  /exec <planId> — manually execute a plan

⚙️ **Settings:**
  /mode <planner|agent|shell> — switch chat mode
  /auto on|off — toggle autonomous execution

📊 **Info:**
  /status — show system status
  /tools — list registered tools
  /agent <start|stop|restart> <id> — manage agents
  /help — show this message
  ? — show this message`,
      metadata: { type: 'help' },
    };
  }

  // ─── STATUS ───────────────────────────────────────────────────
  private handleStatus(_session: ChatSession): ChatMessage {
    const toolCount = this.registry.listTools().length;
    const installedCount = this.registry.listInstalled().length;
    const runningAgents = this.agentHarness.listRunning().length;
    const plans = this.planner.listPlans();
    const completedPlans = plans.filter(p => p.status === 'completed').length;
    const failedPlans = plans.filter(p => p.status === 'failed').length;

    return {
      id: randomUUID(), role: 'assistant', timestamp: new Date(),
      content: `**System Status**

- Tools registered: ${toolCount}
- Tools installed: ${installedCount}
- Running agents: ${runningAgents}
- Plans: ${plans.length} total, ${completedPlans} completed, ${failedPlans} failed
- Chat sessions: ${this.sessions.size}`,
      metadata: { type: 'status' },
    };
  }

  // ─── LIST TOOLS ───────────────────────────────────────────────
  private handleListTools(_session: ChatSession): ChatMessage {
    const tools = this.registry.listTools();
    const installed = this.registry.listInstalled();
    const installedIds = new Set(installed.map(i => i.toolId));

    const lines = tools.map(t => {
      const status = installedIds.has(t.id) ? '✅' : '⬜';
      return `${status} **${t.name}** (\`${t.id}\`) — ${t.description}`;
    });

    return {
      id: randomUUID(), role: 'assistant', timestamp: new Date(),
      content: `**Registered Tools** (${tools.length})\n\n${lines.join('\n')}`,
      metadata: { type: 'toolList' },
    };
  }

  // ─── AGENT COMMANDS ───────────────────────────────────────────
  private async handleAgentCommand(input: string, _session: ChatSession): Promise<ChatMessage> {
    const parts = input.split(' ');
    const action = parts[0];
    const agentId = parts[1];

    if (!action || !agentId) {
      return {
        id: randomUUID(), role: 'system', timestamp: new Date(),
        content: 'Usage: /agent <start|stop|restart> <agent-id>',
        metadata: { type: 'error' },
      };
    }

    try {
      switch (action) {
        case 'start': {
          const instance = await this.agentHarness.start(agentId);
          return {
            id: randomUUID(), role: 'assistant', timestamp: new Date(),
            content: `🤖 Agent **${instance.definition.name}** started\n- Status: \`${instance.status}\`\n- PID: \`${instance.processId || '-'}\`\n- Port: \`${instance.definition.port || '-'}\``,
            metadata: { type: 'agentAction', action: 'start', agentId },
          };
        }
        case 'stop': {
          await this.agentHarness.stop(agentId);
          return {
            id: randomUUID(), role: 'assistant', timestamp: new Date(),
            content: `🛑 Agent \`${agentId}\` stopped`,
            metadata: { type: 'agentAction', action: 'stop', agentId },
          };
        }
        case 'restart': {
          await this.agentHarness.restart(agentId);
          return {
            id: randomUUID(), role: 'assistant', timestamp: new Date(),
            content: `🔄 Agent \`${agentId}\` restarting...`,
            metadata: { type: 'agentAction', action: 'restart', agentId },
          };
        }
        default:
          return {
            id: randomUUID(), role: 'system', timestamp: new Date(),
            content: `Unknown agent action: ${action}. Use start, stop, or restart.`,
            metadata: { type: 'error' },
          };
      }
    } catch (err) {
      return {
        id: randomUUID(), role: 'system', timestamp: new Date(),
        content: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { type: 'error' },
      };
    }
  }
}
