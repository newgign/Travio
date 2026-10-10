const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../scripts/lib/dbContinuity.cjs');
const { hasUniqueConstraint: match } = require('../scripts/lib/backupMigrationState.cjs');
const { fixture,runFor } = require('./helpers/backupArchiveFixture.cjs');
const table='reconciliation_cases',columns=['request_id','provider_fingerprint','payment_fingerprint'];
const sql=(name='custom_unique',s='public',t=table,c=columns)=>`ALTER TABLE ONLY ${s}.${t}\n    ADD CONSTRAINT ${name} UNIQUE (${c.join(', ')});`;
const toc=(name='custom_unique',s='public',t=table)=>[`CONSTRAINT ${s} ${t} ${name} synthetic_owner`];
for (const name of ['reconciliation_cases_request_id_provider_fingerprint_paymen_key',`${table}_${columns.join('_')}_key`,'custom_unique'])
  test(`exact semantics accepts constraint name ${name}`,()=>assert.equal(match(sql(name),toc(name),'public',table,columns),true));
test('missing UNIQUE definition rejected',()=>assert.equal(match('',toc(),'public',table,columns),false));
for(const [label,c] of [['wrong set',['request_id','other_column','payment_fingerprint']],['reversed',[...columns].reverse()],['missing',columns.slice(0,2)],['extra',[...columns,'extra_column']]])
  test(`${label} ordered columns rejected`,()=>assert.equal(match(sql('custom_unique','public',table,c),toc(),'public',table,columns),false));
test('wrong table rejected',()=>assert.equal(match(sql('custom_unique','public','other_table'),toc('custom_unique','public','other_table'),'public',table,columns),false));
test('wrong schema rejected',()=>assert.equal(match(sql('custom_unique','other_schema'),toc('custom_unique','other_schema'),'public',table,columns),false));
test('plain index cannot substitute for UNIQUE constraint',()=>assert.equal(match(`CREATE INDEX custom_unique ON public.${table} (${columns.join(', ')});`,[`INDEX public custom_unique synthetic_owner`],'public',table,columns),false));
test('unique index without constraint cannot substitute',()=>assert.equal(match(`CREATE UNIQUE INDEX custom_unique ON public.${table} (${columns.join(', ')});`,toc(),'public',table,columns),false));
test('missing corresponding TOC constraint rejected',()=>assert.equal(match(sql(),[],'public',table,columns),false));
test('wrong TOC constraint name rejected',()=>assert.equal(match(sql(),toc('different'),'public',table,columns),false));
test('ambiguous duplicate semantic constraints rejected',()=>assert.equal(match(sql()+sql('second'),[...toc(),...toc('second')],'public',table,columns),false));
test('duplicate TOC entries rejected',()=>assert.equal(match(sql(),[...toc(),...toc()],'public',table,columns),false));
test('quoted custom identifier supported',()=>assert.equal(match(sql('"custom_unique"','"public"','"reconciliation_cases"',columns.map(c=>'"'+c+'"')),toc(),'public',table,columns),true));
function verify(t,value){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asedeliya-unique-'));
  t.after(()=>fs.rmSync(dir,{recursive:true}));
  const file=path.join(dir,'synthetic.partial');fs.writeFileSync(file,'PGDMP-synthetic');
  return db.verify(file,{env:{},archiveOnly:true,run:runFor(value)});
}
test('valid post-021 pre-022 fixture with custom names passes full archive object checks',t=>{
  const result=verify(t,fixture(21));assert.equal(result.appliedMigrations.length,21);assert.equal(result.appliedMigrations.at(-1),'021_reconciliation_storage.sql');
});
test('partial 021 missing UNIQUE definition fails integrated verifier',t=>{
  const v=fixture(21),u=v.unique.find(u=>u.table===table);v.schema=v.schema.replace(new RegExp(`ALTER TABLE ONLY public\\.${table}\\n    ADD CONSTRAINT ${u.name} UNIQUE \\([^)]+\\);`),'');
  assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_OBJECTS_MISSING');
});
test('partial 021 missing TOC constraint fails integrated verifier',t=>{
  const v=fixture(21),u=v.unique.find(u=>u.table===table);v.listing=v.listing.split('\n').filter(l=>!l.includes(`CONSTRAINT public ${table} ${u.name} `)).join('\n');
  assert.throws(()=>verify(t,v),e=>e.code==='ARCHIVE_OBJECTS_MISSING');
});
