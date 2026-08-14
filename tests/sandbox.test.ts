import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SandboxManager } from '../src/sandbox/manager.js';
import { SecurityManager } from '../src/security/manager.js';

test('sandbox executes inside its own workspace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentos-sandbox-'));
  try {
    const security = new SecurityManager({ baseDir: dir });
    const sandbox = new SandboxManager(dir, security);
    const created = sandbox.createSandbox('test');
    const result = sandbox.execute(created.id, 'pwd');
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), created.workDir);
    assert.equal(sandbox.destroy(created.id), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox rejects shell chaining unless explicitly enabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentos-sandbox-'));
  try {
    const security = new SecurityManager({ baseDir: dir });
    const sandbox = new SandboxManager(dir, security);
    const created = sandbox.createSandbox('test');
    assert.throws(() => sandbox.execute(created.id, 'echo safe && echo unsafe'), /security policy/);
    sandbox.destroy(created.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
