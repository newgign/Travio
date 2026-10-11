// Explicit opt-in. Fixed loopback, newly provisioned cluster, synthetic rows only.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {Pool,Client}=require('pg');
const guard=require('../scripts/lib/durableCommercialOperationsMigrationGuard.cjs');
const {migrate}=require('../scripts/migrate');
const config={host:'127.0.0.1',port:55437,user:'sprint7x',ssl:false,connectionTimeoutMillis:3000};
const suffix=crypto.randomBytes(6).toString('hex');
const names={upgrade:`asedeliya_7x_upgrade_${suffix}`,fresh:`asedeliya_7x_fresh_${suffix}`};
let pool;
const uid=()=>crypto.randomUUID();
const digest=()=>crypto.randomBytes(32).toString('hex');
const envFor=database=>({NODE_ENV:'test',APP_ENV:'test',EXPECTED_APP_ENV:'test',DB_SSL_MODE:'disable',
 DATABASE_URL:`postgresql://sprint7x@127.0.0.1:55437/${database}`,LOCAL_COMMERCIAL_MIGRATION_APPROVAL:guard.localApproval});
before(async()=>{
 assert.equal(process.env.SPRINT7X_LOCAL_PROOF,'CREATE_NEW_LOCAL_DATABASES');
 assert.equal(config.host,'127.0.0.1');
 for(const name of Object.values(names)) guard.localTarget(envFor(name));
 // No ambient environment file/DATABASE_URL is read, no remote address or provider transport.
 for(const mod of ['node:http','node:https']) for(const method of ['request','get']) require(mod)[method]=()=>{throw Error('EXTERNAL_IO_FORBIDDEN');};
 global.fetch=()=>{throw Error('EXTERNAL_IO_FORBIDDEN');};
 const admin=new Client({...config,database:'postgres'});await admin.connect();
 try {for(const name of Object.values(names)) {
  assert.match(name,/^asedeliya_7x_(upgrade|fresh)_[a-f0-9]{12}$/);
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
 }}finally{await admin.end();}
 await migrate(new Pool({...config,database:names.upgrade}),envFor(names.upgrade),{through:22});
 const check=new Client({...config,database:names.upgrade});await check.connect();
 try{assert.equal((await check.query('SELECT count(*)::int n FROM _migrations')).rows[0].n,22);}finally{await check.end();}
 await migrate(new Pool({...config,database:names.upgrade}),envFor(names.upgrade));
 await migrate(new Pool({...config,database:names.fresh}),envFor(names.fresh));
 await migrate(new Pool({...config,database:names.upgrade}),envFor(names.upgrade));
 pool=new Pool({...config,database:names.upgrade});
 fs.writeFileSync(path.resolve(__dirname,`../../.tmp/sprint7x-local-databases-${suffix}.json`),JSON.stringify({created:Object.values(names),host:'127.0.0.1',port:55437,cleanup:'retained; dedicated cluster stopped after proof'}),{flag:'wx'});
});
after(async()=>{if(pool)await pool.end();});
async function fixture(){
 const user=(await pool.query("INSERT INTO users(full_name,email,password) VALUES ('Synthetic', $1,'fixture-only') RETURNING id",[`${uid()}@example.invalid`])).rows[0].id;
 const booking=(await pool.query("INSERT INTO bookings(user_id,first_name,last_name,phone,email,provider) VALUES ($1,'Synthetic','Only','fixture','fixture@example.invalid','mock') RETURNING id",[user])).rows[0].id;
 const payment=(await pool.query("INSERT INTO payments(booking_id,amount) VALUES ($1,10) RETURNING id",[booking])).rows[0].id;
 const refund=(await pool.query("INSERT INTO refund_requests(booking_id,payment_id,user_id) VALUES ($1,$2,$3) RETURNING id",[booking,payment,user])).rows[0].id;
 return {user,booking,payment,refund};
}
function operation(f,type='PROVIDER_BOOKING',extra={}){return {operation_id:uid(),user_id:f.user,booking_id:f.booking,
 payment_id:type.startsWith('PAYMENT_')?f.payment:null,refund_request_id:type==='PAYMENT_REFUND'?f.refund:null,
 operation_type:type,execution_environment:'synthetic',adapter_id:'fixture',adapter_account_scope:'fixture',idempotency_key:'same-key',
 payload_digest:digest(),context_version:1,context_expires_at:new Date(Date.now()+600000),amount_minor:type.startsWith('PAYMENT_')?1000:null,currency:type.startsWith('PAYMENT_')?'EUR':null,...extra};}
async function insert(op,db=pool){const keys=Object.keys(op);return db.query(`INSERT INTO commercial_operations (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(op));}
async function reject(op,code='23514'){await assert.rejects(insert(op),e=>e.code===code);}
test('upgrade and reapply ledger contain 023 once and 23 total',async()=>{
 const r=await pool.query('SELECT name FROM _migrations ORDER BY name');assert.equal(r.rows.length,23);assert.equal(r.rows.filter(x=>x.name===guard.migration).length,1);
});
test('fresh and upgrade catalogs match',async()=>{
 const fresh=new Client({...config,database:names.fresh});await fresh.connect();
 try{for(const sql of [
  "SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  "SELECT t.relname,c.conname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname",
  "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
  "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname"
 ])assert.deepEqual((await fresh.query(sql)).rows,(await pool.query(sql)).rows);}finally{await fresh.end();}
});
test('all five additive tables and no automatic operation backfill',async()=>{
 const r=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'commercial_%'");assert.equal(r.rows.length,5);
 assert.equal((await pool.query('SELECT count(*)::int n FROM commercial_operations')).rows[0].n,0);
});
for(const type of ['PROVIDER_BOOKING','PAYMENT_CHARGE','PROVIDER_CANCELLATION','PAYMENT_REFUND']){
 test(`${type} valid durable intent`,async()=>{await insert(operation(await fixture(),type));});
 test(`${type} logical duplicate blocked despite changed key`,async()=>{const f=await fixture();await insert(operation(f,type));await reject(operation(f,type,{idempotency_key:'another'}),'23505');});
 test(`${type} same key different resource allowed`,async()=>{await insert(operation(await fixture(),type));await insert(operation(await fixture(),type));});
}
for(const [label,type,extra,code] of [
 ['invalid type','PROVIDER_BOOKING',{operation_type:'OTHER'},'23514'],['invalid state','PROVIDER_BOOKING',{state:'OTHER'},'23514'],
 ['initial dispatch forbidden','PROVIDER_BOOKING',{state:'DISPATCHING',attempt_no:1,claim_token:uid(),claimed_at:new Date()},'23514'],
 ['negative count','PROVIDER_BOOKING',{attempt_no:-1},'23514'],['negative money','PAYMENT_CHARGE',{amount_minor:-1},'23514'],
 ['missing money','PAYMENT_CHARGE',{amount_minor:null},'23514'],['invalid currency','PAYMENT_CHARGE',{currency:'eur'},'23514'],
 ['missing payment','PAYMENT_CHARGE',{payment_id:null},'23514'],['wrong account','PROVIDER_BOOKING',{user_id:2147483647},'23503'],
 ['wrong payment','PAYMENT_CHARGE',{payment_id:2147483647},'23503'],['missing key','PROVIDER_BOOKING',{idempotency_key:null},'23502']]){
 test(label,async()=>{await reject(operation(await fixture(),type,extra),code);});
}
test('two connections concurrent duplicate insert: one durable row',async()=>{
 const op=operation(await fixture());const a=await pool.connect(),b=await pool.connect();
 try{const r=await Promise.allSettled([insert(op,a),insert({...op,operation_id:uid()},b)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'23505');
 assert.equal((await pool.query('SELECT count(*)::int n FROM commercial_operations WHERE booking_id=$1',[op.booking_id])).rows[0].n,1);}finally{a.release();b.release();}
});
async function claim(op){
 const token=uid();await pool.query("UPDATE commercial_operations SET state='CLAIMED',version=version+1,attempt_no=1,claim_token=$2,claimed_at=NOW() WHERE operation_id=$1",[op.operation_id,token]);
 await pool.query("INSERT INTO commercial_operation_attempts(operation_id,attempt_no,claim_token,outcome) VALUES ($1,1,$2,'CLAIMED')",[op.operation_id,token]);
 return token;
}
test('conditional claim primitive has one concurrent winner',async()=>{
 const op=operation(await fixture());await insert(op);
 const sql="UPDATE commercial_operations SET state='CLAIMED',version=version+1,attempt_no=1,claim_token=$2,claimed_at=NOW() WHERE operation_id=$1 AND state='REQUESTED' RETURNING operation_id";
 const r=await Promise.all([pool.query(sql,[op.operation_id,uid()]),pool.query(sql,[op.operation_id,uid()])]);assert.equal(r.reduce((n,x)=>n+x.rowCount,0),1);
});
test('claim dispatch unknown persists across a new connection',async()=>{
 const op=operation(await fixture());await insert(op);await claim(op);
 await pool.query("UPDATE commercial_operations SET state='DISPATCHING',version=version+1 WHERE operation_id=$1",[op.operation_id]);
 await pool.query("UPDATE commercial_operations SET state='OUTCOME_UNKNOWN',claim_token=NULL,claimed_at=NULL,version=version+1 WHERE operation_id=$1",[op.operation_id]);
 const c=new Client({...config,database:names.upgrade});await c.connect();try{assert.equal((await c.query('SELECT state FROM commercial_operations WHERE operation_id=$1',[op.operation_id])).rows[0].state,'OUTCOME_UNKNOWN');}finally{await c.end();}
});
test('money immutable after insert',async()=>{const op=operation(await fixture(),'PAYMENT_CHARGE');await insert(op);await assert.rejects(pool.query('UPDATE commercial_operations SET amount_minor=2000,version=version+1 WHERE operation_id=$1',[op.operation_id]),e=>e.code==='23514');});
test('domain deletion cannot erase operation evidence',async()=>{const op=operation(await fixture());await insert(op);await assert.rejects(pool.query('DELETE FROM bookings WHERE id=$1',[op.booking_id]),e=>e.code==='23503');});
test('021 additive bridge can correlate synthetic operation',async()=>{
 const op=operation(await fixture());await insert(op);const family=digest();
 await pool.query("INSERT INTO reconciliation_cases(case_family_id,request_id,provider_fingerprint,payment_fingerprint,latest_case_id,version,category,priority,status,manual_review_required,compensation_required,first_observed_at,last_observed_at) VALUES($1,$2,$3,$4,$5,1,'fixture','LOW','AWAITING_EVIDENCE',false,false,NOW(),NOW())",[family,crypto.randomBytes(16).toString('hex'),digest(),digest(),digest()]);
 await pool.query('INSERT INTO commercial_operation_reconciliation_cases(operation_id,case_family_id) VALUES($1,$2)',[op.operation_id,family]);
 assert.equal((await pool.query('SELECT count(*)::int n FROM commercial_operation_reconciliation_cases WHERE operation_id=$1',[op.operation_id])).rows[0].n,1);
});
async function evidence(op,extra={}){
 const value={evidence_id:uid(),operation_id:op.operation_id,adapter_id:op.adapter_id,adapter_account_scope:op.adapter_account_scope,
  execution_environment:'synthetic',event_identity_digest:digest(),payload_digest:digest(),evidence_level:'SYNTHETIC',source_kind:'ADAPTER_EVENT',
  normalized_outcome:'SUCCEEDED',amount_minor:op.amount_minor,currency:op.currency,observed_at:new Date(),...extra};
 const keys=Object.keys(value);await pool.query(`INSERT INTO commercial_operation_evidence(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(value));return value;
}
test('event dedupe blocks same identity and changed payload',async()=>{
 const op=operation(await fixture());await insert(op);const e=await evidence(op);
 await assert.rejects(evidence(op,{event_identity_digest:e.event_identity_digest}),x=>x.code==='23505');
});
test('event identity cannot move to another operation',async()=>{
 const a=operation(await fixture()),b=operation(await fixture());await insert(a);await insert(b);const e=await evidence(a);
 await assert.rejects(evidence(b,{event_identity_digest:e.event_identity_digest}),x=>x.code==='23505');
});
test('synthetic evidence cannot acquire live level',async()=>{
 const op=operation(await fixture());await insert(op);await assert.rejects(evidence(op,{evidence_level:'LIVE_VERIFIED',verification_receipt_id:uid()}),x=>x.code==='23514');
});
test('evidence cannot be updated or deleted',async()=>{
 const op=operation(await fixture());await insert(op);const e=await evidence(op);
 await assert.rejects(pool.query('UPDATE commercial_operation_evidence SET payload_digest=$2 WHERE evidence_id=$1',[e.evidence_id,digest()]),x=>x.code==='23514');
 await assert.rejects(pool.query('DELETE FROM commercial_operation_evidence WHERE evidence_id=$1',[e.evidence_id]),x=>x.code==='23514');
});
async function dispatched(){
 const op=operation(await fixture(),'PAYMENT_CHARGE');await insert(op);await claim(op);
 await pool.query("UPDATE commercial_operations SET state='DISPATCHING',version=version+1 WHERE operation_id=$1",[op.operation_id]);
 await pool.query("UPDATE commercial_operation_attempts SET outcome='DISPATCHING',dispatch_authorized_at=NOW() WHERE operation_id=$1",[op.operation_id]);return op;
}
test('deferred result guard rejects mismatched money and rolls state back',async()=>{
 const op=await dispatched();const e=await evidence(op,{amount_minor:2000});
 await assert.rejects(pool.query("UPDATE commercial_operations SET state='SUCCEEDED',version=version+1,claim_token=NULL,claimed_at=NULL,completed_at=NOW(),result_evidence_id=$2 WHERE operation_id=$1",[op.operation_id,e.evidence_id]),x=>x.code==='23514');
 assert.equal((await pool.query('SELECT state FROM commercial_operations WHERE operation_id=$1',[op.operation_id])).rows[0].state,'DISPATCHING');
});
test('terminal result requires evidence from same operation',async()=>{
 const a=await dispatched(),b=await dispatched();const e=await evidence(b);
 await assert.rejects(pool.query("UPDATE commercial_operations SET state='SUCCEEDED',version=version+1,claim_token=NULL,claimed_at=NULL,completed_at=NOW(),result_evidence_id=$2 WHERE operation_id=$1",[a.operation_id,e.evidence_id]),x=>['23503','23514'].includes(x.code));
});
test('consistent committed result replays but cannot reverse terminal state',async()=>{
 const op=await dispatched();const e=await evidence(op);
 await pool.query("UPDATE commercial_operations SET state='SUCCEEDED',version=version+1,claim_token=NULL,claimed_at=NULL,completed_at=NOW(),result_evidence_id=$2 WHERE operation_id=$1",[op.operation_id,e.evidence_id]);
 await pool.query('UPDATE commercial_operations SET state=state WHERE operation_id=$1',[op.operation_id]);
 await assert.rejects(pool.query("UPDATE commercial_operations SET state='REQUESTED',version=version+1,completed_at=NULL,result_evidence_id=NULL WHERE operation_id=$1",[op.operation_id]),x=>x.code==='23514');
});
test('completed attempt outcome cannot be overwritten',async()=>{
 const op=await dispatched();await pool.query("UPDATE commercial_operation_attempts SET outcome='OUTCOME_UNKNOWN',finished_at=NOW() WHERE operation_id=$1",[op.operation_id]);
 await assert.rejects(pool.query("UPDATE commercial_operation_attempts SET outcome='SUCCEEDED' WHERE operation_id=$1",[op.operation_id]),x=>x.code==='23514');
});
test('second unfinished reconciliation claim rejected',async()=>{
 const op=operation(await fixture());await insert(op);
 const sql="INSERT INTO commercial_operation_reconciliation_attempts(reconciliation_id,operation_id,sequence_no,actor_kind,outcome) VALUES($1,$2,$3,'OPERATOR_REVIEW','IN_PROGRESS')";
 await pool.query(sql,[uid(),op.operation_id,1]);await assert.rejects(pool.query(sql,[uid(),op.operation_id,2]),x=>x.code==='23505');
});
