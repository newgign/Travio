const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../scripts/lib/dbContinuity.cjs');
const staging = require('../scripts/stagingMigrationInventory.cjs');
const { fixture, runFor } = require('./helpers/backupArchiveFixture.cjs');
const ack = 'I_ACKNOWLEDGE_ENCRYPTED_WITHOUT_CERTIFICATE_IDENTITY_VERIFICATION';
const base = { DATABASE_URL:'postgresql://fixture_owner:PRIVATE_PASSWORD@fixture.example.invalid/staging_fixture',
  DB_SSL_MODE:'require', DB_ALLOW_TLS_REQUIRE:ack, APP_ENV:'staging', EXPECTED_APP_ENV:'staging', NODE_ENV:'test' };
base.RECONCILIATION_EXPECTED_DB_IDENTITY = db.sourceIdentity(db.connection({...base,DB_SSL_MODE:'verify-full'}));
beforeEach(t => {
  const fail = () => assert.fail('REAL_OPERATION_FORBIDDEN');
  t.mock.method(require('node:child_process'),'spawnSync',fail);
  t.mock.method(require('node:net').Socket.prototype,'connect',fail);
  for (const protocol of ['node:http','node:https']) for (const method of ['get','request']) t.mock.method(require(protocol),method,fail);
  t.mock.method(globalThis,'fetch',fail);
  for (const Class of [require('pg').Client,require('pg').Pool]) for (const method of ['query','connect']) t.mock.method(Class.prototype,method,fail);
});
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-binding-'));
  t.after(()=>fs.rmSync(dir,{recursive:true}));return dir;
}
for (const [label,patch] of [
  ['missing acknowledgement',{DB_ALLOW_TLS_REQUIRE:undefined}],
  ['wrong acknowledgement',{DB_ALLOW_TLS_REQUIRE:'true'}],
  ['missing staging classification',{APP_ENV:undefined}],
  ['production classification',{APP_ENV:'production'}],
  ['wrong expected environment',{EXPECTED_APP_ENV:'production'}],
  ['missing fingerprint',{RECONCILIATION_EXPECTED_DB_IDENTITY:undefined}],
  ['malformed fingerprint',{RECONCILIATION_EXPECTED_DB_IDENTITY:'invalid'}],
  ['wrong fingerprint',{RECONCILIATION_EXPECTED_DB_IDENTITY:'0'.repeat(64)}],
  ['changed target',{DATABASE_URL:base.DATABASE_URL.replace('staging_fixture','different_fixture')}],
  ['local target',{DATABASE_URL:'postgresql://fixture_owner:PRIVATE_PASSWORD@127.0.0.1/staging_fixture'}]
]) test(`${label} blocked before any subprocess or file creation`,async t=>{
  const dir = directory(t), destination=path.join(dir,'not-created');let subprocess=0;
  const output=[];
  const result=await db.cli(async()=>db.backup({env:{...base,...patch,DB_DUMP_DIR:destination},run:()=>{subprocess++;assert.fail('must not spawn');}}),v=>output.push(v));
  assert.equal(result,1);assert.equal(JSON.parse(output[0]).code,'SOURCE_TLS_REQUIRE_BLOCKED');
  assert.equal(subprocess,0);assert.equal(fs.existsSync(destination),false);assert.deepEqual(fs.readdirSync(dir),[]);
  assert.doesNotMatch(output.join(''),/PRIVATE_PASSWORD|fixture_owner|fixture\.example|postgresql:|DATABASE_URL/);
});
function simulatedBackup(t,patch={}) {
  const dir=directory(t),env={...base,DB_DUMP_DIR:dir,...patch},calls=[];
  const restore=runFor(fixture(21));
  const result=db.backup({env,run:(binary,args,options)=>{
    calls.push({args,env:options.env});
    if(args.includes('--version'))return {status:0,stdout:'pg_dump (PostgreSQL) 18.4'};
    if(args.includes('-Fc')) {fs.writeSync(options.stdio[1],'PGDMP-synthetic');return {status:0};}
    return restore(binary,args);
  }});
  return {result,calls};
}
test('exact staging identity reaches mocked dump and manifest records bound identity',t=>{
  const {result,calls}=simulatedBackup(t);assert.equal(calls.filter(c=>c.args.includes('-Fc')).length,1);
  assert.equal(calls.find(c=>c.args.includes('-Fc')).env.PGSSLMODE,'require');
  assert.equal(db.readManifest(result.file).sourceIdentitySha256,base.RECONCILIATION_EXPECTED_DB_IDENTITY);
  assert.equal(db.readManifest(result.file).sourceTlsMode,'require');
  assert.equal(fs.existsSync(result.file+'.partial'),false);
});
test('backup-only require needs no CA; explicitly supplied CA is preserved',t=>{
  const noCa=simulatedBackup(t);assert.equal(noCa.calls.find(c=>c.args.includes('-Fc')).env.PGSSLROOTCERT,undefined);
  const withCa=simulatedBackup(t,{DB_SSL_CA_PATH:'synthetic-ca-path.pem'});
  assert.equal(withCa.calls.find(c=>c.args.includes('-Fc')).env.PGSSLROOTCERT,'synthetic-ca-path.pem');
});
test('general continuity and restore still reject require',()=>{
  assert.throws(()=>db.connection(base),e=>e.code==='VERIFIED_TLS_REQUIRED');
  assert.throws(()=>db.restoreGuard({...base,RESTORE_DATABASE_URL:base.DATABASE_URL,RESTORE_DB_SSL_MODE:'require'},true),e=>e.code==='VERIFIED_TLS_REQUIRED');
});
test('staging inventory rejects require before constructing client, accepts verify-full guard',async()=>{
  await assert.rejects(()=>staging.inspect({env:base,intent:'--staging-read-only',factory:()=>assert.fail('no client')}),e=>e.code==='STAGING_IDENTITY_BLOCKED');
  assert.equal(staging.target({...base,DB_SSL_MODE:'verify-full'},'--staging-read-only').sslMode,'verify-full');
});
test('verify-full backup unchanged and needs no require acknowledgement or expected identity',t=>{
  const {result,calls}=simulatedBackup(t,{DB_SSL_MODE:'verify-full',DB_ALLOW_TLS_REQUIRE:undefined,APP_ENV:undefined,
    EXPECTED_APP_ENV:undefined,RECONCILIATION_EXPECTED_DB_IDENTITY:undefined,DB_SSL_CA_PATH:'synthetic-ca.pem'});
  assert.equal(db.readManifest(result.file).sourceTlsMode,'verify-full');
  assert.equal(calls.find(c=>c.args.includes('-Fc')).env.PGSSLMODE,'verify-full');
});
