const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../scripts/lib/dbContinuity.cjs');
const inventory = db.migrationInventory();
const sourceEnv = {DATABASE_URL:'postgresql://owner:OFFLINE_PRIVATE_PASSWORD@127.0.0.1:5432/fixture_source',DB_SSL_MODE:'disable'};
const targetEnv = {...sourceEnv,RESTORE_DATABASE_URL:'postgresql://owner:TARGET_PRIVATE_PASSWORD@localhost:5432/fixture_target',RESTORE_DB_SSL_MODE:'disable',RESTORE_CONFIRM_DATABASE:'fixture_target'};
const code = value => error => error.code === value;
function listing() {
  const entries=[];
  for(const table of inventory.tables)for(const kind of ['TABLE','TABLE DATA'])entries.push(`${kind} public ${table} owner`);
  for(const {table,column} of inventory.serials)for(const kind of ['SEQUENCE','SEQUENCE SET'])entries.push(`${kind} public ${table}_${column}_seq owner`);
  for(const {table} of inventory.primary)entries.push(`CONSTRAINT public ${table} ${table}_pkey owner`);
  for(const {table,column} of inventory.foreignKeys)entries.push(`FK CONSTRAINT public ${table} ${table}_${column}_fkey owner`);
  for(const {table,columns} of inventory.unique)entries.push(`CONSTRAINT public ${table} ${table}_${columns.join('_')}_key owner`);
  for(const {name} of inventory.indexes)entries.push(`INDEX public ${name} owner`);
  return entries.map((entry,i)=>`${i+1}; 1259 100 ${entry}`).join('\n');
}
const listRun = () => ({status:0,stdout:listing()});
function healthyState() {
  return {expected:inventory,info:{database:'fixture_target',schema:'public',version:'180004',size:'12345'},known:new Set(inventory.tables),
    tables:inventory.tables.map(name=>({name,rows:'0'})),names:inventory.tables,migrationRows:inventory.migrations,lastBackup:null,
    constraints:[...inventory.primary.map(i=>({table_name:i.table,type:'p',validated:true,columns:i.columns})),...inventory.unique.map(i=>({table_name:i.table,type:'u',validated:true,columns:i.columns})),...inventory.foreignKeys.map(i=>({table_name:i.table,type:'f',validated:true,columns:[i.column],parent:i.parent,parent_schema:'public',parent_columns:[i.parentColumn]}))],
    indexes:inventory.indexes.map(i=>({...i,table_name:i.table,valid:true})),serials:inventory.serials.map(i=>({...i,ok:true}))};
}

test('3Y focused offline guards/command construction/privacy (no network)',async t=>{
  let network=0;
  for(const [module,methods] of [['http',['request','get']],['https',['request','get']],['net',['connect','createConnection']],['tls',['connect']]])for(const method of methods)t.mock.method(require(module),method,()=>{network++;throw Error('OFFLINE_NETWORK_FORBIDDEN');});
  t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('OFFLINE_FETCH_FORBIDDEN');});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-3y-unit-'));
  const archive=path.join(dir,db.dumpName(new Date('2026-09-20')));fs.writeFileSync(archive,'PGDMP-fixture-not-a-real-archive');
  const manifestPath=archive+'.manifest.json';
  const fixtureManifest=db.makeManifest(archive,db.connection(sourceEnv),new Date('2026-09-20'),'18.4',sourceEnv);
  fs.writeFileSync(manifestPath,JSON.stringify(fixtureManifest));
  await t.test('manual-only entrypoints and deterministic complete repo inventory',()=>{
    assert.deepEqual(db.migrationInventory(),inventory);
    assert.equal(inventory.tables.length,23);assert.equal(inventory.migrations.length,20);assert.equal(inventory.indexes.length,72);
    assert.equal(inventory.foreignKeys.length,16);assert.equal(inventory.serials.length,19);
    assert.equal(inventory.migrations.at(-1),'020_catalog_environment_identity.sql');
    assert.ok(inventory.tables.includes('_migrations'));
    for(const file of ['dbBackup.cjs','dbBackupVerify.cjs','dbRestore.cjs','dbInventory.cjs','dbSchemaCheck.cjs'])assert.match(fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8'),/require.main === module/);
    const source=fs.readFileSync(path.join(__dirname,'../scripts/lib/dbContinuity.cjs'),'utf8');
    assert.doesNotMatch(source,/require\(['"].*(?:hotelbeds|payment|databaseBackupService|\.\.\/db['"])/i);
    assert.doesNotMatch(source,/DROP DATABASE|TRUNCATE|--clean|--create|--disable-triggers/);
    assert.match(fs.readFileSync(path.join(__dirname,'../../.gitignore'),'utf8'),/backend\/backups\//);
  });
  await t.test('strict source URL and TLS; no alternate libpq connection overrides',()=>{
    assert.throws(()=>db.connection({}),code('DATABASE_URL_REQUIRED'));
    for(const value of ['postgresql://u:p@localhost/db?host=remote','postgresql://u:p@localhost/db?sslmode=disable','postgresql://u:p@localhost/db#x','https://u:p@localhost/db','postgresql://u:p@localhost/db%3Dremote'])assert.throws(()=>db.connection({DATABASE_URL:value}),code('INVALID_DATABASE_URL'));
    assert.throws(()=>db.connection({DATABASE_URL:'postgresql://u:p@remote.example/db',DB_SSL_MODE:'disable'}),code('VERIFIED_TLS_REQUIRED'));
    const clean=db.toolEnv({...sourceEnv,PGHOSTADDR:'remote',PGOPTIONS:'-c role=other',PGSERVICE:'other',HOTELBEDS_API_KEY:'HIDDEN'},db.connection(sourceEnv));
    assert.equal(clean.PGHOST,'127.0.0.1');assert.equal(clean.PGSSLMODE,'disable');assert.equal(clean.DATABASE_URL,undefined);assert.equal(clean.PGHOSTADDR,undefined);assert.equal(clean.PGOPTIONS,undefined);assert.equal(clean.HOTELBEDS_API_KEY,undefined);
  });
  await t.test('timestamp safe, binary stdout not logged, credentials never in argv/errors; no overwrite',()=>{
    assert.equal(db.dumpName(new Date('2026-09-21T10:11:12.123Z')),'asedeliya-20260921T101112123Z.dump');
    assert.throws(()=>db.dumpName(new Date('bad')),code('INVALID_TIMESTAMP'));
    assert.throws(()=>db.backup({env:{...sourceEnv,DB_DUMP_DIR:db.root},run:()=>({status:0})}),code('BACKUP_DIRECTORY_NOT_IGNORED'));
    const logs=[],calls=[];const env={...sourceEnv,DB_DUMP_DIR:dir};const now=new Date('2026-09-21T10:11:12.123Z');
    const run=(binary,args,options)=>{
      calls.push({binary,args,options});assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
      assert.doesNotMatch(args.join(' '),/postgresql:|OFFLINE_PRIVATE_PASSWORD/);
      assert.ok(!args.includes('owner'));
      if(args.includes('--list'))return listRun();
      if(!args.includes('--version'))fs.writeSync(options.stdio[1],Buffer.from('PGDMP-local-stub'));
      return {status:0,stdout:'',stderr:'PRIVATE_DB_ERROR'};
    };
    const result=db.backup({env,now,run,log:value=>logs.push(value)});
    assert.equal(result.sizeBytes,16);assert.match(calls[2].args.join(' '),/-Fc/);
    assert.doesNotMatch(calls[2].args.join(' '),/schema-only|data-only|--table|--exclude|--schema/);
    assert.equal(calls[2].options.env.PGPASSWORD,'OFFLINE_PRIVATE_PASSWORD');
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|postgres|owner/);
    const before=fs.readFileSync(result.file);assert.throws(()=>db.backup({env,now,run}),code('BACKUP_ALREADY_EXISTS'));assert.deepEqual(fs.readFileSync(result.file),before);
    fs.writeFileSync(path.join(dir,db.dumpName(new Date('2026-09-22')))+'.partial','reserved');
    assert.throws(()=>db.backup({env,now:new Date('2026-09-22'),run}),code('BACKUP_ALREADY_EXISTS'));
  });
  await t.test('missing binaries and failed dump produce safe nonzero CLI results',async()=>{
    const output=[];
    assert.equal(await db.cli(async()=>db.backup({env:{...sourceEnv,DB_DUMP_DIR:dir},run:()=>({error:{code:'ENOENT',message:sourceEnv.DATABASE_URL}})}),s=>output.push(s)),1);
    assert.match(output.join(''),/PG_DUMP_MISSING/);assert.match(output.join(''),/Install PostgreSQL client tools manually/);assert.doesNotMatch(output.join(''),/OFFLINE_PRIVATE|postgresql:\/\//);
    assert.equal(await db.cli(async()=>{throw Error(sourceEnv.DATABASE_URL);},s=>output.push(s)),1);
    assert.doesNotMatch(output.join(''),/OFFLINE_PRIVATE|postgresql:\/\//);
    assert.throws(()=>db.backup({env:{...sourceEnv,DB_DUMP_DIR:dir},now:new Date('2026-09-23'),run:(_b,args)=>({status:args.includes('--version')?0:1,stderr:'PRIVATE'})}),code('PG_DUMP_FAILED'));
    assert.equal(fs.existsSync(path.join(dir,db.dumpName(new Date('2026-09-23')))),false);
  });
  await t.test('verify rejects missing/empty/plain/truncated/partial schema archives, no database environment',()=>{
    assert.throws(()=>db.verify(path.join(dir,'missing'),{run:listRun}),code('ARCHIVE_NOT_FOUND'));
    const empty=path.join(dir,'empty');fs.writeFileSync(empty,'');assert.throws(()=>db.verify(empty,{run:listRun}),code('EMPTY_ARCHIVE'));
    fs.writeFileSync(empty,'SELECT secret');assert.throws(()=>db.verify(empty,{run:listRun}),code('INVALID_CUSTOM_ARCHIVE'));
    assert.throws(()=>db.verify(archive,{run:()=>({status:1,stderr:'PRIVATE'})}),code('PG_RESTORE_FAILED'));
    assert.throws(()=>db.verify(archive,{run:()=>({error:{code:'ENOENT'}})}),code('PG_RESTORE_MISSING'));
    const result=db.verify(archive,{env:sourceEnv,run:(_binary,args,options)=>{
      assert.deepEqual(args.slice(0,2),['--format=custom','--list']);assert.equal(options.env.PGHOST,undefined);assert.equal(options.env.PGPASSWORD,undefined);return listRun();
    }});assert.equal(result.dataBlocksRestored,false);
    for(const omitted of ['TABLE DATA public users ','SEQUENCE SET public users_id_seq ','INDEX public idx_users_email_lower ','FK CONSTRAINT public bookings bookings_user_id_fkey '])assert.throws(()=>db.verify(archive,{run:()=>({status:0,stdout:listing().split('\n').filter(line=>!line.includes(omitted)).join('\n')})}),code('ARCHIVE_OBJECTS_MISSING'));
  });
  await t.test('restore refuses missing/identical/remote targets before tools or network',async()=>{
    assert.throws(()=>db.restoreGuard(sourceEnv,true),code('RESTORE_URL_REQUIRED'));
    assert.throws(()=>db.restoreGuard(targetEnv,false),code('RESTORE_CONFIRM_REQUIRED'));
    assert.throws(()=>db.restoreGuard({...targetEnv,RESTORE_CONFIRM_DATABASE:'other'},true),code('RESTORE_CONFIRM_REQUIRED'));
    assert.throws(()=>db.restoreGuard({...targetEnv,RESTORE_DATABASE_URL:sourceEnv.DATABASE_URL,RESTORE_CONFIRM_DATABASE:'fixture_source'},true),code('SOURCE_EQUALS_TARGET'));
    for(const host of ['dpg-fixture.render.com','dpg-fixture-a','192.168.1.2']) {
      const env={...targetEnv,RESTORE_DATABASE_URL:`postgresql://owner:secret@${host}/fixture_target`,RESTORE_DB_SSL_MODE:'verify-full'};
      assert.throws(()=>db.restoreGuard(env,true),code('REMOTE_ACK_REQUIRED'));
      assert.equal(db.restoreGuard({...env,RESTORE_ALLOW_REMOTE:'I_ACKNOWLEDGE_NEW_EMPTY_TARGET'},true).local,false);
      await assert.rejects(()=>db.restore(archive,{env,apply:true,run:()=>assert.fail('must not spawn'),factory:()=>assert.fail('must not connect')}),code('REMOTE_ACK_REQUIRED'));
    }
  });
  await t.test('manifest checksum, strict metadata, source redaction and corruption detection',()=>{
    const manifest=db.readManifest(archive);
    assert.equal(manifest.sha256,require('crypto').createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
    assert.equal(manifest.createdAt,'2026-09-20T00:00:00.000Z');
    assert.equal(manifest.sourceMigrationLedger,'not-read');
    assert.doesNotMatch(JSON.stringify(manifest),/PRIVATE|postgresql:\/\/|owner|127\.0\.0\.1|fixture_source/);
    const content=fs.readFileSync(archive);
    fs.appendFileSync(archive,'corruption');
    assert.throws(()=>db.verify(archive,{run:listRun}),code('CHECKSUM_MISMATCH'));
    fs.writeFileSync(archive,content);
    for(const patch of [{dumpFilename:'../escape.dump'},{createdAt:'local time'},{sha256:'bad'},{password:'FORBIDDEN'},{sourceIdentitySha256:null}]) {
      fs.writeFileSync(manifestPath,JSON.stringify({...manifest,...patch}));
      assert.throws(()=>db.verify(archive,{run:listRun}),code('INVALID_MANIFEST'));
    }
    fs.writeFileSync(manifestPath,'{');assert.throws(()=>db.verify(archive,{run:listRun}),code('INVALID_MANIFEST'));
    fs.writeFileSync(manifestPath,JSON.stringify(manifest));
    assert.equal(db.verify(archive,{run:listRun}).status,'BACKUP_VERIFIED');
  });
  await t.test('production/live signals cannot be overridden by remote acknowledgement',()=>{
    const acknowledged={...targetEnv,RESTORE_ALLOW_REMOTE:'I_ACKNOWLEDGE_NEW_EMPTY_TARGET'};
    for(const patch of [{NODE_ENV:'production'},{APP_ENV:'prod'},{HOTELBEDS_ENV:'LIVE'},{REAL_CHARGES_ENABLED:'true'},
      {RESTORE_DATABASE_URL:'postgresql://owner:fake@production.example/fixture_target',RESTORE_DB_SSL_MODE:'verify-full'},
      {RESTORE_DATABASE_URL:'postgresql://owner:fake@localhost/app_live',RESTORE_CONFIRM_DATABASE:'app_live'}])
      assert.throws(()=>db.restoreGuard({...acknowledged,...patch},true),code('PRODUCTION_RESTORE_BLOCKED'));
    assert.equal(db.restoreGuard(targetEnv,true).database,'fixture_target');
  });
  await t.test('source identity in manifest blocks restore even without source URL in shell',async()=>{
    const env={...targetEnv,DATABASE_URL:undefined,RESTORE_DATABASE_URL:sourceEnv.DATABASE_URL,RESTORE_CONFIRM_DATABASE:'fixture_source'};
    await assert.rejects(()=>db.restore(archive,{env,apply:true,run:listRun,factory:()=>assert.fail('must not connect')}),code('SOURCE_EQUALS_TARGET'));
  });
  await t.test('path traversal rejected before filesystem access or subprocess',()=>{
    for(const value of ['../escape.dump','safe/../escape.dump','safe\\..\\escape.dump']) {
      assert.throws(()=>db.verify(value,{run:()=>assert.fail('must not spawn')}),code('UNSAFE_ARCHIVE_PATH'));
      assert.throws(()=>db.backup({env:{...sourceEnv,DB_DUMP_DIR:value},run:listRun}),code('UNSAFE_ARCHIVE_PATH'));
    }
  });
  await t.test('automatic verification failure never reports verified backup; manifest no overwrite',()=>{
    const logs=[],now=new Date('2026-09-24'),env={...sourceEnv,DB_DUMP_DIR:dir};
    assert.throws(()=>db.backup({env,now,log:v=>logs.push(v),run:(_b,args,options)=>{
      if(args.includes('--version'))return {status:0};
      if(args.includes('--list'))return {status:1};
      fs.writeSync(options.stdio[1],'PGDMP-unreadable');return {status:0};
    }}),code('PG_RESTORE_FAILED'));
    assert.ok(!logs.some(v=>v.status==='BACKUP_VERIFIED'));
    assert.equal(fs.existsSync(path.join(dir,db.dumpName(now))),false);
    const collision=new Date('2026-09-25');
    fs.writeFileSync(path.join(dir,db.dumpName(collision))+'.manifest.json','reserved');
    assert.throws(()=>db.backup({env,now:collision,run:listRun}),code('BACKUP_ALREADY_EXISTS'));
  });
  await t.test('missing restore client and zero-byte dump cannot create verified artifact',()=>{
    const env={...sourceEnv,DB_DUMP_DIR:dir},now=new Date('2026-09-26');
    assert.throws(()=>db.backup({env,now,run:(binary)=>String(binary).includes('pg_restore') ? {error:{code:'ENOENT',message:sourceEnv.DATABASE_URL}} : {status:0}}),code('PG_RESTORE_MISSING'));
    assert.equal(fs.existsSync(path.join(dir,db.dumpName(now))+'.partial'),false);
    assert.throws(()=>db.backup({env,now,run:()=>({status:0})}),code('EMPTY_ARCHIVE'));
    assert.equal(fs.existsSync(path.join(dir,db.dumpName(now))+'.manifest.json'),false);
  });
  await t.test('same-size corruption fails checksum and symlink ancestors are refused',()=>{
    const content=fs.readFileSync(archive),changed=Buffer.from(content);changed[changed.length-1]^=1;
    fs.writeFileSync(archive,changed);assert.throws(()=>db.verify(archive,{run:listRun}),code('CHECKSUM_MISMATCH'));
    fs.writeFileSync(archive,content);
    const lstat=fs.lstatSync;
    const mock=t.mock.method(fs,'lstatSync',value=>path.resolve(value)===path.resolve(dir) ? {isSymbolicLink:()=>true} : lstat(value));
    try { assert.throws(()=>db.safePath(archive),code('UNSAFE_ARCHIVE_PATH')); }
    finally { mock.mock.restore(); }
  });
  await t.test('restore empty guard, atomic pg_restore flags, and errors propagate',async()=>{
    let occupied='1',ended=0;const statements=[];
    const factory=()=>({connect:async()=>{},end:async()=>{ended++;},query:async sql=>{statements.push(sql);return {rows:[{occupied}]};}});
    await assert.rejects(()=>db.restore(archive,{env:targetEnv,apply:true,run:listRun,factory}),code('TARGET_NOT_EMPTY'));
    occupied='0';let actualArgs;
    await db.restore(archive,{env:targetEnv,apply:true,factory,run:(_b,args,options)=>{
      if(args.includes('--list'))return listRun();actualArgs=args;
      assert.equal(options.env.PGDATABASE,'fixture_target');assert.equal(options.env.PGPASSWORD,'TARGET_PRIVATE_PASSWORD');assert.doesNotMatch(args.join(' '),/PRIVATE|postgresql:/);return {status:0};
    }});
    for(const flag of ['--single-transaction','--exit-on-error','--no-owner','--no-acl','--no-tablespaces'])assert.ok(actualArgs.includes(flag));
    assert.doesNotMatch(actualArgs.join(' '),/--clean|--create|--disable-triggers/);
    await assert.rejects(()=>db.restore(archive,{env:targetEnv,apply:true,factory,run:(_b,args)=>args.includes('--list')?listRun():{status:1,stderr:'PRIVATE'}}),code('PG_RESTORE_FAILED'));
    assert.equal(ended,3);assert.ok(statements.every(sql=>sql.startsWith('SELECT')));
  });
  await t.test('diagnostics allowlist excludes raw records, arbitrary migration names and legacy metadata',()=>{
    const state=healthyState();state.tables.push({name:'private@example.test',rows:'PRIVATE_NAME'});state.migrationRows=[...inventory.migrations,'PRIVATE_EMAIL'];state.lastBackup=new Date('2026-09-21');
    state.rawRecords=[{email:'PRIVATE_EMAIL',password:'PRIVATE_PASSWORD'}];state.artifact_name='PRIVATE_ARTIFACT';
    const output=db.diagnostic(state),text=JSON.stringify(output);
    assert.equal(output.reachable,true);assert.equal(output.migrations.unknownCount,1);assert.match(output.backupEvidence,/does not prove/);
    assert.equal(output.lastSuccessfulLegacyBackupRecordedAt,'2026-09-21T00:00:00.000Z');
    assert.doesNotMatch(text,/PRIVATE|@|postgresql:|password|rawRecords/);
  });
  await t.test('schema validator detects lost PK/FK/unique/index/sequence/migration metadata',()=>{
    assert.equal(db.validate(healthyState()).valid,true);
    for(const patch of [{names:[]},{constraints:[]},{indexes:[]},{serials:[]},{migrationRows:[]}])assert.equal(db.validate({...healthyState(),...patch}).valid,false);
    const state=healthyState();state.indexes=state.indexes.map(i=>i.name==='provider_hotels_environment_identity'?{...i,unique:false}:i);assert.equal(db.validate(state).valid,false);
    const fk=healthyState();fk.constraints=fk.constraints.map(c=>c.type==='f'?{...c,parent_schema:'wrong'}:c);assert.equal(db.validate(fk).valid,false);
  });
  await t.test('exact-count diagnostics bounded to 100 MiB and read-only rollback on refusal',async()=>{
    const queries=[];
    await assert.rejects(()=>db.readState({query:async sql=>{
      queries.push(sql);
      if(sql.includes('current_database() AS database'))return {rows:[{database:'fixture',schema:'public',version:'180004',size:'104857601'}]};
      return {rows:[]};
    }},{exactCounts:true}),code('EXACT_COUNT_SIZE_LIMIT'));
    assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(queries.at(-1),'ROLLBACK');
    assert.ok(!queries.some(sql=>sql.includes('count(*)')));
    const state=healthyState();state.exactRows=[{name:'users',rows:'1'},{name:'PRIVATE_TABLE',rows:'PRIVATE_ROW'}];
    assert.deepEqual(db.diagnostic(state).exactRows,{users:'1'});
  });
  await t.test('source backup require is exact opt-in only; shared and restore policies stay strict',async()=>{
    const remote={DATABASE_URL:'postgresql://fixture_owner:PRIVATE_PASSWORD@external.example.invalid/fixture_source',DB_DUMP_DIR:dir};
    const ack='I_ACKNOWLEDGE_ENCRYPTED_WITHOUT_CERTIFICATE_IDENTITY_VERIFICATION';
    assert.equal(db.connection(remote).sslMode,'verify-full');
    for(const mode of ['disable','allow','prefer'])assert.throws(()=>db.backup({env:{...remote,DB_SSL_MODE:mode,DB_ALLOW_TLS_REQUIRE:ack},run:()=>assert.fail('must not spawn')}),code('VERIFIED_TLS_REQUIRED'));
    for(const acknowledgement of [undefined,'true','1','yes',ack+' ']) {
      const output=[];
      assert.equal(await db.cli(async()=>db.backup({env:{...remote,DB_SSL_MODE:'require',DB_ALLOW_TLS_REQUIRE:acknowledgement},run:()=>assert.fail('must not spawn')}),v=>output.push(v)),1);
      assert.equal(JSON.parse(output[0]).status,'BLOCKED');
      assert.doesNotMatch(output.join(''),/PRIVATE|external\.example|fixture_owner|postgresql:/);
    }
    const allowed={...remote,DB_SSL_MODE:'require',DB_ALLOW_TLS_REQUIRE:ack};
    assert.throws(()=>db.connection(allowed),code('VERIFIED_TLS_REQUIRED'));
    await assert.rejects(()=>db.inspect({env:allowed,factory:()=>assert.fail('must not connect')}),code('VERIFIED_TLS_REQUIRED'));
    const restoreEnv={...targetEnv,RESTORE_DATABASE_URL:'postgresql://u:p@target.example.invalid/fixture_target',RESTORE_DB_SSL_MODE:'require',DB_ALLOW_TLS_REQUIRE:ack,RESTORE_ALLOW_REMOTE:'I_ACKNOWLEDGE_NEW_EMPTY_TARGET'};
    assert.throws(()=>db.restoreGuard(restoreEnv,true),code('VERIFIED_TLS_REQUIRED'));
    assert.equal(db.restoreGuard({...restoreEnv,RESTORE_DB_SSL_MODE:'verify-full'},true).sslMode,'verify-full');
    assert.equal(db.connection(sourceEnv).sslMode,'disable');
    for(const [index,env,expectedMode] of [[0,remote,'verify-full'],[1,allowed,'require']]) {
      const logs=[];let dumpCalls=0;
      const result=db.backup({env,now:new Date(Date.UTC(2026,9,1+index)),log:v=>logs.push(v),run:(_binary,args,options)=>{
        if(args.includes('-Fc')) {
          dumpCalls++;assert.equal(options.env.PGSSLMODE,expectedMode);assert.equal(options.shell,false);
          assert.doesNotMatch(args.join(' '),/PRIVATE|external\.example|fixture_owner|postgresql:/);
          fs.writeSync(options.stdio[1],'PGDMP-stub');return {status:0};
        }
        assert.equal(options.env.PGSSLMODE,undefined);
        return args.includes('--list')?listRun():{status:0,stdout:'pg_dump (PostgreSQL) 18.4'};
      }});
      assert.equal(dumpCalls,1);
      assert.equal(db.readManifest(result.file).sourceTlsMode,expectedMode);
      assert.doesNotMatch(JSON.stringify(logs)+fs.readFileSync(result.file+'.manifest.json','utf8'),/PRIVATE|external\.example|fixture_owner|postgresql:/);
    }
  });
  await t.test('manifest v2 validates TLS enum while legacy v1 remains readable without inventing TLS metadata',()=>{
    assert.equal(fixtureManifest.version,2);assert.equal(fixtureManifest.sourceTlsMode,'disable');
    const legacy={...fixtureManifest,version:1,toolVersion:'3Y.1'};delete legacy.sourceTlsMode;
    fs.writeFileSync(manifestPath,JSON.stringify(legacy));
    assert.equal(db.verify(archive,{run:listRun}).status,'BACKUP_VERIFIED');
    assert.equal(db.readManifest(archive).sourceTlsMode,undefined);
    for(const patch of [{sourceTlsMode:'prefer'},{sourceTlsMode:'PRIVATE_URL'},{version:3},{toolVersion:'3Y.1'}]) {
      fs.writeFileSync(manifestPath,JSON.stringify({...fixtureManifest,...patch}));
      assert.throws(()=>db.readManifest(archive),code('INVALID_MANIFEST'));
    }
    fs.writeFileSync(manifestPath,JSON.stringify(fixtureManifest));
  });
  assert.equal(network,0);
  t.diagnostic('3Y unit scope: no imports/calls to provider/payment clients; HTTP/TLS/TCP/fetch=0. Stub archive is NOT a real verified backup.');
  // Only files created inside this exact isolated temp directory are removed; no database deletion.
  const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(resolved).startsWith('asedeliya-3y-unit-'));
  fs.rmSync(resolved,{recursive:true});
});
