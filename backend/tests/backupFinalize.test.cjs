const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const db=require('../scripts/lib/dbContinuity.cjs');
const {finalize}=require('../scripts/dbBackupFinalize.cjs');
const {fixture,runFor}=require('./helpers/backupArchiveFixture.cjs');
beforeEach(t=>{
  const forbidden=()=>assert.fail('REMOTE_OR_REAL_OPERATION_FORBIDDEN');
  t.mock.method(require('node:child_process'),'spawnSync',forbidden);
  t.mock.method(require('node:net').Socket.prototype,'connect',forbidden);
  for(const Class of [require('pg').Client,require('pg').Pool])for(const method of ['connect','query'])t.mock.method(Class.prototype,method,forbidden);
});
function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-finalize-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
  const file=path.join(dir,'asedeliya-20261010T072810544Z.dump.partial');fs.writeFileSync(file,'PGDMP-fixture');
  const f=fixture(21),proof={format:'asedeliya-local-restore-proof',version:1,archiveSha256:db.checksum(file),sizeBytes:fs.statSync(file).size,
    appliedMigrations:f.names,createdAt:'2026-10-10T08:00:00.000Z',status:'PASS',localTarget:true,requiredSchema:true,
    dataCounts:Object.fromEntries(f.inventory.tables.map(t=>[t,'0'])),cleanup:true};
  const proofFile=file+'.restore-proof.json';fs.writeFileSync(proofFile,JSON.stringify(proof));
  const calls=[],run=(binary,args,options)=>{calls.push(args);assert.equal(options.env.PGHOST,undefined);assert.ok(!args.includes('-Fc'));return args.includes('--list')
    ? {status:0,stdout:'; Dumped by pg_dump version: 18.4\n'+f.listing}:runFor(f)(binary,args);};
  const env={APP_ENV:'staging',DB_SSL_MODE:'require',RECONCILIATION_EXPECTED_DB_IDENTITY:'a'.repeat(64)};
  return {file,proofFile,proof,env,run,calls,final:file.slice(0,-8)};
}
test('missing partial refused',t=>{const s=setup(t);fs.unlinkSync(s.file);assert.throws(()=>finalize(s.file,s.proofFile,s),e=>e.code==='ARCHIVE_NOT_FOUND');});
test('wrong suffix refused',t=>{const s=setup(t);assert.throws(()=>finalize(s.final,s.proofFile,s),e=>e.code==='FINALIZE_PARTIAL_REQUIRED');});
test('archive verification failure preserves partial without publication',t=>{const s=setup(t);s.run=()=>({status:1});assert.throws(()=>finalize(s.file,s.proofFile,s));assert.ok(fs.existsSync(s.file));assert.ok(!fs.existsSync(s.final));});
test('invalid migration state refused before publication',t=>{const s=setup(t);s.proof.appliedMigrations.pop();fs.writeFileSync(s.proofFile,JSON.stringify(s.proof));assert.throws(()=>finalize(s.file,s.proofFile,s));assert.ok(fs.existsSync(s.file));});
test('existing destination not overwritten',t=>{const s=setup(t);fs.writeFileSync(s.final,'owner');assert.throws(()=>finalize(s.file,s.proofFile,s),e=>e.code==='BACKUP_ALREADY_EXISTS');assert.equal(fs.readFileSync(s.final,'utf8'),'owner');});
for(const key of ['status','cleanup','localTarget','requiredSchema','archiveSha256'])test(`invalid restore proof ${key} rejected`,t=>{const s=setup(t);s.proof[key]='invalid';fs.writeFileSync(s.proofFile,JSON.stringify(s.proof));assert.throws(()=>finalize(s.file,s.proofFile,s),e=>e.code==='RESTORE_PROOF_INVALID');assert.equal(s.calls.length,0);});
test('missing historical source identity fails closed',t=>{const s=setup(t);delete s.env.RECONCILIATION_EXPECTED_DB_IDENTITY;assert.throws(()=>finalize(s.file,s.proofFile,s),e=>e.code==='SOURCE_METADATA_REQUIRED');assert.ok(fs.existsSync(s.file));});
test('atomic link publication preserves bytes, creates compatible manifest and evidence',t=>{
  const s=setup(t),before=fs.readFileSync(s.file),links=[],link=fs.linkSync;
  t.mock.method(fs,'linkSync',(from,to)=>{links.push(to);return link(from,to);});
  const result=finalize(s.file,s.proofFile,s);
  assert.equal(result.status,'BACKUP_VERIFIED');assert.deepEqual(fs.readFileSync(s.final),before);assert.equal(result.sha256,db.checksum(s.final));
  assert.equal(links.at(-1),s.final);assert.ok(!fs.existsSync(s.file));assert.ok(fs.existsSync(s.final+'.restore-proof.json'));
  const manifest=db.readManifest(s.final);assert.equal(manifest.sourceIdentitySha256,s.env.RECONCILIATION_EXPECTED_DB_IDENTITY);
  assert.equal(manifest.dataBlocksRestored,false);assert.equal(manifest.createdAt,'2026-10-10T07:28:10.544Z');
  assert.equal(db.verify(s.final,s).status,'BACKUP_VERIFIED');
});
test('publication failure leaves partial and removes only newly created metadata',t=>{const s=setup(t);const link=fs.linkSync;t.mock.method(fs,'linkSync',(a,b)=>{if(b===s.final)throw Error('injected');return link(a,b);});assert.throws(()=>finalize(s.file,s.proofFile,s));assert.ok(fs.existsSync(s.file));assert.ok(!fs.existsSync(s.final+'.manifest.json'));});
test('preexisting pending metadata is not deleted',t=>{const s=setup(t),pending=s.final+'.manifest.json.pending';fs.writeFileSync(pending,'owner');assert.throws(()=>finalize(s.file,s.proofFile,s));assert.equal(fs.readFileSync(pending,'utf8'),'owner');});
