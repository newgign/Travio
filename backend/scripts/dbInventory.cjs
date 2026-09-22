const db = require('./lib/dbContinuity.cjs');
if (require.main === module) db.cli(async log => {
  const args=process.argv.slice(2);
  if(args.some(arg=>!['--target','--exact-counts'].includes(arg)) || new Set(args).size!==args.length)throw new db.ContinuityError('INVALID_ARGUMENT');
  try { log(db.diagnostic(await db.inspect({target:args.includes('--target'),exactCounts:args.includes('--exact-counts')}))); }
  catch(error) { log({reachable:error.dbReachable===true});throw error; }
}).then(code=>{process.exitCode=code;});
