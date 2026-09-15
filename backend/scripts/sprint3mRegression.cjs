// Each legacy suite gets its own local DB schema; no production/provider network.
const {spawnSync}=require('child_process');
const fs=require('fs'),path=require('path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const {Pool}=require('pg');
const config=require('../config/database').databaseConfig();
const host=config.connectionString?new URL(config.connectionString).hostname:config.host||'localhost';
if(!['localhost','127.0.0.1','::1','[::1]'].includes(host))throw Error('LOCAL_DATABASE_REQUIRED');
const files=['hotelbedsCatalogPlan','hotelbedsAccess','hotelbedsScale','hotelbedsCatalogReadiness','hotelbedsMultiDestination','hotelbedsContent','hotelbedsPublicSearch','hotelbedsStagingTest','hotelbedsReadOnly','hotelbedsLive','hotelbedsIsolation'];
(async()=>{
  const pool=new Pool(config);let failed=false;
  try {for(const file of files){
    const schema='sprint3m_reg_'+require('crypto').randomBytes(8).toString('hex');
    await pool.query(`CREATE SCHEMA ${schema}`);
    const db=await pool.connect();
    try {
      await db.query(`SET search_path TO ${schema}`);
      const dir=path.join(__dirname,'../../database/migrations');
      for(const migration of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.query(fs.readFileSync(path.join(dir,migration),'utf8'));
      // Legacy suites test established access. Seed only their isolated fixture,
      // never application initialization; 3M.1 independently tests absent rows.
      if (file !== 'hotelbedsAccess') await db.query("INSERT INTO provider_job_state(job,environment,details) VALUES ('hotelbeds_test_access_content','test','{\"state\":\"READY\"}'),('hotelbeds_test_access_booking_read','test','{\"state\":\"READY\"}')");
      const result=spawnSync(process.execPath,['--require',path.join(__dirname,'../tests/offlineNetwork.cjs'),'--test','--test-force-exit',`tests/${file}.test.js`],{
        cwd:path.join(__dirname,'..'),env:{...process.env,PGOPTIONS:`-c search_path=${schema}`},encoding:'utf8',timeout:120000});
      fs.mkdirSync(path.join(__dirname,'../../.tmp/3m'),{recursive:true});
      fs.writeFileSync(path.join(__dirname,`../../.tmp/3m/${file}.log`),(result.stdout||'')+(result.stderr||''));
      console.log(file,result.status===0?'PASS':'FAIL',(result.stdout||'').split('\n').filter(line=>/tests |pass |fail /.test(line)).join(' | '));
      if(result.status!==0){failed=true;console.log(result.error?.message||'See .tmp/3m log');}
    } finally {await db.query('RESET search_path');db.release();await pool.query(`DROP SCHEMA ${schema} CASCADE`);}
  }} finally {await pool.end();}
  process.exitCode=failed?1:0;
})().catch(()=>{console.error('Offline regression setup failed');process.exitCode=1;});
