const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
require('./offlineNetwork.cjs');
const gate = require('../scripts/sprint6aReleaseGate.cjs');
const root = path.resolve(__dirname,'../..');
const baseline = gate.collect(root);
const fixture = () => ({files:{...baseline.files},tracked:[...baseline.tracked]});
function blocked(snapshot, name) {
  const result=gate.evaluate(snapshot);
  assert.equal(result.pass,false);
  assert.ok(result.checks.some(row=>!row.pass && row.name.includes(name)),name);
  assert.match(gate.format(result),/RESULT: FAIL$/);
}
test('safe repository baseline passes deterministically',()=>{
  const first=gate.evaluate(fixture());assert.equal(first.pass,true);
  assert.equal(gate.format(first),gate.format(gate.evaluate(fixture())));
});
for(const [key,value] of Object.entries({HOTELBEDS_ENV:'live',HOTELBEDS_BOOKING_ENABLED:'true',HOTELBEDS_LIVE_BOOKING_ENABLED:'true',PRODUCTION_SALES_ENABLED:'true',PAYMENTS_MODE:'sandbox',REAL_CHARGES_ENABLED:'true',REAL_REFUNDS_ENABLED:'true',EMAIL_ENABLED:'true',HOTELBEDS_READ_ONLY:'false'})) {
  test(`unsafe Blueprint ${key} fails`,()=>{
    const data=fixture();const pattern=new RegExp(`(key: ${key}\\s*\\r?\\n\\s+value:) [^\\r\\n]+`);
    assert.match(data.files['render.yaml'],pattern);
    data.files['render.yaml']=data.files['render.yaml'].replace(pattern,`$1 "${value}"`);
    blocked(data,key);
  });
}
test('unsafe developer template does not hide behind safe Blueprint',()=>{
  const data=fixture();data.files['backend/.env.example']=data.files['backend/.env.example'].replace('EMAIL_ENABLED=false','EMAIL_ENABLED=true');blocked(data,'EMAIL_ENABLED');
});
test('missing production gate and changed hard-gate boolean fail',()=>{
  for(const change of [()=>'',body=>body.replace('realChargesEnabled: false','realChargesEnabled: true')]){
    const data=fixture();data.files['backend/services/productionGateService.js']=change(data.files['backend/services/productionGateService.js']);blocked(data,'Production hard safety');
  }
});
test('runtime TEST default and read-only guard changes fail',()=>{
  for(const [from,to,check] of [["env.HOTELBEDS_ENV || 'test'","env.HOTELBEDS_ENV || 'live'",'Runtime Hotelbeds'],['readOnly: stagingTestRequested ||','readOnly: false ||','Staging TEST read-only']]){
    const data=fixture();data.files['backend/config/hotelbeds.js']=data.files['backend/config/hotelbeds.js'].replace(from,to);blocked(data,check);
  }
});
test('runtime payment/email unsafe fallbacks fail without importing services',()=>{
  for(const [file,from,to,check] of [['paymentGatewayService.js','PAYMENTS_MODE || "disabled"','PAYMENTS_MODE || "sandbox"','Runtime payments'],['emailProviderService.js','EMAIL_ENABLED || "false"','EMAIL_ENABLED || "true"','Runtime email']]){
    const data=fixture();const key='backend/services/'+file;data.files[key]=data.files[key].replace(from,to);blocked(data,check);
  }
});
test('readiness implementation or mount removal fails',()=>{
  for(const file of ['backend/routes/stagingHealth.js','backend/routes/health.js','backend/server.js']){const data=fixture();delete data.files[file];blocked(data,'Staging health/readiness');}
});
test('missing RC evidence or build configuration fails',()=>{
  for(const file of ['frontend/tests/consumerReleaseCandidate.test.mjs','SPRINT_5K_CONSUMER_RELEASE_CANDIDATE_REPORT.md','frontend/vite.config.js']){const data=fixture();delete data.files[file];blocked(data,'Required source/config');}
});
test('raised warning threshold and silent configuration fail',()=>{
  for(const extra of ['chunkSizeWarningLimit: 900','logLevel: "silent"']){const data=fixture();data.files['frontend/vite.config.js']+=`\n// ${extra}`;blocked(data,'No bundle warning suppression');}
});
test('eager route import replacing lazy page fails',()=>{
  const data=fixture();data.files['frontend/src/App.jsx']=data.files['frontend/src/App.jsx'].replace('const AdminPanel = lazy(() => import("./pages/AdminPanel"));','import AdminPanel from "./pages/AdminPanel";');blocked(data,'Route lazy');
});
test('duplicate staging assignment and missing required value fail closed',()=>{
  for(const suffix of ['      - key: EMAIL_ENABLED\n        value: "false"\n','']){
    const data=fixture();data.files['render.yaml']=suffix?data.files['render.yaml'].replace(/  - type: web\r?\n    name: asedeliya-staging-web/,suffix+'  - type: web\n    name: asedeliya-staging-web'):data.files['render.yaml'].replace(/value: test/, 'sync: false');
    assert.equal(gate.evaluate(data).pass,false);
  }
});
test('secret output redacts synthetic credential values across JS/env/YAML',()=>{
  const secret=['Q7m9','Z2v4','B8n6','R3x5','K1p0','D9s8','F6h4','J2l7'].join('');
  for(const [file,body] of [['backend/config/probe.js',`const JWT_SECRET = '${secret}';`],['backend/.env',`JWT_SECRET=${secret}`],['extra.yaml',`- key: JWT_SECRET\n  value: "${secret}"`]]){
    const data=fixture();data.tracked.push(file);data.files[file]=body;const result=gate.evaluate(data);assert.equal(result.pass,false);const output=gate.format(result);assert.ok(!output.includes(secret));assert.match(output,/SECRET_ASSIGNMENT_LITERAL/);assert.ok(output.includes(file));
  }
});
test('private-key/provider/DB literal categories never return matched values',()=>{
  const samples=['-----BEGIN '+'PRIVATE KEY-----\n'+'A'.repeat(45),'ghp_'+'A'.repeat(36),'postgres://user:'+'aB7'.repeat(10)+'@db.company.net/app'];
  for(const body of samples){const categories=gate.secretCategories(body);assert.equal(categories.length,1);assert.ok(!JSON.stringify(categories).includes(body));}
  assert.deepEqual(gate.secretCategories("JWT_SECRET='synthetic_fixture_only_not_a_real_secret'"),[]);
});
test('CLI PASS exit code and sanitized read-failure exit semantics',()=>{
  const child=spawnSync(process.execPath,[path.join(root,'backend/scripts/sprint6aReleaseGate.cjs')],{cwd:root,encoding:'utf8'});assert.equal(child.status,0);assert.match(child.stdout,/RESULT: PASS/);
  let output='';assert.equal(gate.run(path.join(root,'not-a-repository'),text=>{output=text;}),1);assert.match(output,/RESULT: FAIL/);assert.doesNotMatch(output,/ENOENT|spawn|stack|not-a-repository/);
});
