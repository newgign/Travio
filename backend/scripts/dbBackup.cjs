const db = require('./lib/dbContinuity.cjs');
if (require.main === module) db.cli(async log => {
  if(process.argv.length!==2)throw new db.ContinuityError('NO_ARGUMENTS_EXPECTED');
  db.backup({log});
}).then(code=>{process.exitCode=code;});
