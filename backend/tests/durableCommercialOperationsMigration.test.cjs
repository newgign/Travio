const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const guard=require('../scripts/lib/durableCommercialOperationsMigrationGuard.cjs');
const sql=fs.readFileSync(path.resolve(__dirname,'../../database/migrations',guard.migration),'utf8');
const stripped=sql.replace(/--[^\n]*/g,'');
const local=()=>({DATABASE_URL:'postgresql://fixture@127.0.0.1:55437/asedeliya_7x_upgrade_abcdef123456',DB_SSL_MODE:'disable',NODE_ENV:'test',APP_ENV:'test',EXPECTED_APP_ENV:'test',LOCAL_COMMERCIAL_MIGRATION_APPROVAL:guard.localApproval});
const pool=()=>({options:{host:'127.0.0.1',port:55437,database:'asedeliya_7x_upgrade_abcdef123456',ssl:false}});
test('exact ordered migration inventory and pinned checksum',()=>assert.equal(guard.inventoryCheck(),true));
test('001-022 byte-for-byte unchanged from committed 7W',()=>{
 for(const name of fs.readdirSync(path.resolve(__dirname,'../../database/migrations')).filter(n=>n.endsWith('.sql')&&!n.startsWith('023_'))){
  const current=fs.readFileSync(path.resolve(__dirname,'../../database/migrations',name),'utf8').replace(/\r\n/g,'\n');
  const previous=execFileSync('git',['show',`f70895f:database/migrations/${name}`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  assert.equal(crypto.createHash('sha256').update(current).digest('hex'),crypto.createHash('sha256').update(previous).digest('hex'));
 }
});
for(const word of ['DROP TABLE','DROP COLUMN','TRUNCATE','DELETE FROM','INSERT INTO'])test(`no destructive/backfill ${word}`,()=>assert.doesNotMatch(stripped,new RegExp('\\b'+word.replaceAll(' ','\\s+')+'\\b','i')));
for(const word of ['pan','cvv','card_number','api_key','webhook_secret','raw_payload','password'])test(`no sensitive field ${word}`,()=>assert.doesNotMatch(stripped,new RegExp('\\b'+word+'\\b','i')));
for(const name of ['commercial_operations','commercial_operation_attempts','commercial_operation_evidence','commercial_operation_reconciliation_attempts','commercial_operation_reconciliation_cases'])test(`typed entity ${name}`,()=>assert.match(stripped,new RegExp('CREATE TABLE '+name+'\\s*\\(')));
for(const name of ['commercial_operation_scope_unique','commercial_operation_owner_fk','commercial_operation_payment_fk','commercial_operation_refund_fk','commercial_operation_resource_shape','commercial_operation_money','commercial_operation_claim_shape','commercial_operation_completion_shape','commercial_operation_result_fk','commercial_operation_result_shape'])test(`DB constraint ${name}`,()=>assert.ok(stripped.includes('CONSTRAINT '+name)));
for(const name of ['commercial_operation_booking_unique','commercial_operation_charge_unique','commercial_operation_cancellation_unique','commercial_operation_full_refund_unique','commercial_operation_external_unique','commercial_operation_attempt_active_unique','commercial_operation_reconciliation_active_unique'])test(`unique invariant ${name}`,()=>assert.ok(stripped.includes('CREATE UNIQUE INDEX '+name)));
test('evidence event identity scoped to adapter/account/environment',()=>assert.match(stripped,/UNIQUE\(adapter_id,adapter_account_scope,execution_environment,event_identity_digest\)/));
test('update/evidence/attempt guards and deferred result guard',()=>{for(const name of ['commercial_operation_update_guard','commercial_evidence_guard','commercial_attempt_guard'])assert.match(stripped,new RegExp('CREATE TRIGGER '+name));assert.match(stripped,/CREATE CONSTRAINT TRIGGER commercial_operation_result_guard/);assert.match(stripped,/DEFERRABLE INITIALLY DEFERRED/);});
test('runner owns transaction; no top-level SQL transaction wrapper',()=>{assert.doesNotMatch(stripped,/^\s*(BEGIN|COMMIT);/m);assert.match(fs.readFileSync(path.resolve(__dirname,'../scripts/migrate.js'),'utf8'),/query\("BEGIN"\)/);});
test('defaults pass offline with no execution',()=>{assert.equal(guard.preflight({}).status,'PASS');assert.equal(guard.preflight({}).executionAllowed,false);});
test('preflight never echoes secrets',()=>assert.doesNotMatch(JSON.stringify(guard.preflight({DATABASE_URL:'private-marker',JWT_SECRET:'private-marker'})),/private-marker/));
test('explicit disposable-local pool accepted',()=>assert.doesNotThrow(()=>guard.assertLocalExecutionAllowed(local(),pool())));
for(const [label,extra] of [['no approval',{LOCAL_COMMERCIAL_MIGRATION_APPROVAL:undefined}],['wrong approval',{LOCAL_COMMERCIAL_MIGRATION_APPROVAL:'true'}],['production',{APP_ENV:'production'}],['non-test',{NODE_ENV:'production'}],['ssl override',{DB_SSL_MODE:'require'}],['remote target',{DATABASE_URL:'postgresql://fixture@db.example/asedeliya_7x_upgrade_abcdef123456'}],['owner database',{DATABASE_URL:'postgresql://fixture@localhost/asedeliya'}],['URL TLS option',{DATABASE_URL:local().DATABASE_URL+'?sslmode=disable'}],['sales enabled',{PRODUCTION_SALES_ENABLED:'true'}],['payments enabled',{PAYMENTS_MODE:'sandbox'}]])test(`guard rejects ${label}`,()=>assert.throws(()=>guard.assertLocalExecutionAllowed({...local(),...extra},pool()),{code:'DURABLE_COMMERCIAL_MIGRATION_BLOCKED'}));
test('injected remote pool rejected despite local env',()=>assert.throws(()=>guard.assertLocalExecutionAllowed(local(),{options:{...pool().options,host:'db.example'}}),{code:'DURABLE_COMMERCIAL_MIGRATION_BLOCKED'}));
test('old 021/022 approvals cannot reach pool for 023',async()=>{
 const env=require('./helpers/reconciliationMigrationEnv.cjs')();Object.assign(env,{SESSION_SECURITY_MIGRATION_ENABLED:'true',SESSION_SECURITY_MIGRATION_APPROVAL:'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS',SESSION_SECURITY_EXPECTED_DB_IDENTITY:env.RECONCILIATION_EXPECTED_DB_IDENTITY});let calls=0;
 await assert.rejects(require('../scripts/migrate').migrate({connect(){calls++;}},env),{code:'DURABLE_COMMERCIAL_MIGRATION_BLOCKED'});assert.equal(calls,0);
});
