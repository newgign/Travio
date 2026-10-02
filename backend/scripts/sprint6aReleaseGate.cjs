// Offline source/config contract. Never import application modules or load .env.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const REQUIRED = [
  'render.yaml', 'backend/.env.example', 'backend/config/hotelbeds.js',
  'backend/services/productionGateService.js', 'backend/services/paymentGatewayService.js',
  'backend/services/emailProviderService.js', 'backend/routes/stagingHealth.js',
  'backend/routes/health.js', 'backend/server.js', 'backend/services/systemReadinessService.js',
  'frontend/package.json', 'frontend/vite.config.js', 'frontend/scripts/validate-staging-env.mjs',
  'frontend/src/App.jsx', 'frontend/src/main.jsx', 'frontend/src/components/RouteBoundary.jsx',
  'frontend/tests/consumerReleaseCandidate.test.mjs', 'frontend/tests/performanceBundleQuality.test.mjs',
  'SPRINT_5K_CONSUMER_RELEASE_CANDIDATE_REPORT.md', 'SPRINT_5H_PERFORMANCE_BUNDLE_LOADING_REPORT.md',
];
const FLAGS = { HOTELBEDS_ENV:'test', HOTELBEDS_ENABLED:'false', HOTELBEDS_READ_ONLY:'true',
  HOTELBEDS_BOOKING_ENABLED:'false', HOTELBEDS_LIVE_BOOKING_ENABLED:'false',
  PRODUCTION_SALES_ENABLED:'false', REAL_CHARGES_ENABLED:'false', REAL_REFUNDS_ENABLED:'false',
  PAYMENTS_MODE:'disabled', PAYMENTS_PROVIDER:'none', EMAIL_ENABLED:'false' };
const textFile = file => /\.(?:[cm]?js|jsx|json|ya?ml|example)$/.test(file) || /(?:^|\/)\.env(?:\..*)?$/.test(file);
function collect(root = ROOT) {
  const tracked = execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\0').filter(Boolean);
  const files = {};
  for (const file of new Set([...tracked.filter(textFile), ...REQUIRED])) {
    const absolute = path.resolve(root,file);
    if (!absolute.startsWith(path.resolve(root)+path.sep)) throw Error('UNSAFE_PATH');
    if (!fs.existsSync(absolute)) continue;
    // Do not follow tracked symlinks to private files outside the repository.
    if (!fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) throw Error('UNSAFE_FILE');
    files[file] = fs.readFileSync(absolute,'utf8');
  }
  return { files, tracked };
}
const unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');
function envExample(body) {
  const result = {};
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || Object.hasOwn(result,match[1])) throw Error('INVALID_ENV_TEMPLATE');
    result[match[1]] = unquote(match[2]);
  }
  return result;
}
// Deliberately supports the current staging Blueprint subset only. Ambiguous required
// keys, duplicate assignments, sync overrides and unsupported scalars fail closed.
function stagingValues(body) {
  const services = body.split(/^  - type:/m).slice(1);
  const api = services.filter(part => /^\s+name: asedeliya-staging-api\s*$/m.test(part));
  if (api.length !== 1) throw Error('STAGING_API_MISSING');
  const result = {};
  for (const match of api[0].matchAll(/^      - key: ([A-Z][A-Z0-9_]*)\s*\r?\n([\s\S]*?)(?=^      - key:|$(?![\s\S]))/gm)) {
    if (Object.hasOwn(result,match[1])) throw Error('DUPLICATE_STAGING_KEY');
    const lines = match[2].split(/\r?\n/).filter(line=>line.trim() && !line.trim().startsWith('#'));
    result[match[1]] = lines.length===1 && /^        value: /.test(lines[0]) ? unquote(lines[0].slice(15)) : null;
  }
  return result;
}
function secretCategories(body, file = '') {
  const categories = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40}/.test(body)) categories.push('PRIVATE_KEY_LITERAL');
  if (/\b(?:postgres(?:ql)?|mysql):\/\/[^\s:'"/]+:[^\s@'"/]{20,}@(?!localhost\b|127\.0\.0\.1\b|[^/\s]*\.(?:example|test|invalid)\b)[^\s'"/]+/i.test(body)) categories.push('DATABASE_CREDENTIAL_URI');
  // High-confidence provider formats only; broad secret assignments below intentionally
  // cover a small documented set, not arbitrary passwords or encrypted material.
  if (/\b(?:AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}|sk_live_[A-Za-z0-9]{24,})\b/.test(body)) categories.push('PROVIDER_KEY_LITERAL');
  const names = '(?:JWT_SECRET|OFFER_TOKEN_SECRET|DB_PASSWORD|HOTELBEDS_(?:LIVE_)?API_(?:KEY|SECRET)|RESEND_API_KEY)';
  const assignment = new RegExp(`\\b${names}\\s*['"]?\\s*[:=]\\s*['"]([^'"\\s]{24,})['"]`, 'g');
  const envLiteral = new RegExp(`^${names}=([^'"\\s]{24,})$`, 'gm');
  const yamlLiteral = new RegExp(`key:\\s*${names}\\s*\\r?\\n\\s+value:\\s*['"]?([^'"\\s]{24,})`, 'g');
  for (const [, value] of [...body.matchAll(assignment),...body.matchAll(envLiteral),...body.matchAll(yamlLiteral)]) {
    if (/^(?:test|offline|synthetic|fixture|example|generate_|change_me|replace_|sprint\d)/i.test(value) || /^(.)\1+$/.test(value)) continue;
    if (/(?:^|\/)tests\//.test(file) && /test|fixture|synthetic/i.test(value)) continue;
    categories.push('SECRET_ASSIGNMENT_LITERAL'); break;
  }
  return categories;
}
function evaluate({files, tracked}) {
  const checks = [];
  const check = (name, pass) => checks.push({name,pass:Boolean(pass)});
  const get = file => files[file] || '';
  check('Required source/config and RC evidence present', REQUIRED.every(file=>get(file).trim()));
  let staging={}, example={};
  try { staging=stagingValues(get('render.yaml')); example=envExample(get('backend/.env.example')); check('Staging/template format unambiguous',true); }
  catch { check('Staging/template format unambiguous',false); }
  for (const [key,value] of Object.entries(FLAGS)) {
    // Blank environment/read-only in the developer example means runtime defaults,
    // NOT an assertion that all development TEST access defaults to read-only.
    const template = example[key];
    const compatible = template===value || (['HOTELBEDS_ENV','HOTELBEDS_READ_ONLY'].includes(key) && template==='');
    check(`Safe staging default: ${key}`,staging[key]===value && compatible);
  }
  const hb=get('backend/config/hotelbeds.js');
  check('Runtime Hotelbeds TEST default and opt-in booking',/env\.HOTELBEDS_ENV\s*\|\|\s*['"]test['"]/.test(hb) && /bookingEnabled:\s*env\.HOTELBEDS_BOOKING_ENABLED\s*===\s*['"]true['"]/.test(hb) && /liveBookingEnabled:\s*env\.HOTELBEDS_LIVE_BOOKING_ENABLED\s*===\s*['"]true['"]/.test(hb));
  check('Staging TEST read-only and unsafe-config guard retained',/readOnly:\s*stagingTestRequested\s*\|\|/.test(hb) && /stagingTestAllowed\s*=\s*stagingTestRequested\s*&&\s*errors.length\s*===\s*0/.test(hb) && /UNSAFE_STAGING_TEST_CONFIG/.test(hb));
  const gate=get('backend/services/productionGateService.js');
  check('Production hard safety gate retained',/enforcedSafeMode:\s*true/.test(gate) && ['productionSalesEnabled','realChargesEnabled','realRefundsEnabled'].every(key=>new RegExp(`${key}:\\s*false`).test(gate)) && /module.exports\s*=\s*\{\s*state\s*\}/.test(gate));
  check('Runtime payments disabled by default',/process.env.PAYMENTS_MODE\s*\|\|\s*['"]disabled['"]/.test(get('backend/services/paymentGatewayService.js')) && /productionGateService.state\(\)/.test(get('backend/services/paymentGatewayService.js')));
  check('Runtime email disabled by default',/process.env.EMAIL_ENABLED\s*\|\|\s*['"]false['"]/.test(get('backend/services/emailProviderService.js')));
  check('Staging health/readiness implementation and mounts present',/healthHandler/.test(get('backend/routes/stagingHealth.js')) && /router.get\(['"]\/ready['"]/.test(get('backend/routes/health.js')) && /databaseStatus/.test(get('backend/services/systemReadinessService.js')) && /app.get\('\/health'/.test(get('backend/server.js')) && /app.use\("\/api\/health", healthRoutes\)/.test(get('backend/server.js')));
  let pkg; try {pkg=JSON.parse(get('frontend/package.json'));} catch { /* safe failure below */ }
  check('Frontend build and staging URL validation present',pkg?.scripts?.build==='vite build' && /validateStagingApiUrl/.test(get('frontend/scripts/validate-staging-env.mjs')) && /validate-staging-env.mjs/.test(get('render.yaml')));
  const app=get('frontend/src/App.jsx');
  const pages=['Help','Contacts','Results','Favorites','TourDetails','Login','Register','Checkout','MyBookings','BookingDetails','Profile','Voucher','AdminPanel'];
  check('Route lazy declarations and shared boundary retained',pages.every(name=>new RegExp(`const ${name} = lazy\\(\\(\\) => import\\("\\./pages/${name}"\\)\\)`).test(app) && !new RegExp(`import ${name} from`).test(app)) && /<RouteBoundary>/.test(app) && /<Suspense/.test(get('frontend/src/components/RouteBoundary.jsx')) && /<SessionBoundary>/.test(get('frontend/src/main.jsx')));
  check('No bundle warning suppression in Vite config',/defineConfig/.test(get('frontend/vite.config.js')) && !/chunkSizeWarningLimit|onwarn|onLog|logLevel/.test(get('frontend/vite.config.js')));
  const findings=[];
  for (const file of [...tracked].sort()) if (textFile(file)) {
    if (!Object.hasOwn(files,file)) {findings.push({file,category:'TRACKED_FILE_UNREADABLE'});continue;}
    for (const category of secretCategories(files[file],file)) findings.push({file,category});
  }
  check('No obvious tracked credential literal detected',findings.length===0);
  return {pass:checks.every(row=>row.pass),checks,findings};
}
function format(result) {
  return ['Sprint 6A Release Gate — offline repository/config only',...result.checks.map(row=>`${row.pass?'PASS':'FAIL'}  ${row.name}`),...result.findings.map(row=>`FAIL  ${JSON.stringify(row.file)}: ${row.category}`),`RESULT: ${result.pass?'PASS':'FAIL'}`].join('\n');
}
function run(root=ROOT,write=console.log) {
  try {const result=evaluate(collect(root));write(format(result));return result.pass?0:1;}
  catch {write('Sprint 6A Release Gate\nFAIL  Repository/config could not be read safely\nRESULT: FAIL');return 1;}
}
module.exports={collect,evaluate,format,run,secretCategories,stagingValues};
if(require.main===module) process.exitCode=run();
