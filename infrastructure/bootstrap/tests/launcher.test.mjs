import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
function invoke(t, caller, args) {
  const dir = mkdtempSync(join(tmpdir(), 'iac-bootstrap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'tofu.log');
  writeFileSync(join(dir, 'aws'), '#!/usr/bin/env node\nconsole.log(process.env.BOOTSTRAP_TEST_CALLER);\n', { mode: 0o755 });
  writeFileSync(join(dir, 'tofu'), '#!/usr/bin/env node\nimport {appendFileSync} from "node:fs"; appendFileSync(process.env.BOOTSTRAP_TEST_LOG,JSON.stringify(process.argv.slice(2))+"\\n");\n', { mode: 0o755 });
  const result = spawnSync('bash', [join(repo, 'bootstrap'), ...args], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, PATH: dir + ':' + process.env.PATH, BOOTSTRAP_TEST_CALLER: JSON.stringify(caller), BOOTSTRAP_TEST_LOG: log },
  });
  return { ...result, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

test('wrong account and root sessions cannot invoke OpenTofu bootstrap', t => {
  for (const caller of [
    { Account: '999999999999', Arn: 'arn:aws:sts::999999999999:assumed-role/Admin/test' },
    { Account: '071157021432', Arn: 'arn:aws:iam::071157021432:root' },
  ]) {
    const result = invoke(t, caller, ['account', 'plan']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-root administrator role/);
    assert.deepEqual(result.calls, []);
  }
});

test('valid management session only initializes and plans the selected stage', t => {
  const result = invoke(t, { Account: '071157021432', Arn: 'arn:aws:sts::071157021432:assumed-role/Admin/test' }, ['account', 'plan']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(args => args[1]), ['init', 'plan']);
  assert.ok(result.calls[1].includes('-out=bootstrap.tfplan'));
  assert.ok(result.calls.every(args => args[0] === '-chdir=infrastructure/bootstrap/account'));
});

test('apply refuses to run without a previously reviewed saved plan', t => {
  if (existsSync(join(repo, 'infrastructure/bootstrap/account/bootstrap.tfplan'))) return t.skip('A real saved plan exists.');
  const result = invoke(t, { Account: '071157021432', Arn: 'arn:aws:sts::071157021432:assumed-role/Admin/test' }, ['account', 'apply']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /plan first/);
  assert.deepEqual(result.calls, []);
});
