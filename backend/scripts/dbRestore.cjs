const db = require('./lib/dbContinuity.cjs');
if (require.main === module) db.cli(async log => {
  if(process.argv.length!==4 || process.argv[3]!=='--apply')throw new db.ContinuityError('RESTORE_CONFIRM_REQUIRED');
  await db.restore(process.argv[2],{apply:true,log});
}).then(code=>{process.exitCode=code;});
