export interface ToolDef { name: string; description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<string> }

export function getBuiltinTools(): ToolDef[] {
  return [
    { name: 'read_file', description: 'Read file contents', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute: async (args) => { const fs = await import('fs'); return fs.readFileSync(args.path as string, 'utf-8'); } },
    { name: 'write_file', description: 'Write content to file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      execute: async (args) => { const fs = await import('fs'); fs.writeFileSync(args.path as string, args.content as string); return 'Written successfully'; } },
    { name: 'run_command', description: 'Execute a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      execute: async (args) => { const { execSync } = await import('child_process'); try { return execSync(args.command as string, { encoding: 'utf-8', timeout: 30000 }); } catch (e: any) { return e.stderr || e.message; } } },
    { name: 'list_directory', description: 'List directory contents', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute: async (args) => { const fs = await import('fs'); return fs.readdirSync(args.path as string).join('\n'); } },
    { name: 'get_system_info', description: 'Get system information', parameters: { type: 'object', properties: {} },
      execute: async () => { const os = await import('os'); return `Platform: ${os.platform()} ${os.arch()}\nNode: ${process.version}\nRAM: ${Math.round(os.totalmem() / 1024 / 1024)}MB\nCPUs: ${os.cpus().length}`; } },
  ];
}
