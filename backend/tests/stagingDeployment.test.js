const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { databaseConfig } = require('../config/database');
const { allowedOrigins } = require('../config/cors');
const { healthHandler } = require('../routes/stagingHealth');

test('DATABASE_URL wins; local DB variables and verified SSL remain supported', () => {
  const local = databaseConfig({ DB_HOST:'localhost',DB_PORT:'5433',DB_USER:'local',DB_PASSWORD:'fixture',DB_NAME:'test' });
  assert.equal(local.host,'localhost'); assert.equal(local.ssl,false);
  const remote = databaseConfig({ DATABASE_URL:'postgresql://fixture:fixture@db.example/test',DB_HOST:'ignored' });
  assert.equal(remote.host,undefined); assert.equal(remote.ssl.rejectUnauthorized,true);
  assert.throws(() => databaseConfig({DATABASE_URL:'postgresql://db.example/test?sslmode=no-verify'}));
  assert.throws(() => databaseConfig({DB_SSL_MODE:'no-verify'}));
  assert.equal(databaseConfig({DB_SSL_MODE:'verify-full'}).ssl.rejectUnauthorized,true);
});
test('CORS accepts exact configured origins, rejects wildcard and URL paths', () => {
  assert.deepEqual(allowedOrigins({}),['http://localhost:5173']);
  assert.deepEqual(allowedOrigins({NODE_ENV:'production'}),[]);
  assert.deepEqual(allowedOrigins({CORS_ORIGINS:'https://web.example, https://other.example', CORS_ORIGIN:'http://localhost:5173'}),['https://web.example','https://other.example']);
  for (const origin of ['*','https://web.example/path','https://user:pass@web.example']) assert.throws(()=>allowedOrigins({CORS_ORIGINS:origin}));
});
test('process health is independent of database availability', () => {
  let body;
  healthHandler({ query() { assert.fail('Liveness must not query DB'); } })({}, { json(value) { body = value; } });
  assert.deepEqual(body, { status: 'ok' });
});
test('memory cache behavior is preserved outside ignored runtime directory', () => {
  const cache=require('../services/memoryCache');cache.clear();cache.set('fixture',42);
  assert.equal(cache.get('fixture'),42);cache.delete('fixture');assert.equal(cache.has('fixture'),false);
  const backend=path.resolve(__dirname,'..');
  for (const dir of ['services','controllers','routes','providers','sources','integrations']) {
    for(const file of fs.readdirSync(path.join(backend,dir),{recursive:true}).filter(file=>file.endsWith('.js'))) {
      assert.ok(!/require\(['"][^'"]*\/cache\//.test(fs.readFileSync(path.join(backend,dir,file),'utf8')),file);
    }
  }
});
test('migration runner locks before inspecting schema and unlocks on failure', async () => {
  const { migrate } = require('../scripts/migrate');
  const calls=[];
  const fake={connect:async()=>({query:async sql=>{calls.push(sql);if(sql.includes('CREATE TABLE'))throw new Error('fixture');},release(){calls.push('release');}}),end:async()=>calls.push('end')};
  const approved = require('./helpers/reconciliationMigrationEnv.cjs')();
  await assert.rejects(migrate(fake, { ...approved, SESSION_SECURITY_MIGRATION_ENABLED: 'true',
    SESSION_SECURITY_MIGRATION_APPROVAL: 'I_APPROVE_022_WITH_ORDERED_PENDING_MIGRATIONS',
    SESSION_SECURITY_EXPECTED_DB_IDENTITY: approved.RECONCILIATION_EXPECTED_DB_IDENTITY }));
  assert.equal(calls[0],'SELECT pg_advisory_lock(319003)');
  assert.deepEqual(calls.slice(-3),['SELECT pg_advisory_unlock(319003)','release','end']);
});
test('staging API URL rejects missing or loopback URL; production gate stays closed', async () => {
  const { validateStagingApiUrl }=await import('../../frontend/scripts/validate-staging-env.mjs');
  for(const value of ['', 'http://localhost:5000/api','https://localhost/api','https://api.example','https://user:secret@api.example/api'])assert.throws(()=>validateStagingApiUrl(value));
  validateStagingApiUrl('https://api.example/api');
  assert.equal(require('../services/productionGateService').state().productionSalesEnabled,false);
});
