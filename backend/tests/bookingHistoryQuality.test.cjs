const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./offlineNetwork.cjs');
const {publicBooking,publicDetails}=require('../services/bookingHistoryPublic');

test('5D public historical snapshot allowlist and no tour substitution',()=>{
  const row={id:12,user_id:7,stored_currency:null,currency:'KZT',hotel:'CURRENT',image:'CURRENT',price:999,
    provider_response:{secret:'PRIVATE'},provider_last_error:{message:'PRIVATE'},payment_idempotency_key:'PRIVATE',payment_metadata:{realCharge:false,secret:'PRIVATE'},gateway_provider:'sandbox',
    offer_snapshot:{name:'Stored',price:123,currency:'EUR',roomName:'Exact',boardCode:'AI',checkIn:'2026-10-05',rateKey:'PRIVATE',offerToken:'PRIVATE',raw:{secret:'PRIVATE'},occupancy:{adults:2,rooms:1,secret:'PRIVATE'}},search_filters:{nights:7,token:'PRIVATE'}};
  const before=JSON.stringify(row),out=publicBooking(row);
  assert.equal(out.hotel,'Stored');assert.equal(out.image,'');assert.equal(out.currency,'EUR');assert.equal(out.offer_snapshot.roomName,'Exact');assert.equal(out.offer_snapshot.price,123);assert.equal(out.payment_no_real_charge,true);assert.equal(out.user_id,undefined);assert.equal(out.price,undefined);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|rateKey|offerToken|payment_idempotency_key/);assert.equal(JSON.stringify(row),before);
  const empty=publicBooking({...row,offer_snapshot:{},stored_currency:null});assert.equal(empty.hotel,'');assert.equal(empty.currency,null);
});
test('5D timestamps, image snapshot fallback and payment evidence',()=>{
  const row={id:1,booking_date:'2026-09-27 23:30:00',voucher_generated_at:new Date(NaN),offer_snapshot:{images:['stored.jpg']}};
  assert.equal(publicBooking(row).booking_date,row.booking_date);assert.equal(publicBooking(row).voucher_generated_at,null);assert.equal(publicBooking(row).image,'stored.jpg');
  for(const realCharge of [false,true,undefined])assert.equal(publicBooking({...row,gateway_provider:'sandbox',payment_metadata:{realCharge}}).payment_no_real_charge,realCharge===false);
  assert.equal(publicBooking({...row,payment_metadata:{realCharge:false}}).payment_no_real_charge,false);
  const details=publicDetails(row,[{id:1,event_type:'booking_created',occurred_at:'2026-09-27',metadata:{secret:'PRIVATE'},title:'PRIVATE',description:'PRIVATE',user_id:9}]);
  assert.doesNotMatch(JSON.stringify(details),/PRIVATE|user_id/);assert.deepEqual(details.events,[{id:1,event_type:'booking_created',occurred_at:'2026-09-27'}]);
});
test('5D controllers enforce own list, details owner/admin, read-only and fixed errors',async t=>{
  const pool=require('../db'),events=require('../services/bookingEventService'),logger=require('../utils/logger');
  const controller=require('../controllers/bookingController');
  const client=require('../integrations/hotelbeds/client');
  let providerCalls=0;
  for(const method of ['availability','checkRates','contentHotels','contentHotelDetails','createBooking','getBooking','listBookings','cancelBooking'])t.mock.method(client,method,()=>{providerCalls++;throw Error('FORBIDDEN');});
  let row={id:12,user_id:7,offer_snapshot:{name:'Stored'},provider_response:{secret:'PRIVATE'}},fail=false,eventCalls=0;
  const queries=[];
  t.mock.method(pool,'query',async(sql,args)=>{queries.push({sql,args});assert.match(sql,/SELECT/);assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE/);if(fail)throw Error('PRIVATE SQL');return {rows:row?[row]:[]};});
  t.mock.method(events,'listEvents',async id=>{eventCalls++;assert.equal(id,12);return [];});
  t.mock.method(logger,'error',()=>{});
  const call=async(fn,user={id:7})=>{const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await fn({user,params:{id:12}},res);return res;};
  await t.test('list SQL scopes to authenticated owner even for admin',async()=>{for(const user of [{id:7},{id:9,role:'admin'}]){const res=await call(controller.getMyBookings,user);assert.equal(res.code,200);assert.match(queries.at(-1).sql,/WHERE b.user_id = \$1/);assert.deepEqual(queries.at(-1).args,[user.id]);assert.doesNotMatch(JSON.stringify(res.data),/PRIVATE|user_id/);}});
  await t.test('other user denied before event read',async()=>{const before=eventCalls;const res=await call(controller.getMyBookingDetails,{id:8});assert.equal(res.code,403);assert.equal(eventCalls,before);assert.equal(res.data.booking,undefined);});
  await t.test('owner and existing admin access retained',async()=>{for(const user of [{id:7},{id:8,role:'admin'}]){const res=await call(controller.getMyBookingDetails,user);assert.equal(res.code,200);assert.equal(res.data.booking.id,12);assert.doesNotMatch(JSON.stringify(res.data),/PRIVATE|user_id/);}});
  await t.test('missing booking does not read events',async()=>{row=null;const before=eventCalls;assert.equal((await call(controller.getMyBookingDetails)).code,404);assert.equal(eventCalls,before);});
  await t.test('database errors remain fixed safe response',async()=>{fail=true;for(const fn of [controller.getMyBookings,controller.getMyBookingDetails]){const res=await call(fn);assert.equal(res.code,500);assert.doesNotMatch(JSON.stringify(res.data),/PRIVATE|SQL/);}});
  assert.equal(providerCalls,0);
});
test('5D public event dates preserve database calendar without timezone conversion',async t=>{
  const pool=require('../db'),events=require('../services/bookingEventService');
  t.mock.method(pool,'query',async(sql,args)=>{
    assert.match(sql,/occurred_at::text AS occurred_at/);assert.doesNotMatch(sql,/metadata|description|user_id/);assert.deepEqual(args,[12]);
    return {rows:[{id:1,event_type:'booking_created',occurred_at:'2026-09-27 23:30:00'}]};
  });
  assert.equal((await events.listEvents(12,{publicHistory:true}))[0].occurred_at,'2026-09-27 23:30:00');
});
test('5D missing/invalid bearer never reaches private route handler',()=>{
  const middleware=require('../middleware/authMiddleware');
  const previous=process.env.JWT_SECRET;
  process.env.JWT_SECRET='synthetic-offline-booking-history-secret';
  try {
  for(const header of [undefined,'','Bearer ','Bearer invalid']){let next=false;const res={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};middleware({get:()=>header},res,()=>{next=true;});assert.equal(res.code,401);assert.equal(next,false);}
  } finally {if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
});
