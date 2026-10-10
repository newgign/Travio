const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../scripts/lib/dbContinuity.cjs');
const state = require('../scripts/lib/backupMigrationState.cjs');
const staging = require('../scripts/stagingMigrationInventory.cjs');
const { fixture, runFor } = require('./helpers/backupArchiveFixture.cjs');
const known = db.migrationInventory().migrations;
beforeEach(t => {
  const fail = () => { throw Error('FORBIDDEN_REAL_OPERATION'); };
  for (const protocol of ['node:http','node:https']) for (const method of ['request','get']) t.mock.method(require(protocol),method,fail);
  t.mock.method(require('node:net').Socket.prototype,'connect',fail);
  t.mock.method(globalThis,'fetch',fail);
  for (const Class of [require('pg').Pool,require('pg').Client]) for (const method of ['connect','query']) t.mock.method(Class.prototype,method,fail);
});
function archive(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-7m3a-'));
  const file = path.join(dir,db.dumpName(new Date('2026-10-10')));
  fs.writeFileSync(file,'PGDMP-synthetic-only');
  const manifest = db.makeManifest(file,db.connection({DATABASE_URL:'postgresql://u:synthetic@localhost/fixture',DB_SSL_MODE:'disable'}),new Date('2026-10-10'),'16',{});
  fs.writeFileSync(file+'.manifest.json',JSON.stringify(manifest));
  t.after(() => fs.rmSync(dir,{recursive:true})); return { file, manifest };
}
const verify = (t,value) => db.verify(archive(t).file,{env:{},run:runFor(value)});
for (const count of [20,21,22]) test(`valid migration-prefix archive through ${count} passes`,t => {
  const value = fixture(count), result = verify(t,value);
  assert.equal(result.status,'BACKUP_VERIFIED'); assert.deepEqual(result.appliedMigrations,known.slice(0,count));
  assert.equal(result.expectedTables,value.inventory.tables.length); assert.equal(result.dataBlocksRestored,false);
});
test('pre-021 has neither reconciliation tables nor session fields',t => {
  const value=fixture(20); assert.doesNotMatch(value.listing,/reconciliation/); assert.doesNotMatch(value.schema,/session_version|is_active/); verify(t,value);
});
test('post-021 requires reconciliation but no session fields',t => {
  const value=fixture(21); assert.match(value.listing,/reconciliation/); assert.doesNotMatch(value.schema,/session_version|is_active/); verify(t,value);
});
for (const [count,missing] of [[20,'TABLE public users '],[20,'TABLE DATA public bookings '],[21,'TABLE public reconciliation_cases '],
  [21,'TABLE public reconciliation_observations '],[21,'INDEX public reconciliation_cases_queue_idx '],
  [21,'FK CONSTRAINT public reconciliation_observations ']]) test(`archive ${count} missing mandatory ${missing} rejected`,t => {
  const value=fixture(count); value.listing=value.listing.split('\n').filter(line=>!line.includes(missing)).join('\n');
  assert.throws(()=>verify(t,value),e=>e.code==='ARCHIVE_OBJECTS_MISSING');
});
for (const column of ['session_version','is_active']) test(`post-022 missing ${column} rejected`,t => {
  const value=fixture(); value.schema=value.schema.split('\n').filter(line=>!line.trimStart().startsWith(column+' ')).join('\n');
  assert.throws(()=>verify(t,value),e=>e.code==='ARCHIVE_SESSION_SCHEMA_INVALID');
});
test('post-022 wrong defaults rejected',t=>{const v=fixture();v.schema=v.schema.replace('DEFAULT 1','DEFAULT 0');assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_SESSION_SCHEMA_INVALID');});
test('post-022 nullable column rejected',t=>{const v=fixture();v.schema=v.schema.replace('boolean DEFAULT true NOT NULL','boolean DEFAULT true');assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_SESSION_SCHEMA_INVALID');});
test('post-022 missing positive constraint rejected',t=>{const v=fixture();v.schema=v.schema.replace('users_session_version_check','removed_check');assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_SESSION_SCHEMA_INVALID');});
test('022 without 021 rejected by archive ledger',t=>{const v=fixture();v.ledger=v.ledger.split('\n').filter(l=>!l.includes('021_')).join('\n');assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_MIGRATION_HISTORY_INVALID');});
for (const [label,names] of [['empty',[]],['gap',known.filter((_,i)=>i!==8)],['duplicate',[...known.slice(0,20),known[19]]],
  ['future',[...known,'023_future.sql']],['malformed',['private@example.test']],['wrong order',[known[1],known[0]]]])
  test(`invalid ${label} migration history rejected`,()=>assert.throws(()=>state.assertHistory(names,known),e=>e.code==='ARCHIVE_MIGRATION_HISTORY_INVALID'));
test('schema ahead of ledger: future reconciliation objects rejected',t=>{const v=fixture(20);v.listing+='\n999; 1 1 TABLE public reconciliation_cases owner';assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_MIGRATION_SCHEMA_MISMATCH');});
test('schema ahead of ledger: future reconciliation index rejected',t=>{const v=fixture(20);v.listing+='\n999; 1 1 INDEX public reconciliation_cases_queue_idx owner';assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_MIGRATION_SCHEMA_MISMATCH');});
test('schema ahead of ledger: future session columns rejected',t=>{const v=fixture(21);v.schema=fixture().schema;assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_MIGRATION_SCHEMA_MISMATCH');});
test('malformed COPY metadata rejected',()=>{for(const text of ['',fixture().ledger.replace('COPY public','COPY private'),fixture().ledger.replace('2026-10-10','invalid-date')])assert.throws(()=>state.readHistory(text,known));});
test('checksum corruption rejected before pg_restore',t=>{const {file}=archive(t);fs.appendFileSync(file,'corrupt');assert.throws(()=>db.verify(file,{run:()=>assert.fail('tool must not run')}),e=>e.code==='CHECKSUM_MISMATCH');});
test('malformed manifest metadata remains rejected',t=>{const {file,manifest}=archive(t);fs.writeFileSync(file+'.manifest.json',JSON.stringify({...manifest,password:'forbidden'}));assert.throws(()=>db.verify(file,{run:runFor()}),e=>e.code==='INVALID_MANIFEST');});
const env = { NODE_ENV:'test',APP_ENV:'staging',EXPECTED_APP_ENV:'staging',DB_SSL_MODE:'verify-full',
  DATABASE_URL:'postgresql://private_user:private_password@private.example.invalid/staging_fixture' };
env.RECONCILIATION_EXPECTED_DB_IDENTITY=db.sourceIdentity(db.connection(env));
test('exact staging identity match accepted without any connection',()=>assert.equal(staging.target(env,'--staging-read-only').database,'staging_fixture'));
test('missing intent or wrong fingerprint rejects before factory',async()=>{
  for(const patch of [{RECONCILIATION_EXPECTED_DB_IDENTITY:'0'.repeat(64)},{RECONCILIATION_EXPECTED_DB_IDENTITY:undefined}])
    await assert.rejects(()=>staging.inspect({env:{...env,...patch},intent:'--staging-read-only',factory:()=>assert.fail('no connection')}));
  assert.throws(()=>staging.target(env,undefined));
});
test('production classification and target labels rejected',()=>{
  for(const patch of [{APP_ENV:'production'},{NODE_ENV:'production'},{EXPECTED_APP_ENV:'production'},
    {DATABASE_URL:env.DATABASE_URL.replace('private.example','production.example')},{HOTELBEDS_ENV:'live'},{REAL_CHARGES_ENABLED:'true'}])assert.throws(()=>staging.target({...env,...patch},'--staging-read-only'));
});
test('read-only staging inventory uses only bounded transaction and SELECT, sanitized output',async()=>{
  const sql=[]; let ended=0;
  const result=await staging.inspect({env,intent:'--staging-read-only',factory:()=>({connect:async()=>{},end:async()=>{ended++;},
    query:async text=>{sql.push(text);return {rows:known.slice(0,20).map(name=>({name}))};}})});
  assert.deepEqual(sql,['BEGIN READ ONLY','SELECT name FROM public._migrations ORDER BY id','COMMIT']);assert.equal(ended,1);
  assert.deepEqual(Object.keys(result),['environment','sourceIdentitySha256','expectedTargetMatch','migrations']);
  assert.equal(result.expectedTargetMatch,true);assert.equal(result.migrations.count,20);
  assert.doesNotMatch(JSON.stringify(result),/private|postgresql|password|username|host/i);
});
test('bad staging ledger rolls back and emits no arbitrary data',async()=>{
  const sql=[],output=[];
  const result=await db.cli(async()=>staging.inspect({env,intent:'--staging-read-only',factory:()=>({connect:async()=>{},end:async()=>{},query:async text=>{
    sql.push(text);return {rows:[{name:'private_password@example.test'}]};}})}),value=>output.push(value));
  assert.equal(result,1);assert.equal(sql.at(-1),'ROLLBACK');assert.doesNotMatch(output.join(''),/private_password|@|stack|SELECT/);
});
