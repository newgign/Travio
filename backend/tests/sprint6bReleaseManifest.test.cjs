const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { treeState, manifest, format, run } = require('../scripts/sprint6bReleaseManifest.cjs');
const good = { branch: 'develop', commit: 'a'.repeat(40), clean: true,
  untracked: false, gatePass: true, rcPresent: true };
const value = overrides => manifest({ ...good, ...overrides });

test('clean tracked develop baseline passes', () => assert.equal(value({}).result, 'PASS'));
test('wrong branch and detached HEAD fail', () => {
  for (const branch of ['main', 'HEAD', '']) assert.equal(value({ branch }).result, 'FAIL');
});
test('unstaged tracked modifications and deletion fail', () => {
  for (const code of [' M', ' D']) assert.equal(value(treeState(`${code} file\0`)).result, 'FAIL');
});
test('staged additions modifications deletions and conflict fail', () => {
  for (const code of ['A ', 'M ', 'D ', 'UU']) assert.equal(value(treeState(`${code} file\0`)).result, 'FAIL');
});
test('rename second path cannot masquerade as untracked entry', () => {
  assert.deepEqual(treeState('R  new\0?? old\0'), { clean: false, untracked: false });
});
test('untracked-only files permitted without printing filenames', () => {
  const result = value(treeState('?? private-owner-file\0?? folder/\0'));
  assert.equal(result.result, 'PASS');
  assert.equal(result.untrackedFiles, 'PRESENT');
  assert.doesNotMatch(format(result), /private-owner-file|folder/);
});
test('failed or unresolved 6A gate fails closed', () => {
  for (const gatePass of [false, undefined, 'true']) assert.equal(value({ gatePass }).result, 'FAIL');
});
test('missing Consumer RC evidence fails', () => assert.equal(value({ rcPresent: false }).result, 'FAIL'));
test('commit is a validated short SHA; malformed input fails', () => {
  assert.equal(value({}).commit, 'a'.repeat(12));
  assert.equal(value({ commit: 'b'.repeat(64) }).commit, 'b'.repeat(12));
  for (const commit of ['', 'abc', 'secret-value', 'a'.repeat(40) + '\n']) {
    assert.equal(value({ commit }).result, 'FAIL');
    assert.equal(value({ commit }).commit, 'UNAVAILABLE');
  }
});
test('target is STAGING and production readiness is never claimed', () => {
  assert.equal(value({ target: 'PRODUCTION' }).target, 'STAGING');
  assert.equal(value({ productionSalesReady: 'PASS' }).productionSalesReady, 'NOT CLAIMED');
});
test('human output and successful exit semantics', () => {
  let output;
  assert.equal(run({ read: () => good, write: text => { output = text; } }), 0);
  assert.match(output, /Asedeliya Staging Release Manifest/);
  assert.match(output, /RESULT: PASS$/);
});
test('failure exit and exception output are safe', () => {
  let output;
  assert.equal(run({ read: () => ({ ...good, clean: false }), write: () => {} }), 1);
  assert.equal(run({ read: () => { throw Error('synthetic-private-diagnostic'); }, write: text => { output = text; } }), 1);
  assert.doesNotMatch(output, /synthetic-private-diagnostic/);
  assert.match(output, /RESULT: FAIL$/);
});
test('arbitrary secret metadata is not echoed in human or JSON output', () => {
  const sentinel = 'synthetic-private-value';
  for (const json of [false, true]) {
    let output;
    run({ json, read: () => ({ ...good, branch: sentinel, commit: sentinel, error: sentinel,
      env: sentinel, authorization: sentinel }), write: text => { output = text; } });
    assert.ok(!output.includes(sentinel));
  }
});
test('JSON contains only the safe metadata schema', () => {
  let output;
  assert.equal(run({ json: true, read: () => good, write: text => { output = text; } }), 0);
  assert.deepEqual(JSON.parse(output), value({}));
  assert.deepEqual(Object.keys(JSON.parse(output)), ['branch', 'commit', 'trackedTree', 'untrackedFiles',
    'releaseGate', 'consumerRcEvidence', 'target', 'productionSalesReady', 'result']);
});
test('collector reuses 6A evaluation and local read-only git commands', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/sprint6bReleaseManifest.cjs'), 'utf8');
  assert.match(source, /gate\.evaluate\(source\)/);
  assert.match(source, /gate\.collect\(root\)/);
  assert.match(source, /--porcelain=v1/);
  assert.doesNotMatch(source, /fetch\(|https?:|dotenv|git.*(?:push|commit|add)/);
});
test('runbook includes commands classification and safety limitations', () => {
  const body = fs.readFileSync(path.join(__dirname, '../../STAGING_DEPLOY_RUNBOOK.md'), 'utf8');
  for (const text of ['git status --short', 'git branch --show-current', 'sprint6aReleaseGate.cjs',
    'sprint6bReleaseManifest.cjs', 'CLEAN TRACKED TREE', 'develop', 'frontend only', 'backend only',
    'Backend first', 'No runtime deploy required', '/api/health/ready', 'TEST/read-only',
    'NOT CLAIMED', 'Unrelated untracked owner files are allowed']) assert.ok(body.includes(text), text);
});
