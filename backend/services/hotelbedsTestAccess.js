// TEST-only persistent gates. Old global 3M state is deliberately not trusted.
const {randomUUID} = require('crypto');
const {AsyncLocalStorage} = require('async_hooks');
const jobs = Object.freeze({content:'hotelbeds_test_access_content', booking_read:'hotelbeds_test_access_booking_read'});
const categories = ['status','content','availability','checkrate'];
const circuitFor = category => category === 'content' ? 'content' : categories.includes(category) ? 'booking_read' : null;
const failure = code => Object.assign(new Error(code === 'HOTELBEDS_AUTH_BLOCKED'
  ? 'Hotelbeds TEST временно недоступен. Последняя проверка доступа завершилась ошибкой авторизации.'
  : code === 'HOTELBEDS_UNKNOWN_BLOCKED' ? 'Hotelbeds TEST временно недоступен. Доступ ещё не подтверждён контрольной проверкой.'
  : 'Hotelbeds TEST временно недоступен. Защита доступа недоступна или запрос уже выполняется.'), {code,status:503,provider:'hotelbeds'});
function controlSpec(operation, scopeId) {
  if (operation === 'CONTENT' && typeof scopeId === 'string') {
    require('./hotelbedsTestContent').selection(process.env, scopeId);
    return {circuit:'content',category:'content',operation,scopeId,limit:3};
  }
  if (operation === 'AVAILABILITY_3424' && scopeId === undefined) return {circuit:'booking_read',category:'availability',operation,scopeId:null,limit:1};
  throw failure('HOTELBEDS_CONTROL_INVALID');
}
function create(pool = require('../db')) {
  // Context carries an already consumed DB permit; it never authorizes on its own.
  const context = new AsyncLocalStorage();
  async function transaction(circuit, fn) {
    if (!jobs[circuit]) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
    let db;
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      await db.query("INSERT INTO provider_job_state(job,environment,details) VALUES($1,'test','{\"state\":\"UNKNOWN_BLOCKED\"}') ON CONFLICT DO NOTHING",[jobs[circuit]]);
      const row = (await db.query("SELECT details FROM provider_job_state WHERE job=$1 AND environment='test' FOR UPDATE",[jobs[circuit]])).rows[0];
      if (!['READY','AUTH_BLOCKED','UNKNOWN_BLOCKED'].includes(row?.details?.state)) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
      const result = await fn(row.details,db);
      await db.query("UPDATE provider_job_state SET details=$2::jsonb WHERE job=$1 AND environment='test'",[jobs[circuit],JSON.stringify(row.details)]);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db?.query('ROLLBACK').catch(()=>{});
      throw error.code?.startsWith('HOTELBEDS_') ? error : failure('HOTELBEDS_ACCESS_UNAVAILABLE');
    } finally {db?.release();}
  }
  function checkReady(s) {
    if (s.state !== 'READY') throw failure(s.state === 'AUTH_BLOCKED' ? 'HOTELBEDS_AUTH_BLOCKED' : 'HOTELBEDS_UNKNOWN_BLOCKED');
    if (s.inFlight) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
  }
  async function storage(db) {
    await db.query('SELECT id FROM system_events LIMIT 0');
    const result = await db.query("SELECT has_table_privilege('system_events','INSERT') AND has_sequence_privilege(pg_get_serial_sequence('system_events','id'),'USAGE') AS writable");
    if (!result.rows[0]?.writable) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
  }
  async function inspect() {
    const circuits = {};
    for (const circuit of Object.keys(jobs)) circuits[circuit] = await transaction(circuit,async s=>({
      state:s.state,openedAt:s.openedAt || null,reason:s.reason || null,
      lastAuthErrorAt:s.lastAuthErrorAt || null,lastAuthErrorCategory:s.lastAuthErrorCategory || null,
      lastSuccessAt:s.lastSuccessAt || null,lastSuccessCategory:s.lastSuccessCategory || null,
      armed:Boolean(s.permit),operation:s.permit?.operation || (circuit === 'content' ? 'CONTENT' : 'AVAILABILITY_3424'),
      scopeId:s.permit?.scopeId || null,inFlight:Boolean(s.inFlight),
    }));
    try {
      const rows = (await pool.query(`SELECT metadata->>'category' AS category,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day',NOW() AT TIME ZONE 'UTC'))::int AS today,
        COUNT(*)::int AS "last24h" FROM system_events WHERE category='hotelbeds_test_read'
        AND created_at >= (NOW() AT TIME ZONE 'UTC')-INTERVAL '24 hours' GROUP BY metadata->>'category'`)).rows;
      const breakdown = Object.fromEntries(categories.map(c=>[c,{today:0,last24h:0}]));
      for (const row of rows) if (categories.includes(row.category)) breakdown[row.category] = {today:Number(row.today),last24h:Number(row.last24h)};
      const ready = Object.values(circuits).filter(s=>s.state === 'READY' && !s.inFlight).length;
      return {circuits,summary:ready === 2 ? 'READY' : ready === 1 ? 'PARTIAL' : 'BLOCKED',
        today:Object.values(breakdown).reduce((n,r)=>n+r.today,0),last24h:Object.values(breakdown).reduce((n,r)=>n+r.last24h,0),breakdown};
    } catch {throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');}
  }
  async function assertAvailable(category = 'availability') {
    return transaction(circuitFor(category),async s=>checkReady(s));
  }
  async function arm(operation,scopeId) {
    const spec = controlSpec(operation,scopeId);
    return transaction(spec.circuit,async s=>{
      if (s.state === 'READY' || s.inFlight || s.permit) throw failure('HOTELBEDS_PERMIT_NOT_ARMABLE');
      s.permit = {operation:spec.operation,scopeId:spec.scopeId,armedAt:new Date().toISOString()};
      return {status:'CONTROL REQUEST ARMED',operation:spec.operation,scopeId:spec.scopeId};
    });
  }
  async function withControl(operation,scopeId,fn) {
    const spec = controlSpec(operation,scopeId);
    const token = randomUUID();
    await transaction(spec.circuit,async(s,db)=>{
      await storage(db);
      if (s.inFlight || s.state === 'READY' || s.permit?.operation !== operation || s.permit?.scopeId !== spec.scopeId) throw failure('HOTELBEDS_PERMIT_NOT_ARMABLE');
      delete s.permit;
      s.consumedAt = new Date().toISOString();
      s.inFlight = token; s.requests = 0; s.operationFailed = false;
    });
    let success = false;
    try {
      const result = await context.run({...spec,token},fn);
      success = true;
      return result;
    } finally {
      const recovered = await transaction(spec.circuit,async s=>{
        if (s.inFlight !== token || s.requestPending) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
        if (success && !s.operationFailed && s.requests > 0) {
          s.state = 'READY'; s.reason = null;
          s.lastSuccessAt = new Date().toISOString(); s.lastSuccessCategory = spec.category;
        }
        delete s.inFlight; delete s.requests; delete s.operationFailed;
        return s.state === 'READY';
      });
      if (success && !recovered) throw failure('HOTELBEDS_CONTROL_FAILED');
    }
  }
  async function begin(category) {
    const circuit = circuitFor(category), control = context.getStore();
    return transaction(circuit,async(s,db)=>{
      await storage(db);
      if (control) {
        if (control.circuit !== circuit || control.category !== category || s.inFlight !== control.token || s.requestPending || s.operationFailed || s.requests >= control.limit) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
        s.requests++;
      } else {
        checkReady(s);
        s.inFlight = randomUUID();
      }
      s.requestPending = true;
      return {token:s.inFlight,circuit,category,control:Boolean(control)};
    });
  }
  async function finish(ticket,{attempted,success,httpStatus,errorCategory,duration}) {
    return transaction(ticket.circuit,async(s,db)=>{
      if (s.inFlight !== ticket.token || !s.requestPending) throw failure('HOTELBEDS_ACCESS_UNAVAILABLE');
      if (attempted) {
        const code = ['AUTH_ERROR','RATE_LIMIT','TIMEOUT','PROVIDER_UNAVAILABLE','RATE_NOT_AVAILABLE','INVALID_REQUEST'].includes(errorCategory) ? errorCategory : null;
        const status = Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null;
        await db.query(`INSERT INTO system_events(level,category,code,message,status_code,duration_ms,metadata,created_at)
          VALUES('info','hotelbeds_test_read',$1,'Hotelbeds TEST read observation',$2,$3,$4::jsonb,NOW() AT TIME ZONE 'UTC')`,
        [code,status,Math.max(0,Math.round(duration || 0)),JSON.stringify({provider:'hotelbeds',environment:'test',category:ticket.category,success:Boolean(success)})]);
        const now = new Date().toISOString();
        if (status === 403 && code === 'AUTH_ERROR') {
          if (s.state !== 'AUTH_BLOCKED') s.openedAt = now;
          s.state = 'AUTH_BLOCKED'; s.reason = 'HOTELBEDS_AUTH_ERROR';
          s.lastAuthErrorAt = now; s.lastAuthErrorCategory = ticket.category; delete s.permit;
        } else if (success && !ticket.control) {
          s.lastSuccessAt = now; s.lastSuccessCategory = ticket.category;
        }
      }
      if (ticket.control && (!attempted || !success)) s.operationFailed = true;
      delete s.requestPending;
      if (!ticket.control) delete s.inFlight;
    });
  }
  return {inspect,assertAvailable,arm,withControl,begin,finish};
}
module.exports = {...create(),create,failure,controlSpec,jobs};
