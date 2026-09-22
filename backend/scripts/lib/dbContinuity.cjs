// Owner-run PostgreSQL continuity tools. No dotenv, app pool, scheduler or provider imports.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { databaseConfig } = require('../../config/database');
const root = path.resolve(__dirname, '../../..');
class ContinuityError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ContinuityError(code); };
const messages = {
  PG_DUMP_MISSING:'pg_dump not found. Install PostgreSQL client tools manually and set PG_BIN_DIR or PATH; nothing was installed.',
  PG_RESTORE_MISSING:'pg_restore not found. Install PostgreSQL client tools manually and set PG_BIN_DIR or PATH; nothing was installed.',
  RESTORE_URL_REQUIRED:'RESTORE_DATABASE_URL is required; DATABASE_URL is never a restore default.',
  RESTORE_CONFIRM_REQUIRED:'Use --apply and RESTORE_CONFIRM_DATABASE matching the new empty target database.',
  REMOTE_ACK_REQUIRED:'Remote restore refused. Owner must explicitly set RESTORE_ALLOW_REMOTE=I_ACKNOWLEDGE_NEW_EMPTY_TARGET.',
  TARGET_NOT_EMPTY:'Restore refused: target contains user objects or other connected sessions. Use an isolated empty database.',
  SOURCE_EQUALS_TARGET:'Restore refused: source and target identify the same database.',
  PRODUCTION_RESTORE_BLOCKED:'Restore blocked in production/LIVE environments or for production/LIVE-like targets. Use an isolated test/staging operator environment.',
  ARCHIVE_OBJECTS_MISSING:'Archive lacks expected migration tables/data/indexes/constraints/sequences. Use the matching source release; do not restore automatically.',
};
function safeError(error) {
  const code = error instanceof ContinuityError ? error.code : 'DATABASE_CONTINUITY_FAILED';
  return { status:/RESTORE|SOURCE_EQUALS_TARGET|REMOTE_ACK|TARGET_NOT_EMPTY/.test(code) ? 'BLOCKED' : 'failed', code, ...(messages[code] ? { message:messages[code] } : {}) };
}
function connection(env, target = false) {
  const raw = target ? env.RESTORE_DATABASE_URL : env.DATABASE_URL;
  if (!raw) fail(target ? 'RESTORE_URL_REQUIRED' : 'DATABASE_URL_REQUIRED');
  let url, user, password, database;
  try {
    url = new URL(raw); user = decodeURIComponent(url.username); password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch { fail('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.search || url.hash || !user ||
      !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(database) || /[\p{Cc}\p{Cf}]/u.test(user + password)) fail('INVALID_DATABASE_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local = ['localhost','127.0.0.1','::1'].includes(host);
  const sslMode = (target ? env.RESTORE_DB_SSL_MODE : env.DB_SSL_MODE) || 'verify-full';
  if (!['disable','verify-full'].includes(sslMode) || (!local && sslMode !== 'verify-full')) fail('VERIFIED_TLS_REQUIRED');
  const ca = target ? env.RESTORE_DB_SSL_CA_PATH : env.DB_SSL_CA_PATH;
  return { raw, host, port:url.port || '5432', user, password, database, local, sslMode, ca };
}
function toolEnv(env, conn) {
  // Do not inherit PGOPTIONS/PGSERVICE/PGHOSTADDR, source DATABASE_URL or provider secrets.
  const clean = {};
  for (const [key,value] of Object.entries(env)) if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|lang|lc_all)$/i.test(key)) clean[key] = value;
  if (conn) Object.assign(clean, { PGHOST:conn.host, PGPORT:conn.port, PGUSER:conn.user, PGPASSWORD:conn.password,
    PGDATABASE:conn.database, PGSSLMODE:conn.sslMode, PGCONNECT_TIMEOUT:'5', PGAPPNAME:'asedeliya-db-continuity',
    ...(conn.ca ? { PGSSLROOTCERT:conn.ca } : {}) });
  return clean;
}
function executable(name, env) { return env.PG_BIN_DIR ? path.join(env.PG_BIN_DIR, name + (process.platform === 'win32' ? '.exe' : '')) : name; }
function runTool(name, args, { env = process.env, conn, stdout = 'pipe', run = spawnSync } = {}) {
  let result;
  try { result = run(executable(name,env), args, { shell:false, windowsHide:true, env:toolEnv(env,conn),
    stdio:['ignore',stdout,'pipe'], encoding:'utf8', maxBuffer:8 * 1024 * 1024, timeout:30 * 60 * 1000 }); }
  catch { fail('POSTGRES_TOOL_FAILED'); }
  if (result.error?.code === 'ENOENT') fail(name === 'pg_dump' ? 'PG_DUMP_MISSING' : 'PG_RESTORE_MISSING');
  if (result.error || result.status !== 0) fail(name === 'pg_dump' ? 'PG_DUMP_FAILED' : 'PG_RESTORE_FAILED');
  return result.stdout || '';
}
function migrationInventory() {
  const dir = path.join(root,'database/migrations');
  const migrations = fs.readdirSync(dir).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const text = migrations.map(name => fs.readFileSync(path.join(dir,name),'utf8')).join('\n');
  const tables = ['_migrations'], serials = [{table:'_migrations',column:'id'}], foreignKeys = [], indexes = [];
  const unique = [{table:'_migrations',columns:['name']}];
  const primary = [{table:'_migrations',columns:['id']}];
  // Bounded inventory for the repository's CREATE TABLE / CREATE INDEX syntax, not a general SQL parser.
  for (const match of text.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const [,table,body] = match; tables.push(table);
    for (const m of body.matchAll(/\b(\w+)\s+(?:BIG)?SERIAL\b/gi)) serials.push({table,column:m[1]});
    for (const m of body.matchAll(/\b(\w+)\s+(?:INTEGER|BIGINT)[^,\n]*?REFERENCES\s+(\w+)\s*\((\w+)\)/gi)) foreignKeys.push({table,column:m[1],parent:m[2],parentColumn:m[3]});
    const composite = body.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
    const inline = body.match(/\b(\w+)\s+\w+(?:\(\d+\))?\s+PRIMARY KEY/i);
    if (!composite && !inline) fail('MIGRATION_INVENTORY_UNSUPPORTED');
    primary.push({table,columns:composite ? composite[1].split(',').map(s=>s.trim()) : [inline[1]]});
    for (const m of body.matchAll(/\bUNIQUE\s*\(([^)]+)\)/gi)) {
      if (['provider_hotels','provider_destinations'].includes(table)) continue; // 020 replaces these with environment indexes.
      unique.push({table,columns:m[1].split(',').map(s=>s.trim())});
    }
    for (const m of body.matchAll(/\b(\w+)\s+VARCHAR\(\d+\)\s+UNIQUE/gi)) unique.push({table,columns:[m[1]]});
  }
  for (const m of text.matchAll(/CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+)\s+ON (\w+)/gi)) indexes.push({name:m[2],table:m[3],unique:Boolean(m[1])});
  if (new Set(tables).size !== tables.length || tables.length !== (text.match(/CREATE TABLE IF NOT EXISTS/gi)||[]).length + 1) fail('MIGRATION_INVENTORY_UNSUPPORTED');
  return { migrations, tables:tables.sort(), serials, primary, foreignKeys, unique, indexes };
}
function dumpName(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('INVALID_TIMESTAMP');
  return `asedeliya-${now.toISOString().replace(/[-:.]/g,'')}.dump`;
}
function safePath(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f]/.test(value) || value.split(/[\\/]/).includes('..')) fail('UNSAFE_ARCHIVE_PATH');
  const absolute = path.resolve(value);
  let current = absolute;
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) fail('UNSAFE_ARCHIVE_PATH'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return absolute;
}
function checksum(file) {
  const fd = fs.openSync(safePath(file),'r'), hash = crypto.createHash('sha256'), chunk = Buffer.alloc(1024 * 1024);
  try { let length; while ((length = fs.readSync(fd,chunk,0,chunk.length,null))) hash.update(chunk.subarray(0,length)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function sourceIdentity(conn) {
  // Stable identity without retaining host, database name, username or password.
  return crypto.createHash('sha256').update(JSON.stringify([conn.local ? 'loopback' : conn.host,conn.port,conn.database])).digest('hex');
}
function makeManifest(file, conn, now, clientVersion, env) {
  return {format:'asedeliya-postgresql-custom',version:1,toolVersion:'3Y.1',createdAt:now.toISOString(),
    sourceIdentitySha256:sourceIdentity(conn),appEnvironment:['staging','test','development','production'].includes(env.APP_ENV) ? env.APP_ENV : 'unspecified',
    dumpFilename:path.basename(file),sizeBytes:fs.statSync(file).size,sha256:checksum(file),clientVersion,
    expectedRepositoryMigrations:migrationInventory().migrations,sourceMigrationLedger:'not-read',
    status:'BACKUP_VERIFIED',verification:'checksum-and-archive-list',dataBlocksRestored:false};
}
function readManifest(file) {
  let value;
  try {
    const manifestPath = safePath(file + '.manifest.json');
    const stat = fs.statSync(manifestPath);
    if (!stat.isFile() || stat.size > 65536) fail('INVALID_MANIFEST');
    value = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  } catch { fail('INVALID_MANIFEST'); }
  const keys = ['format','version','toolVersion','createdAt','sourceIdentitySha256','appEnvironment','dumpFilename','sizeBytes','sha256','clientVersion','expectedRepositoryMigrations','sourceMigrationLedger','status','verification','dataBlocksRestored'];
  if (!value || Object.keys(value).length !== keys.length || keys.some(key=>!Object.hasOwn(value,key)) ||
    value.format !== 'asedeliya-postgresql-custom' || value.version !== 1 || value.toolVersion !== '3Y.1' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) ||
    value.dumpFilename !== path.basename(file) || !/^asedeliya-\d{8}T\d{9}Z\.dump$/.test(value.dumpFilename) ||
    !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 || !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !/^[a-f0-9]{64}$/.test(value.sourceIdentitySha256) || !/^(?:\d+(?:\.\d+){0,2}|unknown)$/.test(value.clientVersion) ||
    !['staging','test','development','production','unspecified'].includes(value.appEnvironment) ||
    JSON.stringify(value.expectedRepositoryMigrations) !== JSON.stringify(migrationInventory().migrations) ||
    value.sourceMigrationLedger !== 'not-read' || value.status !== 'BACKUP_VERIFIED' ||
    value.verification !== 'checksum-and-archive-list' || value.dataBlocksRestored !== false) fail('INVALID_MANIFEST');
  if (new Date(value.createdAt).toISOString() !== value.createdAt || dumpName(new Date(value.createdAt)) !== value.dumpFilename) fail('INVALID_MANIFEST');
  if (fs.statSync(file).size !== value.sizeBytes || checksum(file) !== value.sha256) fail('CHECKSUM_MISMATCH');
  return value;
}
function backup({ env = process.env, now = new Date(), run = spawnSync, log = () => {} } = {}) {
  const conn = connection(env);
  // Detect missing clients before reserving any output.
  const versionOutput = runTool('pg_dump',['--version'],{env,run});
  const clientVersion = /^pg_dump \(PostgreSQL\) (\d+(?:\.\d+){0,2})(?:\s|$)/.exec(versionOutput)?.[1] || 'unknown';
  runTool('pg_restore',['--version'],{env,run});
  const name = dumpName(now), dir = safePath(env.DB_DUMP_DIR || path.join(root,'backend/backups/postgres'));
  const relative = path.relative(root,dir);
  const allowed = path.relative(path.join(root,'backend/backups'),dir);
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && (allowed.startsWith('..') || path.isAbsolute(allowed))) fail('BACKUP_DIRECTORY_NOT_IGNORED');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,name), partial = file + '.partial';
  if (fs.existsSync(file) || fs.existsSync(file + '.manifest.json')) fail('BACKUP_ALREADY_EXISTS');
  let fd;
  try { fd = fs.openSync(partial,'wx',0o600); } catch (error) { if(error.code==='EEXIST')fail('BACKUP_ALREADY_EXISTS');throw error; }
  log({status:'started',file:name});
  try {
    runTool('pg_dump',['-Fc','--no-owner','--no-acl','--no-password','--lock-wait-timeout=10000'],{env,conn,stdout:fd,run});
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const size = fs.statSync(partial).size;
  if (!size) fail('EMPTY_ARCHIVE');
  log({status:'BACKUP_CREATED',file:name,sizeBytes:size,verified:false});
  verify(partial,{env,run,archiveOnly:true});
  // link is atomic and refuses replacement (unlike rename on POSIX). Failed dumps remain .partial.
  try { fs.linkSync(partial,file); } catch (error) { if(error.code==='EEXIST')fail('BACKUP_ALREADY_EXISTS');throw error; }
  fs.unlinkSync(partial); // Only this invocation's completed temporary file. No retention/deletion of older backups.
  const manifest = makeManifest(file,conn,now,clientVersion,env);
  const manifestFd = fs.openSync(file + '.manifest.json','wx',0o600);
  try { fs.writeFileSync(manifestFd,JSON.stringify(manifest,null,2)+'\n');fs.fsyncSync(manifestFd); }
  finally { fs.closeSync(manifestFd); }
  readManifest(file);
  log({status:'BACKUP_VERIFIED',file:name,manifest:name+'.manifest.json',sizeBytes:size,sha256:manifest.sha256,dataBlocksRestored:false});
  return {file,name,sizeBytes:size,manifest};
}
function verify(file, { env = process.env, run = spawnSync, schema = 'public', archiveOnly = false } = {}) {
  if (!file || !/^[a-z_][a-z0-9_]*$/.test(schema)) fail('ARCHIVE_PATH_REQUIRED');
  const absolute = safePath(file);
  let stat;
  try { stat = fs.statSync(absolute); } catch { fail('ARCHIVE_NOT_FOUND'); }
  if (!stat.isFile() || !stat.size) fail('EMPTY_ARCHIVE');
  const fd = fs.openSync(absolute,'r'); const magic = Buffer.alloc(5);
  try { fs.readSync(fd,magic,0,5,0); } finally { fs.closeSync(fd); }
  if (magic.toString() !== 'PGDMP') fail('INVALID_CUSTOM_ARCHIVE');
  const manifest = archiveOnly ? null : readManifest(absolute);
  const listing = runTool('pg_restore',['--format=custom','--list',absolute],{env,run});
  const objects = listing.split(/\r?\n/).filter(line=>/^\d+;/.test(line)).map(line=>line.replace(/^\d+;\s+\d+\s+\d+\s+/,''));
  const has = (kind,name) => objects.some(line=>line.startsWith(`${kind} ${schema} ${name} `));
  const inventory = migrationInventory();
  const missing = [];
  for (const table of inventory.tables) for (const kind of ['TABLE','TABLE DATA']) if(!has(kind,table))missing.push(`${kind}:${table}`);
  for (const {table,column} of inventory.serials) for(const kind of ['SEQUENCE','SEQUENCE SET'])if(!has(kind,`${table}_${column}_seq`))missing.push(`${kind}:${table}`);
  for (const {table} of inventory.primary) if(!has('CONSTRAINT',`${table} ${table}_pkey`))missing.push(`PK:${table}`);
  for (const {table,column} of inventory.foreignKeys) if(!has('FK CONSTRAINT',`${table} ${table}_${column}_fkey`))missing.push(`FK:${table}`);
  for (const {name} of inventory.indexes) if(!has('INDEX',name))missing.push(`INDEX:${name}`);
  for (const {table,columns} of inventory.unique) if(!has('CONSTRAINT',`${table} ${table}_${columns.join('_')}_key`))missing.push(`UNIQUE:${table}`);
  if (missing.length) fail('ARCHIVE_OBJECTS_MISSING');
  return {status:archiveOnly ? 'archive-list-readable' : 'BACKUP_VERIFIED',...(manifest ? {sha256:manifest.sha256} : {}),sizeBytes:stat.size,expectedTables:inventory.tables.length,expectedIndexes:inventory.indexes.length,
    dataBlocksRestored:false}; // TOC readability alone is not a full data-block restore/integrity proof.
}
function restoreGuard(env, apply) {
  const target = connection(env,true);
  const labels = [target.host,target.database,env.NODE_ENV,env.APP_ENV,env.ENVIRONMENT,env.RESTORE_ENVIRONMENT,env.HOTELBEDS_ENV,env.PAYMENTS_MODE];
  if (labels.some(value=>/prod|live/i.test(value || '')) || ['PRODUCTION_SALES_ENABLED','REAL_CHARGES_ENABLED','REAL_REFUNDS_ENABLED','HOTELBEDS_LIVE_BOOKING_ENABLED'].some(key=>/^(true|1)$/i.test(env[key] || ''))) fail('PRODUCTION_RESTORE_BLOCKED');
  if (!apply || env.RESTORE_CONFIRM_DATABASE !== target.database) fail('RESTORE_CONFIRM_REQUIRED');
  if (env.DATABASE_URL) {
    const source = connection(env);
    const sameHost = source.host === target.host || source.local && target.local;
    if (sameHost && source.port === target.port && source.database === target.database) fail('SOURCE_EQUALS_TARGET');
  }
  if (!target.local && env.RESTORE_ALLOW_REMOTE !== 'I_ACKNOWLEDGE_NEW_EMPTY_TARGET') fail('REMOTE_ACK_REQUIRED');
  return target;
}
async function withClient(conn, work, factory) {
  const config = { ...databaseConfig({DATABASE_URL:conn.raw,DB_SSL_MODE:conn.sslMode,DB_SSL_CA_PATH:conn.ca}),
    statement_timeout:10000, query_timeout:15000, application_name:'asedeliya-db-continuity' };
  const client = factory ? factory(config) : new (require('pg').Client)(config);
  try {
    await client.connect();
    try { return await work(client); } catch(error) { error.dbReachable=true;throw error; }
  } finally { await client.end().catch(()=>{}); }
}
async function assertEmpty(client) {
  const result = await client.query(`SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
       AND c.relkind IN ('r','p','S','v','m','f')) +
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog','information_schema')) +
    (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS occupied`);
  if (Number(result.rows[0]?.occupied) !== 0) fail('TARGET_NOT_EMPTY');
}
async function restore(file, { env = process.env, apply = false, run = spawnSync, factory, log = () => {} } = {}) {
  const conn = restoreGuard(env,apply); // All target guards before tool execution / network.
  verify(file,{env,run});
  if (readManifest(safePath(file)).sourceIdentitySha256 === sourceIdentity(conn)) fail('SOURCE_EQUALS_TARGET');
  await withClient(conn,assertEmpty,factory);
  log({status:'started',operation:'restore'});
  runTool('pg_restore',['--format=custom','--no-password','--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-tablespaces','--dbname',conn.database,path.resolve(file)],{env,conn,run});
  log({status:'completed',operation:'restore',schemaValidation:'run dbSchemaCheck.cjs next'});
  return {status:'restored'};
}
async function readState(client, {exactCounts = false} = {}) {
  const expected = migrationInventory();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const info = (await client.query("SELECT current_database() AS database, current_schema() AS schema, current_setting('server_version_num') AS version, pg_database_size(current_database())::text AS size")).rows[0];
    if(info.schema !== 'public')fail('PUBLIC_SCHEMA_REQUIRED');
    const tables = (await client.query("SELECT c.relname AS name, greatest(c.reltuples,0)::bigint::text AS rows FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname")).rows;
    const names = tables.map(row=>row.name), known = new Set(expected.tables);
    const exactRows = [];
    if(exactCounts) {
      if(!/^\d+$/.test(String(info.size)) || BigInt(info.size)>104857600n)fail('EXACT_COUNT_SIZE_LIMIT');
      for(const table of expected.tables.filter(name=>names.includes(name))) {
        const count=(await client.query(`SELECT count(*)::text AS n FROM public."${table}"`)).rows[0].n;
        exactRows.push({name:table,rows:count});
      }
    }
    const migrationRows = names.includes('_migrations') ? (await client.query('SELECT name FROM public._migrations ORDER BY name')).rows.map(row=>row.name) : [];
    const constraints = (await client.query(`SELECT t.relname AS table_name, c.contype AS type, c.convalidated AS validated,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      p.relname AS parent, pn.nspname AS parent_schema,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_class p ON p.oid=c.confrelid LEFT JOIN pg_namespace pn ON pn.oid=p.relnamespace
      WHERE n.nspname='public' ORDER BY t.relname,c.conname`)).rows;
    const indexes = (await client.query(`SELECT t.relname AS table_name, i.relname AS name, x.indisunique AS unique, x.indisvalid AS valid
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' ORDER BY i.relname`)).rows;
    const serials = [];
    for(const {table,column} of expected.serials) {
      if(!names.includes(table))continue;
      const value=(await client.query("SELECT pg_get_serial_sequence($1,$2) AS sequence, column_default AS default FROM information_schema.columns WHERE table_schema='public' AND table_name=$3 AND column_name=$2",[`public.${table}`,column,table])).rows[0];
      let ok = Boolean(value?.sequence === `public.${table}_${column}_seq` && /^nextval\(/.test(value.default || ''));
      if (ok) {
        const sequence = (await client.query(`SELECT last_value::text AS value, is_called FROM public."${table}_${column}_seq"`)).rows[0];
        const maximum = (await client.query(`SELECT max("${column}")::text AS value FROM public."${table}"`)).rows[0].value;
        ok = maximum === null || sequence.is_called && BigInt(sequence.value) >= BigInt(maximum);
      }
      serials.push({table,column,ok});
    }
    const lastBackup = names.includes('maintenance_runs') ? (await client.query("SELECT completed_at FROM public.maintenance_runs WHERE operation='backup_create' AND status='success' ORDER BY completed_at DESC NULLS LAST LIMIT 1")).rows[0]?.completed_at : null;
    await client.query('COMMIT');
    return { expected, info, tables, names, known, migrationRows, constraints, indexes, serials, lastBackup, exactRows };
  } catch(error) { await client.query('ROLLBACK').catch(()=>{});throw error; }
}
function diagnostic(state) {
  const {expected,info,tables,known,migrationRows,lastBackup} = state;
  const applied = expected.migrations.filter(name=>migrationRows.includes(name));
  const date = lastBackup instanceof Date && Number.isFinite(lastBackup.getTime()) ? lastBackup.toISOString() : null;
  return {reachable:true,serverVersionNumber:/^\d+$/.test(String(info.version)) ? String(info.version) : null,
    database:/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(info.database) ? info.database : '[nonstandard name]',schema:'public',
    tableCount:tables.length,databaseSizeBytes:/^\d+$/.test(String(info.size)) ? String(info.size) : null,
    migrations:{metadataPresent:state.names.includes('_migrations'),count:migrationRows.length,latest:applied.at(-1)||null,pending:expected.migrations.filter(name=>!applied.includes(name)),unknownCount:migrationRows.length-applied.length},
    approximateRows:Object.fromEntries(tables.filter(row=>known.has(row.name)).map(row=>[row.name,/^\d+$/.test(String(row.rows)) ? String(row.rows) : null])),
    ...(state.exactRows?.length ? {exactRows:Object.fromEntries(state.exactRows.filter(row=>known.has(row.name)).map(row=>[row.name,/^\d+$/.test(String(row.rows)) ? String(row.rows) : null]))} : {}),
    lastSuccessfulLegacyBackupRecordedAt:date,backupEvidence:'maintenance_runs is a legacy JSON operational record; it does not prove a current custom dump or successful restore.'};
}
function validate(state) {
  const {expected,names,constraints,indexes,serials,migrationRows} = state;
  const missing = [];
  const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
  for(const table of expected.tables)if(!names.includes(table))missing.push(`table:${table}`);
  for(const [type,items] of [['p',expected.primary],['u',expected.unique]])for(const item of items)
    if(!constraints.some(c=>c.table_name===item.table && c.type===type && c.validated && same(c.columns,item.columns)))missing.push(`constraint:${type}:${item.table}`);
  for(const item of expected.foreignKeys)if(!constraints.some(c=>c.table_name===item.table && c.type==='f' && c.validated && same(c.columns,[item.column]) && c.parent===item.parent && c.parent_schema==='public' && same(c.parent_columns,[item.parentColumn])))missing.push(`fk:${item.table}:${item.column}`);
  for(const item of expected.indexes)if(!indexes.some(i=>i.name===item.name && i.table_name===item.table && i.valid && i.unique===item.unique))missing.push(`index:${item.name}`);
  for(const item of expected.serials)if(!serials.some(s=>s.table===item.table && s.column===item.column && s.ok))missing.push(`sequence-default:${item.table}`);
  for(const name of expected.migrations)if(!migrationRows.includes(name))missing.push(`migration:${name}`);
  if(migrationRows.some(name=>!expected.migrations.includes(name)))missing.push('unknown-migration-state');
  return {valid:missing.length===0,expectedTables:expected.tables.length,expectedIndexes:expected.indexes.length,expectedForeignKeys:expected.foreignKeys.length,expectedSequences:expected.serials.length,missing};
}
async function inspect({env=process.env,target=false,exactCounts=false,factory}={}) {
  return withClient(connection(env,target),client=>readState(client,{exactCounts}),factory);
}
async function cli(work, output = console.log) {
  try { await work(value=>output(JSON.stringify(value)));return 0; }
  catch(error) { output(JSON.stringify(safeError(error)));return 1; }
}
module.exports={ContinuityError,root,safeError,connection,toolEnv,runTool,migrationInventory,dumpName,safePath,checksum,sourceIdentity,makeManifest,readManifest,backup,verify,restoreGuard,withClient,assertEmpty,restore,readState,diagnostic,validate,inspect,cli};
