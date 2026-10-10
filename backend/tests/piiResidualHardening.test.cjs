const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const logger=require('../utils/logger'),meta=require('../utils/operationalMetadata'),pub=require('../utils/operationalPublic');
const backup=require('../scripts/lib/backupDiagnostics.cjs'),pool=require('../db');
const marker='SYNTHETIC_PRIVATE_MARKER';
beforeEach(t=>{
  const fail=()=>assert.fail('REAL_IO_FORBIDDEN');
  for(const name of ['query','connect'])t.mock.method(pool,name,fail);
  for(const C of [require('pg').Pool,require('pg').Client])for(const name of ['query','connect'])t.mock.method(C.prototype,name,fail);
  for(const p of ['http','https'])for(const n of ['get','request'])t.mock.method(require(p),n,fail);
  t.mock.method(globalThis,'fetch',fail);
});
for(const key of ['q','query','queryString','searchValue','note','description','details','context'])test(`log context ${key} never echoes free personal text`,()=>assert.doesNotMatch(logger.format('info','fixed',{[key]:marker}),new RegExp(marker)));
for(const value of ['synthetic@example.test','+7 (000) 000-00-00','Synthetic Person'])test(`admin search not in telemetry ${value.length}`,t=>{
  const old=process.env.HTTP_ACCESS_LOG;process.env.HTTP_ACCESS_LOG='true';t.after(()=>{if(old===undefined)delete process.env.HTTP_ACCESS_LOG;else process.env.HTTP_ACCESS_LOG=old;});
  let log;const cb={};t.mock.method(logger,'info',(m,data)=>{log=data;});
  require('../middleware/requestTelemetry')({get:()=>'',method:'GET',baseUrl:'/api/admin',route:{path:'/bookings'},query:{q:value,page:'2'},originalUrl:'/api/admin/bookings?q='+encodeURIComponent(value)},
    {statusCode:200,setHeader(){},on(k,fn){cb[k]=fn;}},()=>{});cb.finish();assert.equal(log.route,'/api/admin/bookings');assert.doesNotMatch(JSON.stringify(log),new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(log.query,undefined);
});
test('admin query still parameterized with working pagination',async t=>{
  const calls=[];t.mock.method(pool,'query',async(sql,values)=>{calls.push({sql,values});return{rows:sql.includes('COUNT(*)')?[{total:50}]:[]};});
  const res={json(value){this.body=value;return this;},status(){return this;}};
  await require('../controllers/adminOperationsController').getBookings({query:{q:'synthetic@example.test',page:'2',limit:'10'}},res);
  assert.equal(res.body.pagination.page,2);assert.equal(res.body.pagination.limit,10);assert.equal(calls[1].values[0],'%synthetic@example.test%');assert.deepEqual(calls[1].values.slice(-2),[10,10]);assert.doesNotMatch(calls[1].sql,/synthetic@example/);
});
for(const key of ['reason','source','state','resolution'])test(`metadata allowed label ${key} rejects arbitrary single word`,()=>assert.deepEqual(meta({[key]:marker}),{}));
test('unknown nested metadata omitted',()=>assert.deepEqual(meta({data:{email:marker,unknown:{details:marker}},payload:{secret:marker}}),{data:{}}));
test('allowed metadata enum counters flags preserved',()=>assert.deepEqual(meta({state:'degraded',data:{count:2,enabled:true},incidentKey:'reliability:api'}),{state:'degraded',data:{count:2,enabled:true},incidentKey:'reliability:api'}));
test('metadata rejects capability-shaped labels',()=>assert.deepEqual(meta({source:'eyJabc.def.ghi',reason:'Bearer '+marker}),{}));
test('free string bounds and control removal',()=>{const text=logger.sanitizeText('x\n\u001b\u0000'+'z'.repeat(2000));assert.ok(text.length<=1000);assert.doesNotMatch(text,/[\u0000-\u001f]/);});
test('JSON and object message dumps suppressed',()=>{assert.equal(logger.sanitizeText({private:marker}),'[structured-content]');assert.doesNotMatch(logger.sanitizeText(JSON.stringify({unknown:marker})),new RegExp(marker));});
test('credentials omitted from diagnostic text',()=>assert.doesNotMatch(logger.sanitizeText('password='+marker),new RegExp(marker)));
test('system event arbitrary message replaced before persistence',async t=>{let args;t.mock.method(pool,'query',async(sql,values)=>{args=values;return{rows:[]};});await require('../services/systemEventService').recordEvent({code:'HTTP_500',message:marker});assert.equal(args[3],'System event: HTTP_500');assert.doesNotMatch(JSON.stringify(args),new RegExp(marker));});
test('unknown event code never becomes arbitrary message',()=>assert.equal(pub.eventMessage(marker),'System event'));
for(const stage of ['create','verify','restore','cleanup','scheduled'])test(`legacy backup ${stage} errors fixed without subprocess details`,async()=>{
  const file={create:'backupDatabase.js',verify:'verifyBackup.js',restore:'restoreDatabase.js',cleanup:'cleanupBackups.js',scheduled:'runScheduledBackup.js'}[stage];
  const output=[],error=Object.assign(Error(`postgresql://synthetic:PRIVATE_PASSWORD@synthetic.invalid/private ${marker}`),{stderr:marker,stdout:marker,cmd:marker,stack:marker});
  const fail=()=>{throw error;};const service={createBackup:fail,restoreBackup:fail,parseBackupFile:fail,cleanupRetention:fail,runNow:fail};
  let exitCode;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8'),{
    require(name){if(name==='dotenv')return{config(){}};if(name==='path')return path;if(name.includes('backupDiagnostics'))return backup;if(name==='../db')return{end:async()=>{}};return service;},
    console:{log:v=>output.push(v),warn:v=>output.push(v),table:v=>output.push(v),error:v=>output.push(v)},
    process:{argv:['node','script',`C:/synthetic/${marker}.backup.json`],exit(n){exitCode=n;},set exitCode(n){exitCode=n;}}
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(exitCode,1);assert.ok(output.some(value=>String(value).includes(backup.failure(stage).code)));
  assert.doesNotMatch(JSON.stringify(output),/PRIVATE_PASSWORD|postgresql|synthetic.invalid|SYNTHETIC_PRIVATE_MARKER/);
});
test('backup error stage itself cannot inject values',()=>assert.deepEqual(backup.failure(marker),{stage:'backup',code:'BACKUP_BACKUP_FAILED'}));
test('backup summary only generated basename no home path',()=>{const out=backup.summary({file:'C:/synthetic/home/travio-20261010T120000Z-abcdef12.backup.json',encrypted:false,tableCount:2});assert.equal(out.file,'travio-20261010T120000Z-abcdef12.backup.json');assert.doesNotMatch(JSON.stringify(out),/home|C:/);});
test('backup arbitrary basename and directory omitted',()=>assert.deepEqual(backup.summary({file:marker,directory:marker,rows:[marker],stderr:marker,command:marker}),{}));
test('backup untrusted release date and checksum omitted',()=>assert.deepEqual(backup.summary({release:marker,createdAt:marker,checksum:marker}),{}));
test('backup allowed counts/checksum preserved',()=>assert.deepEqual(backup.summary({checksum:'a'.repeat(64),mode:'dry-run',tableCount:3}),{tableCount:3,mode:'dry-run',checksum:'a'.repeat(16)}));
test('admin action security internals and historical metadata removed',()=>{const out=pub.action({id:1,admin_name:'Synthetic',action_type:'user_deleted',password:marker,session_version:2,is_active:true,metadata:{email:marker,reason:marker,role:'user'}});assert.equal(out.admin_name,'Synthetic');assert.deepEqual(out.metadata,{role:'user'});assert.doesNotMatch(JSON.stringify(out),new RegExp(marker));});
test('historical event free message and metadata not re-exposed',()=>{const out=pub.event({id:1,code:'HTTP_404',message:marker,metadata:{details:marker},unknown:marker});assert.equal(out.message,'System event: HTTP_404');assert.doesNotMatch(JSON.stringify(out),new RegExp(marker));});
test('incident consumer fields retained without raw payload',()=>{const out=pub.incident({id:1,title:'API degraded',summary:'counter unavailable',status:'open',first_detected_at:'synthetic',provider_response:marker,metadata:{state:'degraded',payload:marker}});assert.equal(out.title,'API degraded');assert.equal(out.status,'open');assert.doesNotMatch(JSON.stringify(out),new RegExp(marker));});
test('normal user cannot read admin even with browser claim',()=>{const res={status(n){this.code=n;return this;},json(){}};require('../middleware/requireRole')('admin')({user:{role:'user'},query:{role:'admin'}},res,()=>assert.fail('allowed'));assert.equal(res.code,403);});
test('guest admin read denied',()=>{const res={status(n){this.code=n;return this;},json(){}};require('../middleware/requireRole')('admin')({},res,()=>assert.fail('allowed'));assert.equal(res.code,401);});
test('existing admin permissions preserved',()=>assert.equal(require('../services/permissionService').hasPermission('admin','admin.operations.read'),true));
test('email console remains content-free and failures fixed in source',()=>{const source=fs.readFileSync(path.join(__dirname,'../services/emailProviderService.js'),'utf8');assert.match(source,/logger.info\('EMAIL CONSOLE', \{ provider: 'console', messageId \}\)/);assert.doesNotMatch(source,/logger\.info\(`EMAIL CONSOLE/);});
