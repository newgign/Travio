// Local PostgreSQL only. All schema/data fixtures live in one rolled-back transaction.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const dbHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : process.env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost)) throw new Error('Acceptance fixtures require a local database');
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
for (const key of ['HOTELBEDS_ENABLED', 'HOTELBEDS_BOOKING_ENABLED', 'HOTELBEDS_LIVE_BOOKING_ENABLED', 'HOT_DEALS_MONITOR_ENABLED', 'HOTELBEDS_CONTENT_SYNC_ENABLED', 'PRODUCTION_SALES_ENABLED', 'REAL_CHARGES_ENABLED', 'REAL_REFUNDS_ENABLED']) process.env[key] = 'false';
process.env.HOTELBEDS_ENV = 'test';
process.env.PAYMENTS_MODE = 'disabled';
process.env.PAYMENTS_PROVIDER = 'none';
const pool = require('../db');

test('Sprint 3C local HTTP acceptance with isolated PostgreSQL and rollback', async t => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  let server;
  try {
    await client.query('BEGIN');
    const schema = 'acceptance_' + crypto.randomBytes(8).toString('hex');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const directory = path.join(__dirname, '../../database/migrations');
    for (const file of fs.readdirSync(directory).filter(x => x.endsWith('.sql')).sort()) await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
    pool.query = client.query.bind(client);
    const app = express();
    app.use(express.json());
    app.use('/auth', require('../routes/auth'));
    app.use('/favorites', require('../routes/favorites'));
    app.use('/bookings', require('../routes/bookingRoutes'));
    app.use('/travelers', require('../routes/travelers'));
    app.use('/admin', require('../routes/adminOperations'));
    app.get('/health', require('../routes/stagingHealth').healthHandler(pool));
    app.get('/limited', require('../middleware/rateLimit').createRateLimiter({ max: 1 }), (req,res)=>res.json({ok:true}));
    app.get('/failure', () => { throw new Error('SELECT secret FROM /private/server.js'); });
    app.use(require('../middleware/errorHandler'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(route, { body, token, method = body ? 'POST' : 'GET' } = {}) {
      const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      assert.equal(/"(?:password|password_hash)"\s*:|\$2[aby]\$/.test(JSON.stringify(data)), false, 'password fields must not leave API');
      return { status: res.status, data };
    }
    const password = crypto.randomBytes(18).toString('hex');
    let a, b;
    await t.test('register validates email, fields and passwords; ignores injected role', async () => {
      for (const email of ['bad-email', 'a@@example.com', 'a b@example.com']) assert.equal((await call('/auth/register', {body:{full_name:'Fixture',email,password}})).status,400);
      assert.equal((await call('/auth/register',{body:{}})).status,400);
      assert.equal((await call('/auth/register',{body:{full_name:'Fixture',email:'short@example.com',password:'short'}})).status,400);
      for (const email of ['a@example.com','b@example.com']) {
        const r=await call('/auth/register',{body:{full_name:email,email:` ${email.toUpperCase()} `,password,role:'admin'}});
        assert.equal(r.status,201); assert.equal(r.data.user.role,'user'); assert.equal(r.data.user.email,email);
      }
      assert.equal((await call('/auth/register',{body:{full_name:'Duplicate',email:' A@EXAMPLE.COM ',password}})).status,409);
    });
    await t.test('login normalization, wrong/unknown password and no password leakage', async () => {
      a=(await call('/auth/login',{body:{email:' A@EXAMPLE.COM ',password}})).data;
      b=(await call('/auth/login',{body:{email:'b@example.com',password}})).data;
      assert.ok(a.token && b.token);
      const wrong=await call('/auth/login',{body:{email:'a@example.com',password:'wrong'}});
      const unknown=await call('/auth/login',{body:{email:'unknown@example.com',password}});
      assert.equal(wrong.status,401); assert.deepEqual(wrong,unknown);
    });
    await t.test('admin router rejects anonymous/user; role and permission allow admin', async () => {
      for (const route of ['/admin/overview','/admin/system/status','/admin/providers/hotelbeds']) {
        assert.equal((await call(route)).status,401);
        assert.equal((await call(route,{token:a.token})).status,403);
      }
      let passes=0;
      const req={user:{role:'admin'}};
      const res={status(){throw new Error('Admin unexpectedly denied');}};
      require('../middleware/requireRole')('admin')(req,res,()=>passes++);
      require('../middleware/requirePermission')('admin.operations.read')(req,res,()=>passes++);
      assert.equal(passes,2);
    });
    await t.test('profile ownership and protected fields; default language; no invented DOB', async () => {
      const r=await call('/auth/profile',{method:'PUT',token:a.token,body:{full_name:'Updated fixture',phone:'',role:'admin',id:b.user.id,permissions:['*'],password:'ignored',email:'b@example.com'}});
      assert.equal(r.status,200); assert.equal(r.data.user.preferred_language,'ru');
      assert.equal(r.data.user.role,'user'); assert.equal(r.data.user.id,a.user.id); assert.equal(r.data.user.email,'a@example.com'); assert.equal(r.data.user.phone,null);
      assert.equal((await call('/auth/profile',{token:b.token})).data.full_name,'b@example.com');
      assert.equal((await call('/auth/login',{body:{email:'a@example.com',password}})).status,200);
      const traveler=await call('/travelers',{token:a.token,body:{first_name:'Fixture',last_name:'Traveler',birth_date:''}});
      assert.equal(traveler.status,201); assert.equal(traveler.data.birth_date,null);
      assert.equal((await call('/travelers',{token:b.token})).data.length,0);
      assert.equal((await call(`/travelers/${traveler.data.id}`,{method:'DELETE',token:b.token})).status,404);
    });
    await t.test('favorites real SQL isolation and foreign deletion denied', async () => {
      for(const user of [a.user,b.user]) await client.query('INSERT INTO favorites(user_id,provider,provider_hotel_id,hotel_data) VALUES($1,$2,$3,$4)',[user.id,'fixture','same-hotel',JSON.stringify({name:`Owner ${user.id}`})]);
      for(const user of [a,b]) {
        const r=await call('/favorites',{token:user.token}); assert.equal(r.data.data.length,1); assert.equal(r.data.data[0].name,`Owner ${user.user.id}`);
      }
      assert.equal((await call('/favorites/fixture/same-hotel',{token:a.token,method:'DELETE'})).status,200);
      assert.equal((await call('/favorites',{token:a.token})).data.data.length,0);
      assert.equal((await call('/favorites',{token:b.token})).data.data.length,1);
      assert.equal((await call('/favorites/fixture/same-hotel',{token:a.token,method:'DELETE'})).status,404);
    });
    await t.test('bookings empty/list/detail ownership with rollback-only fixtures', async () => {
      assert.deepEqual((await call('/bookings/me',{token:a.token})).data,[]);
      const ids=[];
      for(const user of [a.user,b.user]) ids.push((await client.query("INSERT INTO bookings(user_id,first_name,last_name,phone,email,provider) VALUES($1,'Fixture','Only','','fixture@example.com','fixture') RETURNING id",[user.id])).rows[0].id);
      const list=await call('/bookings/me',{token:a.token}); assert.equal(list.data.length,1); assert.equal(list.data[0].id,ids[0]);
      assert.equal((await call(`/bookings/${ids[1]}/details`,{token:a.token})).status,403);
      assert.equal((await call('/bookings/me')).status,401);
      assert.equal((await call('/bookings',{token:a.token})).status,403);
    });
    await t.test('invalid and genuinely expired signed tokens rejected', async () => {
      for(const token of ['invalid',jwt.sign({id:a.user.id,role:'user'},process.env.JWT_SECRET,{expiresIn:-1})]) assert.equal((await call('/favorites',{token})).status,401);
    });
    await t.test('production safety, health, safe 429 and 500', async () => {
      const gate=require('../services/productionGateService').state();
      assert.equal(gate.enforcedSafeMode,true); assert.equal(gate.realChargesEnabled,false); assert.equal(gate.realRefundsEnabled,false); assert.equal(gate.productionSalesEnabled,false);
      assert.equal(require('../services/paymentGatewayService').readiness().mode,'disabled');
      assert.equal((await call('/health')).data.database.ok,true);
      assert.equal((await call('/limited')).status,200); assert.equal((await call('/limited')).status,429);
      const failure=await call('/failure'); assert.equal(failure.status,500); assert.equal(JSON.stringify(failure.data).includes('SELECT'),false); assert.equal(JSON.stringify(failure.data).includes('/private'),false);
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    pool.query=originalQuery;
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
