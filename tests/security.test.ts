import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SecurityManager } from '../src/security/manager.js';

test('security policy rejects shell metacharacters by default', () => {
  const security = new SecurityManager();
  assert.equal(security.isCommandAllowed('echo safe'), true);
  assert.equal(security.isCommandAllowed('echo safe && whoami'), false);
  assert.equal(security.isCommandAllowed('rm -rf /'), false);
});

test('security allowlist matches command boundaries', () => {
  const security = new SecurityManager();
  security.updatePolicy({ allowedCommands: ['git'] });
  assert.equal(security.isCommandAllowed('git status'), true);
  assert.equal(security.isCommandAllowed('gitx status'), false);
});

test('security audit log is persisted with restrictive permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentos-security-'));
  try {
    const security = new SecurityManager({ baseDir: dir });
    security.auditLog({ timestamp: new Date(), action: 'test', target: 'unit', result: 'success' });
    const log = readFileSync(join(dir, 'audit', 'security.log'), 'utf8');
    assert.match(log, /"action":"test"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
