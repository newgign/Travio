// Offline finalization only. No connection(), DB client, pg_dump or remote operation.
const fs=require('node:fs');
const path=require('node:path');
const db=require('./lib/dbContinuity.cjs');
const reject=code=>{throw new db.ContinuityError(code);};
function finalize(partial,proofFile,{env=process.env,run}={}) {
  const file=db.safePath(partial);
  const match=/^asedeliya-(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(\d{3})Z\.dump\.partial$/.exec(path.basename(file));
  if(!match) reject('FINALIZE_PARTIAL_REQUIRED');
  const final=file.slice(0,-8),manifestFile=final+'.manifest.json',auditFile=final+'.restore-proof.json';
  if([final,manifestFile,auditFile].some(name=>fs.existsSync(name))) reject('BACKUP_ALREADY_EXISTS');
  if(!fs.existsSync(file)) reject('ARCHIVE_NOT_FOUND');
  const proofPath=db.safePath(proofFile);
  let proof;
  try {
    if(fs.statSync(proofPath).size>65536) reject('RESTORE_PROOF_INVALID');
    proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
  } catch { reject('RESTORE_PROOF_INVALID'); }
  const hash=db.checksum(file);
  const keys=['format','version','archiveSha256','sizeBytes','appliedMigrations','createdAt','status','localTarget','requiredSchema','dataCounts','cleanup'];
  if(!proof || Object.keys(proof).length!==keys.length || keys.some(k=>!Object.hasOwn(proof,k))
    || proof.format!=='asedeliya-local-restore-proof'||proof.version!==1||proof.status!=='PASS'||proof.localTarget!==true
    || proof.requiredSchema!==true||proof.cleanup!==true||proof.archiveSha256!==hash||proof.sizeBytes!==fs.statSync(file).size
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(proof.createdAt)||!Number.isFinite(Date.parse(proof.createdAt))) reject('RESTORE_PROOF_INVALID');
  const inventory=db.migrationInventory(proof.appliedMigrations);
  if(proof.appliedMigrations.length!==21 || !proof.dataCounts || Object.keys(proof.dataCounts).length!==inventory.tables.length
    || inventory.tables.some(t=>!/^\d+$/.test(proof.dataCounts[t]||''))) reject('RESTORE_PROOF_INVALID');
  const identity=env.RECONCILIATION_EXPECTED_DB_IDENTITY;
  if(!/^[a-f0-9]{64}$/.test(identity||'') || env.APP_ENV!=='staging'||!['verify-full','require'].includes(env.DB_SSL_MODE)) reject('SOURCE_METADATA_REQUIRED');
  // Caller supplies historical source metadata; no new source URL or target identity is inferred.
  const result=db.verify(file,{env,run,archiveOnly:true});
  if(JSON.stringify(result.appliedMigrations)!==JSON.stringify(proof.appliedMigrations)) reject('RESTORE_PROOF_INVALID');
  const versionText=db.runTool('pg_restore',['--format=custom','--list',file],{env,run});
  const clientVersion=/^;\s+Dumped by pg_dump version: (\d+(?:\.\d+){0,2})(?:\s|$)/m.exec(versionText)?.[1];
  if(!clientVersion) reject('SOURCE_METADATA_REQUIRED');
  const createdAt=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
  if(db.dumpName(new Date(createdAt))!==path.basename(final)) reject('FINALIZE_PARTIAL_REQUIRED');
  const manifest={format:'asedeliya-postgresql-custom',version:2,toolVersion:'3Y.2',sourceTlsMode:env.DB_SSL_MODE,
    createdAt,sourceIdentitySha256:identity,appEnvironment:'staging',dumpFilename:path.basename(final),sizeBytes:result.sizeBytes,
    sha256:hash,clientVersion,expectedRepositoryMigrations:db.migrationInventory().migrations,sourceMigrationLedger:'not-read',
    status:'BACKUP_VERIFIED',verification:'checksum-and-archive-list',dataBlocksRestored:false};
  const temp=manifestFile+'.pending';let tempCreated=false,manifestLinked=false,auditLinked=false,archiveLinked=false;
  try {
    const fd=fs.openSync(temp,'wx',0o600);
    tempCreated=true;
    try{fs.writeFileSync(fd,JSON.stringify(manifest,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(db.checksum(file)!==hash) reject('CHECKSUM_MISMATCH');
    fs.linkSync(temp,manifestFile);manifestLinked=true;
    fs.linkSync(proofPath,auditFile);auditLinked=true;
    // Publish final archive last, atomically and without overwrite, with metadata already present.
    fs.linkSync(file,final);archiveLinked=true;
    db.verify(final,{env,run});
    fs.unlinkSync(file);
  } catch(error) {
    if(archiveLinked)fs.unlinkSync(final);
    if(auditLinked)fs.unlinkSync(auditFile);
    if(manifestLinked)fs.unlinkSync(manifestFile);
    throw error;
  } finally {if(tempCreated && fs.existsSync(temp))fs.unlinkSync(temp);}
  return {status:'BACKUP_VERIFIED',file:path.basename(final),sha256:hash,localRestoreProof:true,proofSha256:db.checksum(auditFile)};
}
if(require.main===module)db.cli(async log=>{
  if(process.argv.length!==4)reject('FINALIZE_ARGUMENTS_REQUIRED');
  log(finalize(process.argv[2],process.argv[3]));
}).then(code=>{process.exitCode=code;});
module.exports={finalize};
