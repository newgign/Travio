// Offline checklist generation only. No browser, network or application imports.
const release = require('./sprint6bReleaseManifest.cjs');
const SCOPES = ['frontend', 'backend', 'both', 'docs'];
const FRONTEND = [
  'Staging Home opens', 'Header/navigation works',
  'No blank lazy-route screen / raw technical error',
  'Login/session works with an existing account; auth/session preserved',
  'Profile reachable', 'Favorites reachable', 'My Bookings reachable',
  'Help/legal navigation reachable', 'Changed frontend feature works',
  'Mobile quick check at 320/390 px if frontend layout changed',
  'TEST status remains truthful; no unexpected booking/payment UI activation',
];
const BACKEND = [
  '/health checked by owner on deployed staging',
  '/api/health/ready checked by owner; DB reachable only through deployed health/readiness evidence',
  'Changed endpoint behavior checked if relevant, using safe read-only evidence',
  'No unexpected production gate failure',
];
function prerequisites() {
  // 6B collect already evaluates the 6A gate: reuse that result without a second scan.
  const input = release.collect();
  return { gatePass: input.gatePass === true, manifestPass: release.manifest(input).result === 'PASS' };
}
function plan(scope, checks) {
  if (!SCOPES.includes(scope)) return { ready: false, text: 'Asedeliya Staging Smoke Plan\nInvalid scope. Use frontend/backend/both/docs.\nRESULT: FAIL' };
  const ready = checks.gatePass === true && checks.manifestPass === true;
  const lines = ['Asedeliya Staging Smoke Plan', `Scope: ${scope}`, 'Preconditions',
    `${checks.gatePass === true ? 'PASS' : 'FAIL'}  Sprint 6A release gate`,
    `${checks.manifestPass === true ? 'PASS' : 'FAIL'}  Sprint 6B release manifest`];
  if (ready) {
    if (scope === 'docs') lines.push('NO RUNTIME SMOKE DEPLOY REQUIRED');
    else {
      lines.push('Owner checks after actual runtime deployment (not executed):');
      if (scope === 'backend' || scope === 'both') lines.push('Backend first:', ...BACKEND.map(x => `[ ] ${x}`));
      if (scope === 'both') lines.push('After backend health/readiness is verified, proceed with frontend:');
      if (scope === 'frontend' || scope === 'both') lines.push(...FRONTEND.map(x => `[ ] ${x}`));
      lines.push('[ ] Hotelbeds TEST/read-only; LIVE OFF; real booking OFF; payments OFF; refunds OFF; email OFF; production infrastructure PAUSED');
    }
  }
  lines.push('Use STAGING_DEPLOY_RUNBOOK.md to choose scope from the actual deployment delta.',
    'No fresh Hotelbeds search required. Provider search is optional only for deliberately changed provider code in a future authorized sprint.',
    'Do not create accounts, change passwords or create bookings merely for smoke evidence.',
    'PLAN ONLY: browser acceptance NOT RUN. Owner must execute applicable checks and record evidence.',
    'Production sales ready: NOT CLAIMED', ready ? 'RESULT: SMOKE PLAN READY' : 'RESULT: FAIL');
  return { ready, text: lines.join('\n') };
}
function run({ args = [], read = prerequisites, write = console.log } = {}) {
  // Default to the combined plan; no inferred deployment scope or remote lookups.
  const scope = args.length === 0 ? 'both' : args.length === 2 && args[0] === '--scope' ? args[1] : null;
  let result;
  try { result = plan(scope, SCOPES.includes(scope) ? read() : {}); }
  catch { result = plan(scope, {}); } // Do not echo exception text or user arguments.
  write(result.text);
  return result.ready ? 0 : 1;
}
module.exports = { plan, run, prerequisites };
if (require.main === module) process.exitCode = run({ args: process.argv.slice(2) });
