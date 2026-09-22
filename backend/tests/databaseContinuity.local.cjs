// Opt-in real local drill. Creates two fresh local databases; deliberately never drops a database.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const {Client,Pool} = require('pg');
const db = require('../scripts/lib/dbContinuity.cjs');
// PostgreSQL rewrites a varchar[] -> text[] cast into per-element casts on restore.
// Normalize exactly this equivalent representation, preserving every other definition token.
function normalizedDefinitions(value) {
  if (typeof value === 'string') return value.replace(/\(ARRAY\[([^\]]+)\]\)::text\[\]/g, (_match, items) =>
    `ARRAY[${items.split(', ').map(item=>`(${item})::text`).join(', ')}]`);
  if (Array.isArray(value)) return value.map(normalizedDefinitions);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizedDefinitions(item)]));
  return value;
}
async function drill() {
  if(process.env.DB_CONTINUITY_LOCAL_DRILL!=='CREATE_NEW_LOCAL_DATABASES')throw new db.ContinuityError('LOCAL_DRILL_OPT_IN_REQUIRED');
  const envFile=path.join(__dirname,'../.env');
  const env={...(fs.existsSync(envFile)?require('dotenv').parse(fs.readFileSync(envFile)):{}),...process.env};
  const config=require('../config/database').databaseConfig(env);
  let base;
  if(config.connectionString)base=new URL(config.connectionString);
  else {
    if(!config.user || !config.database)throw new db.ContinuityError('LOCAL_DATABASE_CONFIG_REQUIRED');
    base=new URL(`postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password||'')}@${config.host||'localhost'}:${config.port||5432}/${encodeURIComponent(config.database)}`);
  }
  const conn=db.connection({...env,DATABASE_URL:base.toString(),DB_SSL_MODE:config.ssl===false?'disable':'verify-full'});
  if(!conn.local)throw new db.ContinuityError('LOCAL_DATABASE_REQUIRED');
  for(const name of ['http','https'])for(const method of ['request','get'])require(name)[method]=()=>{throw new db.ContinuityError('NO_EXTERNAL_NETWORK');};
  globalThis.fetch=async()=>{throw new db.ContinuityError('NO_EXTERNAL_NETWORK');};
  const suffix=crypto.randomBytes(5).toString('hex');
  const sourceName=`asedeliya_3y_source_${suffix}`,targetName=`asedeliya_3y_target_${suffix}`;
  const sourceUrl=new URL(base);sourceUrl.pathname='/'+sourceName;
  const targetUrl=new URL(base);targetUrl.pathname='/'+targetName;
  const localEnv={...env,DATABASE_URL:sourceUrl.toString(),DB_SSL_MODE:conn.sslMode,RESTORE_DATABASE_URL:targetUrl.toString(),
    RESTORE_DB_SSL_MODE:conn.sslMode,RESTORE_CONFIRM_DATABASE:targetName,DB_DUMP_DIR:path.join(db.root,'backend/backups/postgres')};
  db.restoreGuard(localEnv,true);
  for (const name of ['pg_dump','pg_restore']) db.runTool(name,['--version'],{env:localEnv});
  const provision = new Client(config);
  try {
    await provision.connect();
    for(const name of [sourceName,targetName]) {
      assert.match(name,/^asedeliya_3y_(source|target)_[a-f0-9]{10}$/);
      await provision.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    }
  } finally {await provision.end();}
  const sourceConfig=require('../config/database').databaseConfig({DATABASE_URL:sourceUrl.toString(),DB_SSL_MODE:conn.sslMode});
  const {migrate}=require('../scripts/migrate');
  await migrate(new Pool(sourceConfig));
  // Two independent connections run the existing advisory-locked runner concurrently; both skip applied migrations.
  await Promise.all([migrate(new Pool(sourceConfig)),migrate(new Pool(sourceConfig))]);
  const sourceConn=db.connection(localEnv);
  await db.withClient(sourceConn,async client=>{
    // Synthetic rows only; no application/provider/payment APIs. Nothing printed or committed to git.
    const user=(await client.query("INSERT INTO users(full_name,email,password,preferred_language,email_notifications,booking_reminders) VALUES ($1,$2,$3,'kk',false,true) RETURNING id",['offline fixture',`fixture-${suffix}@example.invalid`,crypto.randomBytes(32).toString('hex')])).rows[0].id;
    await client.query("INSERT INTO favorites(user_id,provider,provider_hotel_id,hotel_data) VALUES ($1,'hotelbeds','3y-fixture',$2)",[user,JSON.stringify({name:'Offline fixture',price:123.45,currency:'EUR'})]);
    const booking=(await client.query("INSERT INTO bookings(user_id,first_name,last_name,phone,email,provider,total_amount,offer_snapshot) VALUES ($1,'Fixture','Only','not-a-phone',$2,'fixture',123.45,'{}') RETURNING id",[user,`fixture-${suffix}@example.invalid`])).rows[0].id;
    const payment=(await client.query("INSERT INTO payments(booking_id,amount,status) VALUES ($1,0,'pending') RETURNING id",[booking])).rows[0].id;
    await client.query("INSERT INTO refund_requests(booking_id,payment_id,user_id,status) VALUES ($1,$2,$3,'draft')",[booking,payment,user]);
    await client.query("INSERT INTO notification_outbox(user_id,booking_id,event_type,recipient,subject) VALUES ($1,$2,'fixture',$3,'Fixture')",[user,booking,`fixture-${suffix}@example.invalid`]);
    await client.query("INSERT INTO provider_hotels(provider,provider_hotel_id,name,content_environment) VALUES ('hotelbeds','3y-fixture','Offline catalog fixture','test')");
    await client.query("INSERT INTO provider_destinations(provider,code,country_code,content_environment) VALUES ('hotelbeds','FIX','XX','test')");
    await client.query("INSERT INTO provider_job_state(job,environment,details) VALUES ('offline-fixture','test','{}')");
  });
  const before=await db.inspect({env:localEnv});assert.equal(db.validate(before).valid,true);
  const archive=db.backup({env:localEnv,log:value=>console.log(JSON.stringify(value))});
  const verification=db.verify(archive.file,{env:localEnv});
  await db.restore(archive.file,{env:localEnv,apply:true,log:value=>console.log(JSON.stringify(value))});
  const after=await db.inspect({env:localEnv,target:true});const validation=db.validate(after);assert.equal(validation.valid,true,JSON.stringify(validation));
  const counts=async conn=>db.withClient(conn,async client=>{
    const values={};for(const table of db.migrationInventory().tables)values[table]=(await client.query(`SELECT count(*)::text AS n FROM public."${table}"`)).rows[0].n;
    return values;
  });
  const sourceCounts=await counts(sourceConn),targetCounts=await counts(db.connection(localEnv,true));
  assert.deepEqual(targetCounts,sourceCounts);
  // Compare complete restored column/default, constraint and index definitions, without printing them or row contents.
  const shape=async conn=>db.withClient(conn,async client=>({
    columns:(await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows,
    constraints:(await client.query("SELECT t.relname,c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname")).rows,
    indexes:(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows,
  }));
  assert.deepEqual(normalizedDefinitions(await shape(db.connection(localEnv,true))),normalizedDefinitions(await shape(sourceConn)));
  // Compare protected synthetic row values inside the process, output no values/PII.
  await db.withClient(sourceConn,async source=>db.withClient(db.connection(localEnv,true),async target=>{
    for(const table of ['users','favorites','bookings','payments','refund_requests','notification_outbox','provider_hotels','provider_destinations','provider_job_state']) {
      const sql=`SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY to_jsonb(t)::text`;
      assert.deepEqual((await target.query(sql)).rows,(await source.query(sql)).rows);
    }
  }));
  await assert.rejects(()=>db.restore(archive.file,{env:localEnv,apply:true}),error=>error.code==='TARGET_NOT_EMPTY');
  const result={status:'RESTORE_VERIFIED',scope:'LOCAL_SYNTHETIC_ONLY',sourceDatabase:sourceName,targetDatabase:targetName,serverVersionNumber:after.info.version,
    archive:path.basename(archive.file),archiveSizeBytes:archive.sizeBytes,archiveListing:verification.status,schemaValidation:validation,
    exactRowCountsEqual:true,columnsConstraintsIndexesEquivalent:true,syntheticValuesEqual:true,tableCounts:targetCounts,
    realHotelbeds:{status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0},paymentCalls:0,
    databaseCleanup:'Not performed. Two new local fixture databases retained; no DROP DATABASE executed.'};
  fs.writeFileSync(path.join(db.root,'backend/backups',`3y-drill-${suffix}.json`),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result));
}
if(require.main===module) {
  if(process.env.DB_CONTINUITY_LOCAL_DRILL!=='CREATE_NEW_LOCAL_DATABASES') {
    console.log(JSON.stringify({status:'SKIP',code:'LOCAL_DRILL_OPT_IN_REQUIRED',restoreVerified:false}));
  } else drill().catch(error=>{
    console.log(JSON.stringify({...db.safeError(error),status:'BLOCKED',restoreVerified:false}));
    process.exitCode=1;
  });
}
module.exports={drill};
