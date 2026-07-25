import { C, box, table, progressBar, statusLine } from './ansi.js';

export interface DashboardData {
  tools: { name: string; status: string }[];
  agents: { name: string; status: string; port?: number }[];
  processes: { total: number; running: number };
  sessions: number;
  plans: number;
  uptime: string;
}

export class TerminalRenderer {
  renderDashboard(data: DashboardData): string {
    const lines: string[] = [];
    lines.push(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.bold}${C.cyan}║           OMNI-PIKING AGENTOS v2.1         ║${C.reset}`);
    lines.push(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════╝${C.reset}`);
    lines.push('');
    lines.push(statusLine([
      { label: 'Uptime', value: data.uptime, color: C.green },
      { label: 'Tools', value: `${data.tools.length}`, color: C.cyan },
      { label: 'Agents', value: `${data.agents.length}`, color: C.yellow },
      { label: 'Sessions', value: `${data.sessions}`, color: C.magenta },
    ]));
    lines.push('');
    lines.push(`${C.bold}Tools:${C.reset}`);
    for (const t of data.tools.slice(0, 8)) {
      const statusColor = t.status === 'installed' ? C.green : C.gray;
      lines.push(`  ${statusColor}●${C.reset} ${t.name} ${C.gray}(${t.status})${C.reset}`);
    }
    lines.push('');
    lines.push(`${C.bold}Agents:${C.reset}`);
    for (const a of data.agents) {
      const statusColor = a.status === 'running' ? C.green : C.red;
      lines.push(`  ${statusColor}●${C.reset} ${a.name} ${a.port ? `:${a.port}` : ''} ${C.gray}(${a.status})${C.reset}`);
    }
    lines.push('');
    lines.push(`${C.bold}Processes: ${data.processes.running}/${data.processes.total} running${C.reset}`);
    return lines.join('\n');
  }

  renderTable(headers: string[], rows: string[][]): string { return table(headers, rows); }
  renderProgressBar(percent: number, width?: number): string { return progressBar(percent, width); }
  renderStatusLine(items: { label: string; value: string; color?: string }[]): string { return statusLine(items); }
  renderBox(title: string, content: string, width?: number): string { return box(title, content, width); }
  clearScreen(): string { return '\x1b[2J\x1b[H'; }
  moveTo(x: number, y: number): string { return `\x1b[${y};${x}H`; }
}
