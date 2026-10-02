const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plan, run } = require('../scripts/sprint6cSmokePlan.cjs');
const good = { gatePass: true, manifestPass: true };
test('frontend covers consumer and changed feature navigation', () => {
  const { ready, text } = plan('frontend', good);
  assert.equal(ready, true);
  for (const item of ['Home', 'Header/navigation', 'Profile', 'Favorites', 'My Bookings', 'Help/legal', 'Changed frontend feature', '320/390']) assert.ok(text.includes(item));
  assert.ok(!text.includes('/api/health/ready'));
});
test('backend includes health readiness and read-only endpoint checks', () => {
  const { text } = plan('backend', good);
  for (const item of ['/health', '/api/health/ready', 'DB reachable only through', 'read-only evidence', 'production gate failure']) assert.ok(text.includes(item));
  assert.ok(!text.includes('[ ] Staging Home'));
});
test('both orders backend before frontend', () => {
  const { text } = plan('both', good);
  assert.ok(text.indexOf('[ ] /health') < text.indexOf('[ ] Staging Home'));
  assert.match(text, /After backend health\/readiness is verified/);
});
test('docs requires no runtime deploy or checklist execution', () => {
  const { ready, text } = plan('docs', good);
  assert.equal(ready, true);
  assert.match(text, /NO RUNTIME SMOKE DEPLOY REQUIRED/);
  assert.ok(!text.includes('[ ]'));
});
test('6A failure blocks plan even if manifest fixture passes', () => {
  const result = plan('frontend', { ...good, gatePass: false });
  assert.equal(result.ready, false);
  assert.ok(!result.text.includes('[ ]'));
});
test('6B failure and unresolved prerequisites block plan', () => {
  for (const checks of [{ ...good, manifestPass: false }, {}, { gatePass: 'true', manifestPass: 'true' }]) assert.equal(plan('docs', checks).ready, false);
});
test('frontend includes auth and lazy route feedback', () => {
  const { text } = plan('frontend', good);
  assert.match(text, /Login\/session works with an existing account; auth\/session preserved/);
  assert.match(text, /No blank lazy-route screen \/ raw technical error/);
});
test('no scope automatically claims browser acceptance', () => {
  for (const scope of ['frontend', 'backend', 'both', 'docs']) {
    const { text } = plan(scope, good);
    assert.match(text, /browser acceptance NOT RUN/);
    assert.doesNotMatch(text, /OWNER BROWSER ACCEPTANCE: PASS|SMOKE EXECUTED|SMOKE ACCEPTED/);
  }
});
test('no fresh provider search or staging mutations required', () => {
  const { text } = plan('both', good);
  assert.match(text, /No fresh Hotelbeds search required/);
  assert.match(text, /optional only for deliberately changed provider code/);
  assert.match(text, /Do not create accounts, change passwords or create bookings/);
});
test('safety and production limits remain explicit', () => {
  const { text } = plan('both', good);
  for (const item of ['TEST/read-only', 'LIVE OFF', 'real booking OFF', 'payments OFF', 'refunds OFF', 'email OFF', 'PAUSED', 'NOT CLAIMED']) assert.ok(text.includes(item));
});
test('invalid scope and extra arguments fail without echoing arguments or reading prerequisites', () => {
  for (const args of [['--scope', 'synthetic-private-value'], ['--json'], ['--scope', 'docs', 'extra']]) {
    let output;
    assert.equal(run({ args, read: () => { assert.fail('must not read'); }, write: text => { output = text; } }), 1);
    assert.match(output, /Invalid scope/);
    assert.doesNotMatch(output, /synthetic-private-value/);
  }
});
test('errors and arbitrary metadata cannot leak into output', () => {
  for (const read of [() => { throw Error('synthetic-private-value'); }, () => ({ ...good, env: 'synthetic-private-value' })]) {
    let output;
    run({ read, write: text => { output = text; } });
    assert.ok(!output.includes('synthetic-private-value'));
  }
});
test('exit codes and default combined plan', () => {
  let output;
  assert.equal(run({ read: () => good, write: text => { output = text; } }), 0);
  assert.match(output, /Scope: both/);
  assert.match(output, /RESULT: SMOKE PLAN READY$/);
  assert.equal(run({ read: () => ({}), write: () => {} }), 1);
});
test('prerequisites reuse 6B including 6A without network/runtime modules', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/sprint6cSmokePlan.cjs'), 'utf8');
  assert.match(source, /release\.collect\(\)/);
  assert.match(source, /release\.manifest\(input\)/);
  assert.match(source, /input\.gatePass === true/);
  assert.deepEqual([...source.matchAll(/require\('([^']+)'\)/g)].map(x => x[1]), ['./sprint6bReleaseManifest.cjs']);
  assert.doesNotMatch(source, /fetch\(|https?:\/\/|process\.env|execFile/);
});
test('evidence template leaves owner checks pending and references runbook', () => {
  const body = fs.readFileSync(path.join(__dirname, '../../STAGING_RELEASE_EVIDENCE_TEMPLATE.md'), 'utf8');
  for (const text of ['STAGING_DEPLOY_RUNBOOK.md', 'Branch:', 'commit:', 'timezone', 'Scope:', '6A gate', '6B manifest', '6C smoke plan', 'Frontend deployed', 'Backend deployed', 'STAGING ACCEPTANCE: NOT RUN', 'NOT CLAIMED']) assert.ok(body.includes(text));
  assert.doesNotMatch(body, /\| PASS \|/);
});
