import { execSync } from 'child_process';

const RG_PATHS = [
  '/usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/codex-path/rg',
  '/usr/bin/rg', '/usr/local/bin/rg',
];

export interface SearchResult { file: string; line: number; content: string; match?: string }
export interface FileInfo { path: string; size: number; lines: number; type: string }

export class CodeSearch {
  private rgPath: string;
  constructor() {
    this.rgPath = RG_PATHS.find(p => { try { execSync(`test -x "${p}"`, { stdio: 'ignore' }); return true; } catch { return false; } }) || 'rg';
  }

  search(query: string, path = '.', options?: { glob?: string; maxResults?: number }): SearchResult[] {
    try {
      const args = ['--json', '-n', query, path];
      if (options?.glob) args.push('--glob', options.glob);
      const output = execSync(`"${this.rgPath}" ${args.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024 });
      const results: SearchResult[] = [];
      for (const line of output.trim().split('\n')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match') {
            const d = parsed.data || parsed;
            results.push({
              file: d.path?.text || parsed.path?.text || '',
              line: d.lines?.line_number || d.line_number || parsed.line_number || 0,
              content: (d.lines?.text || parsed.data?.text || '').trim(),
              match: d.submatches?.[0]?.match?.text || parsed.submatches?.[0]?.match?.text
            });
            if (options?.maxResults && results.length >= options.maxResults) break;
          }
        } catch {}
      }
      return results;
    } catch { return []; }
  }

  searchFiles(pattern: string, path = '.'): string[] {
    try {
      const output = execSync(`"${this.rgPath}" --files --glob "${pattern}" "${path}"`, { encoding: 'utf-8', timeout: 10000 });
      return output.trim().split('\n').filter(Boolean);
    } catch { return []; }
  }

  getFileContent(filePath: string, startLine?: number, endLine?: number): string {
    try {
      let cmd = `cat "${filePath}"`;
      if (startLine && endLine) cmd = `sed -n '${startLine},${endLine}p' "${filePath}"`;
      else if (startLine) cmd = `sed -n '${startLine},\$p' "${filePath}"`;
      return execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    } catch { return ''; }
  }

  getFileInfo(filePath: string): FileInfo | null {
    try {
      const output = execSync(`wc -l < "${filePath}"`, { encoding: 'utf-8' }).trim();
      const lines = parseInt(output) || 0;
      const ext = filePath.split('.').pop() || '';
      return { path: filePath, size: 0, lines, type: ext };
    } catch { return null; }
  }
}
