// Explicit local-only restore drill. Does not read DATABASE_URL or application config.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const db = require('./lib/dbContinuity.cjs');
const { assertHistory } = require('./lib/backupMigrationState.cjs');
async function prove(file, { env = process.env } = {}) {
  const archive = db.safePath(file);
  const hash = db.checksum(archive);
  const tools = { PG_BIN_DIR:env.PG_BIN_DIR, SystemRoot:env.SystemRoot, TEMP:env.TEMP, PATH:env.PATH };
  const verified = db.verify(archive,{env:tools,archiveOnly:true});
  if (verified.appliedMigrations.length !== 21) throw new db.ContinuityError('RESTORE_PROOF_MIGRATION_STATE_INVALID');
  const name = 'asedeliya_restore_' + crypto.randomBytes(8).toString('hex');
  const password = crypto.randomBytes(32).toString('hex');
  let network = false, container = false, evidence;
  const docker = args => {
    try { return execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']}).trim(); }
    catch { throw new db.ContinuityError('LOCAL_DOCKER_OPERATION_FAILED'); }
  };
  try {
    docker(['network','create',name]); network=true;
    docker(['run','--detach','--pull=never','--name',name,'--network',name,'--label','asedeliya.sprint=7m3b3',
      '--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD','--env','POSTGRES_DB='+name,'postgres:18']);container=true;
    const bindings=JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Ports}}',name]))['5432/tcp'];
    if (bindings.length!==1 || bindings[0].HostIp!=='127.0.0.1') throw new db.ContinuityError('RESTORE_LOCAL_TARGET_BLOCKED');
    const port=Number(bindings[0].HostPort);
    if (!Number.isInteger(port)||port<1||port>65535) throw new db.ContinuityError('RESTORE_LOCAL_TARGET_BLOCKED');
    const local={DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${name}`,DB_SSL_MODE:'disable'};
    const conn=db.connection(local);
    for(let attempt=0;;attempt++) {
      try { if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d',name]).includes('accepting connections')) break; }
      catch { /* bounded local container readiness only */ }
      if(attempt>=30) throw new db.ContinuityError('LOCAL_POSTGRES_NOT_READY');
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    await db.withClient(conn,db.assertEmpty);
    db.runTool('pg_restore',['--format=custom','--no-password','--exit-on-error','--single-transaction',
      '--no-owner','--no-acl','--no-tablespaces','--dbname',name,archive],{env:tools,conn});
    const state=await db.withClient(conn,client=>db.readState(client,{exactCounts:true}));
    assertHistory(state.migrationRows,db.migrationInventory().migrations);
    if(JSON.stringify(state.migrationRows)!==JSON.stringify(verified.appliedMigrations)) throw new db.ContinuityError('RESTORE_LEDGER_MISMATCH');
    state.expected=db.migrationInventory(state.migrationRows);
    if(!db.validate(state).valid) throw new db.ContinuityError('RESTORE_SCHEMA_INVALID');
    const columns=await db.withClient(conn,async client=>(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('session_version','is_active')")).rows);
    if(columns.length || hash!==db.checksum(archive)) throw new db.ContinuityError('RESTORE_PROOF_INCONSISTENT');
    evidence={format:'asedeliya-local-restore-proof',version:1,archiveSha256:hash,sizeBytes:verified.sizeBytes,
      appliedMigrations:state.migrationRows,createdAt:new Date().toISOString(),status:'PASS',localTarget:true,
      requiredSchema:true,dataCounts:Object.fromEntries(state.exactRows.map(row=>[row.name,row.rows]))};
  } finally {
    try {
      if(container) {
        docker(['rm','--force','--volumes',name]);
        if(docker(['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'])) throw new db.ContinuityError('LOCAL_CLEANUP_FAILED');
      }
    } finally { if(network) docker(['network','rm',name]); }
  }
  evidence.cleanup=true;
  const proof=archive+'.restore-proof.json';
  fs.writeFileSync(proof,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  return {status:'PASS',proof:path.basename(proof),sha256:hash,migrationState:'POST-021/PRE-022',cleanup:true};
}
if(require.main===module) db.cli(async log=>{
  if(process.argv.length!==3) throw new db.ContinuityError('ARCHIVE_PATH_REQUIRED');
  log(await prove(process.argv[2]));
}).then(code=>{process.exitCode=code;});
module.exports={prove};
