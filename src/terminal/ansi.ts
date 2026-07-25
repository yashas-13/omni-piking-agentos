export const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m',
  underline: '\x1b[4m', blink: '\x1b[5m', reverse: '\x1b[7m', strikethrough: '\x1b[9m',
  black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
  gray: '\x1b[90m', bgBlack: '\x1b[40m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m', bgBlue: '\x1b[44m', bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};
export const CURSOR = { home: '\x1b[H', save: '\x1b[s', restore: '\x1b[u', hide: '\x1b[?25l', show: '\x1b[?25h' };
export const CLEAR = { screen: '\x1b[2J', line: '\x1b[2K', toEnd: '\x1b[K' };

export function color(text: string, ...styles: string[]): string { return styles.join('') + text + C.reset; }
export function moveTo(x: number, y: number): string { return `\x1b[${y};${x}H`; }

export function box(title: string, content: string, width = 60): string {
  const top = `${C.cyan}┌${'─'.repeat(width - 2)}┐${C.reset}`;
  const bot = `${C.cyan}└${'─'.repeat(width - 2)}┘${C.reset}`;
  const titleLine = `${C.cyan}│${C.reset} ${C.bold}${C.cyan}${title}${C.reset}${' '.repeat(Math.max(0, width - title.length - 4))}${C.cyan}│${C.reset}`;
  const lines = content.split('\n').map(l => {
    const padded = l.length > width - 4 ? l.slice(0, width - 7) + '...' : l;
    return `${C.cyan}│${C.reset} ${padded}${' '.repeat(Math.max(0, width - padded.length - 3))}${C.cyan}│${C.reset}`;
  });
  return [top, titleLine, `${C.cyan}│${'─'.repeat(width - 2)}│${C.reset}`, ...lines, bot].join('\n');
}

export function table(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] || '').length)));
  const sep = colWidths.map(w => '─'.repeat(w + 2)).join('┼');
  const hdr = headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('│');
  const data = rows.map(r => r.map((c, i) => ` ${c.padEnd(colWidths[i])} `).join('│'));
  return [`${C.bold}${hdr}${C.reset}`, sep, ...data].join('\n');
}

export function progressBar(percent: number, width = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = `${C.green}${'█'.repeat(filled)}${C.gray}${'░'.repeat(empty)}${C.reset}`;
  return `${bar} ${percent.toFixed(1)}%`;
}

export function statusLine(items: { label: string; value: string; color?: string }[]): string {
  return items.map(i => `${C.gray}${i.label}:${C.reset} ${i.color || ''}${i.value}${C.reset}`).join('  ');
}
