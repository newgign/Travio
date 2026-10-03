const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { record, run, validate, readInput } = require('../scripts/sprint6dEvidenceRecorder.cjs');
const front = ['home', 'authSession', 'profile', 'favorites', 'myBookings', 'helpLegal', 'changedFeature'];
const back = ['health', 'readiness', 'changedEndpoint'];
const meta = { branch: 'develop', commit: 'a'.repeat(12), releaseGate: 'PASS', result: 'PASS' };
const input = (scope = 'frontend', keys = front) => ({ scope, ownerChecks: Object.fromEntries(keys.map(key => [key, 'PASS'])) });
test('frontend explicit complete PASS passes', () => assert.equal(record(input(), meta).acceptance, 'PASS'));
test('frontend missing check is incomplete and displayed missing', () => {
  const data = input(); delete data.ownerChecks.home;
  const result = record(data, meta);
  assert.equal(result.acceptance, 'INCOMPLETE'); assert.match(result.text, /NOT_RUN \(missing\)/);
});
test('NOT_RUN and required N_A cannot satisfy a required check', () => {
  for (const status of ['NOT_RUN', 'N_A']) {
    const data = input(); data.ownerChecks.profile = status;
    assert.equal(record(data, meta).acceptance, 'INCOMPLETE');
  }
});
test('FAIL takes precedence over missing owner evidence', () => {
  assert.equal(record({ scope: 'frontend', ownerChecks: { home: 'FAIL' } }, meta).acceptance, 'FAIL');
});
test('backend missing health is incomplete', () => assert.equal(record(input('backend', back.slice(1)), meta).acceptance, 'INCOMPLETE'));
test('backend readiness failure fails', () => {
  const data = input('backend', back); data.ownerChecks.readiness = 'FAIL';
  assert.equal(record(data, meta).acceptance, 'FAIL');
});
test('both requires complete backend and frontend sets', () => {
  assert.equal(record(input('both'), meta).acceptance, 'INCOMPLETE');
  assert.equal(record(input('both', [...front, ...back]), meta).acceptance, 'PASS');
});
test('docs is N/A with no runtime browser PASS', () => {
  const result = record(input('docs', []), meta);
  assert.equal(result.acceptance, 'N/A — DOCS ONLY'); assert.equal(result.exitCode, 0);
  assert.match(result.text, /No browser PASS claimed/);
});
test('invalid statuses are rejected without normalization', () => {
  for (const status of ['pass', ' PASS', true, null, 'NOT RUN', 'N/A']) {
    const data = input(); data.ownerChecks.home = status; assert.throws(() => validate(data));
  }
});
test('invalid scopes and malformed shapes rejected', () => {
  for (const data of [null, [], {}, { scope: 'unknown', ownerChecks: {} }, { scope: 'frontend', ownerChecks: [] }]) assert.throws(() => validate(data));
});
test('unknown fields cannot create PASS', () => {
  assert.throws(() => validate({ ...input(), acceptance: 'PASS' }));
  assert.throws(() => validate({ scope: 'frontend', ownerChecks: { all: 'PASS' } }));
});
test('markdown includes safe metadata and explicit statuses', () => {
  const { text } = record(input(), meta);
  for (const item of ['# Asedeliya Staging Release Evidence', 'Branch: develop', 'a'.repeat(12), '| home | PASS | Required |', '6C smoke plan: READY', 'NOT CLAIMED']) assert.ok(text.includes(item));
});
test('notes metadata errors and invalid input values never echoed', () => {
  const secret = 'synthetic-private-sentinel';
  const result = record({ ...input(), notes: secret }, { ...meta, branch: secret, commit: secret });
  assert.ok(!result.text.includes(secret)); assert.equal(result.acceptance, 'FAIL');
  let output;
  assert.equal(run({ args: ['--input', secret], read: () => { throw Error(secret); }, write: text => { output = text; } }), 1);
  assert.ok(!output.includes(secret));
});
test('example defaults exclusively to NOT_RUN and produces incomplete', () => {
  const data = readInput(path.join(__dirname, '../../STAGING_RELEASE_EVIDENCE_EXAMPLE.json'));
  assert.ok(Object.values(data.ownerChecks).every(status => status === 'NOT_RUN'));
  assert.equal(record(data, meta).acceptance, 'INCOMPLETE');
});
test('offline success alone never auto-generates browser PASS', () => {
  const result = record(input('frontend', []), meta);
  assert.equal(result.acceptance, 'INCOMPLETE');
  assert.match(result.text, /no browser checks were executed/);
});
test('failed prerequisites override all PASS and docs classification', () => {
  for (const scope of ['frontend', 'docs']) for (const patch of [{ releaseGate: 'FAIL' }, { result: 'FAIL' }]) assert.equal(record(input(scope), { ...meta, ...patch }).acceptance, 'FAIL');
});
test('CLI exit semantics and prerequisite exceptions fail safely', () => {
  const execute = (data, inspect = () => meta) => run({ args: ['--input', 'fixture'], read: () => data, inspect, write: () => {} });
  assert.equal(execute(input()), 0);
  assert.equal(execute(input('frontend', [])), 2);
  assert.equal(execute({ scope: 'frontend', ownerChecks: { home: 'FAIL' } }), 1);
  assert.equal(execute(input(), () => { throw Error('private'); }), 1);
  assert.equal(run({ args: [], write: () => {} }), 1);
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sprint6d-'));
  const output = path.join(directory, 'evidence.md');
  try {
    const options = { args: ['--input', 'fixture', '--output', output], read: () => input('frontend', []), inspect: () => meta, write: () => {} };
    assert.equal(run(options), 2);
    assert.match(fs.readFileSync(output, 'utf8'), /STAGING ACCEPTANCE: INCOMPLETE/);
    assert.equal(run(options), 1); // Existing owner evidence cannot be overwritten.
    assert.match(fs.readFileSync(output, 'utf8'), /STAGING ACCEPTANCE: INCOMPLETE/);
    assert.equal(run({ ...options, args: ['--input', 'fixture', '--output', path.join(directory, 'runtime.cjs')] }), 1);
  } finally {
    if (fs.existsSync(output)) fs.unlinkSync(output);
    fs.rmdirSync(directory);
  }
});
test('recorder reuses local 6B/6C without network or runtime imports', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/sprint6dEvidenceRecorder.cjs'), 'utf8');
  assert.match(source, /release\.manifest\(release\.collect\(\)\)/);
  assert.match(source, /smoke\.plan\(input.scope/);
  assert.deepEqual([...source.matchAll(/require\('([^']+)'\)/g)].map(x => x[1]), ['node:fs', './sprint6bReleaseManifest.cjs', './sprint6cSmokePlan.cjs']);
  assert.doesNotMatch(source, /fetch\(|process\.env/);
});
