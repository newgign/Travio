const db = require('./lib/dbContinuity.cjs');
if (require.main === module) db.cli(async log => {
  if(process.argv.length!==3)throw new db.ContinuityError('ARCHIVE_PATH_REQUIRED');
  log(db.verify(process.argv[2]));
}).then(code=>{process.exitCode=code;});
