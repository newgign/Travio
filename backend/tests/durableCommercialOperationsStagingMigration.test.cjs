// Synthetic configuration + fake executor only. No real DB/provider transport.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const guard=require('../scripts/lib/durableCommercialOperationsMigrationGuard.cjs');
const tls=require('../config/renderInternalTls.cjs');
const {databaseConfig}=require('../config/database');
const {migrate,publicMigrationCode}=require('../scripts/migrate');
const files=fs.readdirSync(path.resolve(__dirname,'../../database/migrations')).filter(f=>f.endsWith('.sql')).sort();
const denied=e=>e.code==='DURABLE_COMMERCIAL_MIGRATION_BLOCKED';
function env(patch={}){
 const value={APP_ENV:'staging',EXPECTED_APP_ENV:'staging',NODE_ENV:'production',
  DATABASE_URL:'postgresql://synthetic:synthetic@db.example/asedeliya_staging',DB_SSL_MODE:'require',
  RENDER_INTERNAL_TLS_REQUIRE_APPROVAL:tls.approval,BACKUP_RESTORE_READY_ATTESTED:'I_VERIFIED_BACKUP_AND_RESTORE_EVIDENCE_FOR_TARGET',
  DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:'true',DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL:guard.stagingApproval,
  RECONCILIATION_STORAGE_MIGRATION_ENABLED:'false',SESSION_SECURITY_MIGRATION_ENABLED:'false',SESSION_STATE_ENFORCEMENT:'enabled',
  RECONCILIATION_STORAGE_MODE:'disabled',PRODUCTION_SALES_ENABLED:'false',REAL_CHARGES_ENABLED:'false',REAL_REFUNDS_ENABLED:'false',
  HOTELBEDS_BOOKING_ENABLED:'false',HOTELBEDS_LIVE_BOOKING_ENABLED:'false',PAYMENTS_MODE:'disabled',PAYMENTS_PROVIDER:'none'};
 const fingerprint=tls.sourceIdentity({local:false,host:'db.example',port:'5432',database:'asedeliya_staging'});
 Object.assign(value,{RECONCILIATION_EXPECTED_DB_IDENTITY:fingerprint,SESSION_SECURITY_EXPECTED_DB_IDENTITY:fingerprint,DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY:fingerprint});
 return Object.assign(value,patch);
}
function fake(value,history=files.slice(0,22),failSql=false){
 const statements=[];let ledger=[...history],connects=0,releases=0,ends=0;
 const client={async query(sql,args){statements.push(sql);
  if(sql==='SELECT name FROM public._migrations ORDER BY name')return {rows:ledger.map(name=>({name}))};
  if(sql==='SELECT 1 FROM _migrations WHERE name = $1')return {rows:ledger.includes(args[0])?[{}]:[]};
  if(sql===fs.readFileSync(path.resolve(__dirname,'../../database/migrations',guard.migration),'utf8')&&failSql)throw Object.assign(Error('private synthetic error'),{code:'23514'});
  if(sql==='INSERT INTO _migrations (name) VALUES ($1)')ledger.push(args[0]);
  return {rows:[]};},release(){releases++;}};
 return {options:databaseConfig(value),async connect(){connects++;return client;},async end(){ends++;},statements,
  get ledger(){return ledger;},get connects(){return connects;},get releases(){return releases;},get ends(){return ends;}};
}
test('explicit staging configuration accepted, session enforcement remains enabled',()=>{assert.equal(guard.assertStagingConfiguration(env()).ssl.rejectUnauthorized,false);});
test('verified TLS remains accepted with default trust',()=>{const config=guard.assertStagingConfiguration(env({DB_SSL_MODE:'verify-full'}));assert.equal(config.ssl.rejectUnauthorized,true);});
test('021/022 migration flags stay false',()=>assert.doesNotThrow(()=>guard.assertStagingConfiguration(env())));
for(const [name,patch] of [
 ['empty opt-in',{DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:''}],
 ['malformed opt-in',{DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:'TRUE'}],
 ['wrong acknowledgement',{DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL:'true'}],
 ['missing acknowledgement',{DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL:undefined}],
 ['production enabled',{APP_ENV:'production'}],
 ['production disabled',{APP_ENV:'production',DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:'false'}],
 ['unknown environment',{APP_ENV:'unknown',EXPECTED_APP_ENV:'unknown'}],
 ['unknown database',{DATABASE_URL:'postgresql://synthetic:synthetic@db.example/unknown_database'}],
 ['wrong expected environment',{EXPECTED_APP_ENV:'production'}],
 ['wrong node mode',{NODE_ENV:'test'}],
 ['old 021 opt-in',{RECONCILIATION_STORAGE_MIGRATION_ENABLED:'true'}],
 ['old 022 opt-in',{SESSION_SECURITY_MIGRATION_ENABLED:'true'}],
 ['missing backup attestation',{BACKUP_RESTORE_READY_ATTESTED:undefined}],
 ['wrong target binding',{DURABLE_COMMERCIAL_OPERATIONS_EXPECTED_DB_IDENTITY:'0'.repeat(64)}],
 ['TLS disabled',{DB_SSL_MODE:'disable'}],
 ['generic TLS bypass',{NODE_TLS_REJECT_UNAUTHORIZED:'0'}],
 ['wrong Render approval',{RENDER_INTERNAL_TLS_REQUIRE_APPROVAL:'true'}],
 ['require with CA override',{DB_SSL_CA_PATH:'system'}],
 ['mixed local approval',{LOCAL_COMMERCIAL_MIGRATION_APPROVAL:guard.localApproval}],
 ['sales enabled',{PRODUCTION_SALES_ENABLED:'true'}],
 ['charges enabled',{REAL_CHARGES_ENABLED:'true'}],
 ['refunds enabled',{REAL_REFUNDS_ENABLED:'true'}],
 ['booking enabled',{HOTELBEDS_BOOKING_ENABLED:'true'}],
 ['live booking enabled',{HOTELBEDS_LIVE_BOOKING_ENABLED:'true'}],
 ['sandbox payments',{PAYMENTS_MODE:'sandbox'}],
 ['provider selected',{PAYMENTS_PROVIDER:'synthetic'}],
 ['storage enabled',{RECONCILIATION_STORAGE_MODE:'postgres'}]]){
 test(`${name} denied before connect`,async()=>{let connects=0;await assert.rejects(migrate({connect(){connects++;}},env(patch)),denied);assert.equal(connects,0);});
}
test('default missing staging opt-in refuses pending023 before mutation',async()=>{const value=env({DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:undefined,DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL:undefined}),pool=fake(value);await assert.rejects(migrate(pool,value),denied);assert.equal(pool.statements.some(s=>/^(CREATE|INSERT|BEGIN|ALTER)/.test(s)),false);assert.equal(pool.ends,1);});
for(const [name,history,inventory] of [
 ['exact022 baseline',files.slice(0,22),files],
 ['already023',files,files],
 ['missing022',files.slice(0,21),files],
 ['missing earlier baseline',files.slice(1,23),files],
 ['duplicate migration version',[...files.slice(0,22),files[21]],files],
 ['unexpected024',[...files,'024_unexpected.sql'],[...files,'024_unexpected.sql']],
 ['renamed023',files.slice(0,22),[...files.slice(0,22),'023_wrong.sql']]]){
 test(`ledger protection: ${name}`,()=>{if(['exact022 baseline','already023'].includes(name))assert.equal(guard.assertStagingLedger(history,env(),inventory),name==='exact022 baseline');else assert.throws(()=>guard.assertStagingLedger(history,env(),inventory),denied);});
}
test('staging applies only023 with advisory lock and one atomic ledger commit',async()=>{const value=env(),pool=fake(value);await migrate(pool,value);assert.deepEqual(pool.ledger,files);assert.equal(pool.statements.filter(s=>s==='BEGIN').length,1);assert.equal(pool.statements.filter(s=>s==='COMMIT').length,1);assert.equal(pool.statements.filter(s=>s==='INSERT INTO _migrations (name) VALUES ($1)').length,1);assert.equal(pool.statements[0],'SELECT pg_advisory_lock(319003)');assert.equal(pool.statements.at(-1),'SELECT pg_advisory_unlock(319003)');assert.equal(pool.statements.some(s=>s.includes('CREATE TABLE IF NOT EXISTS')),false);assert.equal(pool.releases,1);assert.equal(pool.ends,1);});
test('SQL failure rolls back and does not insert ledger row',async()=>{const value=env(),pool=fake(value,files.slice(0,22),true);await assert.rejects(migrate(pool,value),e=>e.code==='23514');assert.ok(pool.statements.includes('ROLLBACK'));assert.equal(pool.statements.includes('COMMIT'),false);assert.equal(pool.ledger.length,22);assert.equal(pool.releases,1);assert.equal(pool.ends,1);});
test('applied023 reruns safely with authorization enabled or disabled',async()=>{for(const flag of ['true','false',undefined]){const value=env({DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:flag,DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_APPROVAL:flag==='true'?guard.stagingApproval:undefined}),pool=fake(value,files);await migrate(pool,value);assert.deepEqual(pool.ledger,files);assert.equal(pool.statements.some(s=>/^(BEGIN|INSERT|CREATE|ALTER)/.test(s)),false);}});
test('bound pool cannot override validated target or TLS',async()=>{for(const change of [{connectionString:'private wrong target'},{host:'other.invalid'},{ssl:{rejectUnauthorized:true}},{database:'another'}]){const value=env(),pool=fake(value);Object.assign(pool.options,change);await assert.rejects(migrate(pool,value),denied);assert.equal(pool.connects,0);}});
test('preflight validates staging config without granting ledger execution',()=>{const result=guard.preflight(env());assert.equal(result.status,'PASS');assert.equal(result.executionAllowed,false);assert.equal(result.pendingState,'NOT_QUERIED');assert.equal(guard.preflight(env({REAL_CHARGES_ENABLED:'true'})).status,'FAIL');});
test('source023 checksum and all001-022 remain identical to base',()=>{for(const file of files){const actual=fs.readFileSync(path.resolve(__dirname,'../../database/migrations',file),'utf8').replace(/\r\n/g,'\n');const base=execFileSync('git',['show',`7a683ca:database/migrations/${file}`],{encoding:'utf8'}).replace(/\r\n/g,'\n');assert.equal(actual,base);}assert.equal(guard.inventoryCheck(),true);});
test('mutation of source inventory is rejected without filesystem changes',()=>{assert.throws(()=>guard.assertStagingLedger(files.slice(0,22),env(),files.slice(0,22)),denied);});
test('023 checksum mismatch blocks before connection',async t=>{const read=fs.readFileSync;t.mock.method(fs,'readFileSync',(file,...args)=>{const result=read(file,...args);return String(file).endsWith(guard.migration)?result+'\n-- synthetic mismatch':result;});let connects=0;await assert.rejects(migrate({connect(){connects++;}},env()),denied);assert.equal(connects,0);});
test('diagnostics never echo credentials or arbitrary exception codes',()=>{for(const code of ['private-token','PRIVATE_SECRET','ECONNREFUSED',undefined])assert.equal(publicMigrationCode({code,message:'private',stack:'private'}),'MIGRATION_FAILED');assert.equal(publicMigrationCode({code:'23514'}),'MIGRATION_SQL_FAILED');const result=JSON.stringify(guard.preflight(env({DATABASE_URL:'private-marker'})));assert.equal(result.includes('private-marker'),false);});
test('CLI migration rejection remains nonzero without DB/network',()=>{const result=spawnSync(process.execPath,['backend/scripts/migrate.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,APP_ENV:'production',DURABLE_COMMERCIAL_OPERATIONS_MIGRATION_ENABLED:'true'},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/MIGRATION ERROR: DURABLE_COMMERCIAL_MIGRATION_BLOCKED/);assert.equal(result.stderr.includes('postgresql:'),false);});
test('existing disposable-local decision preserved, owner DB rejected',()=>{const value={NODE_ENV:'test',APP_ENV:'test',EXPECTED_APP_ENV:'test',DATABASE_URL:'postgresql://fixture@127.0.0.1:55437/asedeliya_7x_upgrade_abcdef123456',DB_SSL_MODE:'disable',LOCAL_COMMERCIAL_MIGRATION_APPROVAL:guard.localApproval};const pool={options:{host:'127.0.0.1',port:55437,database:'asedeliya_7x_upgrade_abcdef123456',ssl:false}};assert.doesNotThrow(()=>guard.assertLocalExecutionAllowed(value,pool));assert.throws(()=>guard.assertLocalExecutionAllowed({...value,DATABASE_URL:'postgresql://fixture@127.0.0.1/owner'},pool),denied);});
