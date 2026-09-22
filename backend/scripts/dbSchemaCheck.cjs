const db = require('./lib/dbContinuity.cjs');
if (require.main === module) db.cli(async log => {
  if(process.argv.length!==2)throw new db.ContinuityError('NO_ARGUMENTS_EXPECTED');
  const result=db.validate(await db.inspect({target:true}));
  log(result);
  if(!result.valid)throw new db.ContinuityError('SCHEMA_VALIDATION_FAILED');
}).then(code=>{process.exitCode=code;});
