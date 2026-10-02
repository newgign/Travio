// Offline metadata only: no application imports, environment loading or deployment.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const gate = require('./sprint6aReleaseGate.cjs');
const ROOT = path.resolve(__dirname, '../..');
const RC = 'SPRINT_5K_CONSUMER_RELEASE_CANDIDATE_REPORT.md';

function treeState(status) {
  let clean = true;
  let untracked = false;
  const entries = status.split('\0');
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    const code = entries[i].slice(0, 2);
    if (code === '??') untracked = true;
    else {
      clean = false;
      if (/[RC]/.test(code)) i++; // porcelain -z rename/copy has a second path
    }
  }
  return { clean, untracked };
}

function collect(root = ROOT) {
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const commit = git(['rev-parse', '--verify', 'HEAD']).trim();
  const tree = treeState(git(['status', '--porcelain=v1', '-z', '--untracked-files=normal']));
  const source = gate.collect(root);
  return { branch, commit, ...tree, gatePass: gate.evaluate(source).pass,
    rcPresent: Boolean(source.files[RC]?.trim()) };
}

function manifest(input) {
  // Whitelist output: never echo arbitrary branch names, paths or gate errors.
  const validCommit = typeof input.commit === 'string' && [40, 64].includes(input.commit.length)
    && /^[a-f0-9]+$/.test(input.commit);
  const pass = input.branch === 'develop' && validCommit && input.clean === true
    && input.gatePass === true && input.rcPresent === true;
  return {
    branch: input.branch === 'develop' ? 'develop' : 'NOT DEVELOP',
    commit: validCommit ? input.commit.slice(0, 12) : 'UNAVAILABLE',
    trackedTree: input.clean === true ? 'CLEAN' : 'NOT CLEAN',
    untrackedFiles: input.untracked === true ? 'PRESENT' : 'NONE',
    releaseGate: input.gatePass === true ? 'PASS' : 'FAIL',
    consumerRcEvidence: input.rcPresent === true ? 'PRESENT' : 'MISSING',
    target: 'STAGING', productionSalesReady: 'NOT CLAIMED', result: pass ? 'PASS' : 'FAIL',
  };
}

function format(value) {
  return ['Asedeliya Staging Release Manifest', `Branch: ${value.branch}`,
    `Commit: ${value.commit}`, `Tracked tree: ${value.trackedTree}`,
    `Untracked files: ${value.untrackedFiles}`, `Release gate: ${value.releaseGate}`,
    `Consumer RC evidence: ${value.consumerRcEvidence}`, `Target: ${value.target}`,
    `Production sales ready: ${value.productionSalesReady}`, `RESULT: ${value.result}`].join('\n');
}

function run({ root = ROOT, json = false, read = collect, write = console.log } = {}) {
  let value;
  try { value = manifest(read(root)); }
  catch { value = manifest({}); } // Never print git stderr, paths or exception text.
  write(json ? JSON.stringify(value) : format(value));
  return value.result === 'PASS' ? 0 : 1;
}
module.exports = { treeState, collect, manifest, format, run };
if (require.main === module) process.exitCode = run({ json: process.argv.includes('--json') });
