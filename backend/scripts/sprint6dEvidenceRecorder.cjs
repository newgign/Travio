// Offline owner-result classification; never executes browser checks.
const fs = require('node:fs');
const release = require('./sprint6bReleaseManifest.cjs');
const smoke = require('./sprint6cSmokePlan.cjs');
const FRONTEND = ['home', 'authSession', 'profile', 'favorites', 'myBookings', 'helpLegal', 'changedFeature'];
const BACKEND = ['health', 'readiness', 'changedEndpoint'];
const KEYS = [...FRONTEND, ...BACKEND];
const STATUSES = ['PASS', 'FAIL', 'NOT_RUN', 'N_A'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validate(input) {
  if (!object(input) || !['frontend', 'backend', 'both', 'docs'].includes(input.scope)
    || Object.keys(input).some(key => !['scope', 'ownerChecks', 'notes'].includes(key))
    || !object(input.ownerChecks) || (input.notes !== undefined && typeof input.notes !== 'string')
    || Object.entries(input.ownerChecks).some(([key, status]) => !KEYS.includes(key) || !STATUSES.includes(status))) {
    throw Error('INVALID_INPUT');
  }
  return input;
}
function prerequisites() {
  // 6B collects/evaluates 6A once; 6C uses those same boolean prerequisites.
  return release.manifest(release.collect());
}
function record(raw, metadata) {
  const input = validate(raw);
  const gatePass = metadata.releaseGate === 'PASS';
  const manifestPass = metadata.result === 'PASS';
  const smokeReady = smoke.plan(input.scope, { gatePass, manifestPass }).ready;
  const branchSafe = metadata.branch === 'develop';
  const commitSafe = typeof metadata.commit === 'string' && metadata.commit.length === 12 && /^[a-f0-9]+$/.test(metadata.commit);
  const offline = gatePass && manifestPass && smokeReady && branchSafe && commitSafe;
  const required = input.scope === 'both' ? [...BACKEND, ...FRONTEND]
    : input.scope === 'frontend' ? FRONTEND : input.scope === 'backend' ? BACKEND : [];
  let acceptance;
  if (!offline || required.some(key => input.ownerChecks[key] === 'FAIL')) acceptance = 'FAIL';
  else if (input.scope === 'docs') acceptance = 'N/A — DOCS ONLY';
  // No scope-required check is waivable. N_A is accepted as input but cannot satisfy it.
  else if (required.some(key => input.ownerChecks[key] !== 'PASS')) acceptance = 'INCOMPLETE';
  else acceptance = 'PASS';
  const rows = KEYS.filter(key => required.includes(key) || Object.hasOwn(input.ownerChecks, key))
    .map(key => `| ${key} | ${input.ownerChecks[key] || 'NOT_RUN (missing)'} | ${required.includes(key) ? 'Required' : 'Outside scope; not counted'} |`);
  const text = ['# Asedeliya Staging Release Evidence', '', '## Release', '',
    `- Branch: ${branchSafe ? 'develop' : 'UNAVAILABLE'}`,
    `- Local short commit: ${commitSafe ? metadata.commit : 'UNAVAILABLE'}`, `- Scope: ${input.scope}`,
    '', 'Local commit is not proof of the deployed commit. Owner must correlate it with deployment evidence.',
    '', '## Offline prerequisites', '', `- 6A release gate: ${gatePass ? 'PASS' : 'FAIL'}`,
    `- 6B release manifest: ${manifestPass ? 'PASS' : 'FAIL'}`, `- 6C smoke plan: ${smokeReady ? 'READY' : 'FAIL'}`,
    '', '## Owner evidence', '', 'Human-supplied statuses only; no browser checks were executed by this recorder.',
    'Required N_A is incomplete; only out-of-scope checks may be N/A. Notes are omitted for privacy.',
    '', '| Check | Explicit status | Applicability |', '| --- | --- | --- |', ...rows,
    ...(input.scope === 'docs' ? ['', 'Runtime browser evidence: N/A — DOCS ONLY. No browser PASS claimed.'] : []),
    '', '## Safety', '', 'Repository/config posture only; deployed environment and traffic were not independently audited.',
    '- Hotelbeds LIVE: OFF', '- Real booking: OFF', '- Payments: OFF',
    '- Production sales ready: NOT CLAIMED',
    ...(!offline ? ['Safety prerequisites failed: the intended OFF posture above is NOT verified for this record.'] : []),
    '', 'Use STAGING_RELEASE_EVIDENCE_TEMPLATE.md for owner timestamps, deployed commits and supporting evidence.',
    'No fresh Hotelbeds search required. No deployment, network or DB operation performed.',
    '', `STAGING ACCEPTANCE: ${acceptance}`].join('\n');
  return { acceptance, text, exitCode: acceptance === 'PASS' || acceptance.startsWith('N/A') ? 0 : acceptance === 'INCOMPLETE' ? 2 : 1 };
}
function readInput(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw Error('INVALID_FILE');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function run({ args = [], read = readInput, inspect = prerequisites, write = console.log } = {}) {
  try {
    if (![2, 4].includes(args.length) || args[0] !== '--input' || !args[1]
      || (args.length === 4 && (args[2] !== '--output' || !args[3] || !/\.md$/i.test(args[3])))) throw Error('INVALID_ARGUMENTS');
    const input = validate(read(args[1]));
    let metadata;
    try { metadata = inspect(); } catch { metadata = {}; }
    const result = record(input, metadata);
    // Create only: never overwrite owner evidence, input, runtime or an existing symlink.
    if (args.length === 4) fs.writeFileSync(args[3], result.text + '\n', { encoding: 'utf8', flag: 'wx' });
    write(result.text);
    return result.exitCode;
  } catch {
    write('Release evidence input/output could not be validated. Use --input <json> [--output <new markdown-file.md>] with documented scope/check statuses.\nSTAGING ACCEPTANCE: FAIL');
    return 1;
  }
}
module.exports = { validate, record, run, readInput, prerequisites };
if (require.main === module) process.exitCode = run({ args: process.argv.slice(2) });
