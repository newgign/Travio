import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const require = createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');
const { publicBooking } = require('../../backend/services/bookingHistoryPublic');

test('5D stored booking history quality', async t => {
  const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  const oldStorage=globalThis.localStorage, oldWindow=globalThis.window;
  let token='owner';
  globalThis.localStorage={getItem:key=>key==='token'?token:key==='user'?'{}':null};
  globalThis.window=new EventTarget();
  const requests=[];
  const row={id:12,provider:'hotelbeds',provider_status:'CONFIRMED',status:'Подтверждена',booking_date:'2026-09-27 23:30:00',total_amount:'1014.42',stored_currency:'EUR',currency:'EUR',people:3,
    provider_client_reference:'TRAVIO-12',provider_booking_id:'TEST-12',payment_status:'test',
    offer_snapshot:{name:'Stored Grand Kaptan',country:'Turkey',city:'ALANYA',checkIn:'2026-10-05',checkOut:'2026-10-12',nights:7,adults:2,children:1,occupancy:{rooms:1},roomName:'Side Sea View',boardCode:'AI',priceEnvironment:'test',rateKey:'SECRET',offerToken:'SECRET'},
    provider_response:{secret:'SECRET'},payment_metadata:{secret:'SECRET'},price:999999};
  const booking=publicBooking(row), data={success:true,booking,events:[{id:1,event_type:'booking_created',occurred_at:'2026-09-27 23:30:00'}]};
  let failure=0;
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const path=new URL(url,'http://localhost').pathname.replace(/^\/api/,'');
    assert.equal(options.method || 'GET','GET');
    assert.ok(['/bookings/me','/bookings/12/details'].includes(path),'unexpected network '+path);
    requests.push(path);
    return {ok:!failure,status:failure || 200,text:async()=>JSON.stringify(failure?{message:'SECRET SQL https://private/token'}:path.endsWith('/me')?[booking]:data)};
  });
  try {
    const {MyBookingsView:List}=await server.ssrLoadModule('/src/pages/MyBookings.jsx');
    const {BookingDetailsView:Details}=await server.ssrLoadModule('/src/pages/BookingDetails.jsx');
    const p=await server.ssrLoadModule('/src/utils/savedAccountPresentation.js');
    const {createBookingHistory,bookingHistory}=await server.ssrLoadModule('/src/services/bookingHistory.js');
    const {authReturnPath}=await server.ssrLoadModule('/src/utils/authPresentation.js');
    const render=(View,props)=>renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(View,props)));
    const list=(status='ready',bookings=[booking],extra={})=>render(List,{status,bookings,...extra});
    const details=(status='ready',value=data)=>render(Details,{status,data:value});
    const history=(api)=>createBookingHistory({token:'owner',readToken:()=>token,...(api?{api}:{})});
    for(const [label,view] of [['list',list],['details',details]]) {
      await t.test(label+' guest has login and no private flash',()=>{const html=view('guest');assert.match(html,/Войдите в аккаунт|href="\/login"/);assert.doesNotMatch(html,/Stored Grand|1\s*014/);});
      await t.test(label+' loading has accessible status and hides old data',()=>{const html=view('loading');assert.match(html,/role="status"/);assert.doesNotMatch(html,/Stored Grand/);});
      await t.test(label+' safe error and retry',()=>{const html=view('error');assert.match(html,/role="alert"/);assert.match(html,/Повторить/);assert.doesNotMatch(html,/SECRET|Stored Grand/);});
      await t.test(label+' expired authorization hides data',()=>{assert.doesNotMatch(view('auth'),/Stored Grand/);assert.match(view('auth'),/Войти/);});
    }
    await t.test('empty explains no saved records and links to search',()=>{const html=list('ready',[]);assert.match(html,/Сохранённых записей заказов пока нет/);assert.match(html,/href="\/#home-search"/);});
    const expected=[['hotel',/Stored Grand Kaptan/],['destination',/ALANYA/],['check in',/5 октября 2026/],['check out',/12 октября 2026/],['nights',/7 ночей/],['adults',/2 взрослых/],['children',/1 ребёнок/],['room',/Side Sea View/],['board',/Всё включено/],['total',/1\s*014,42/],['currency',/€/],['created',/27 сентября 2026/],['test',/Тестовая запись/]];
    for(const [name,pattern] of expected) await t.test('stored '+name+' in list and details',()=>{assert.match(list(),pattern);assert.match(details(),pattern);});
    await t.test('status mappings are shared and unknown is neutral',()=>{
      for(const [status,item] of Object.entries(p.providerBookingStatuses))assert.equal(p.bookingStatus({...booking,provider_status:status}).label,item.label);
      for(const [status,item] of Object.entries(p.localBookingStatuses))assert.equal(p.bookingStatus({provider:'mock',status}).label,item.label);
      const html=details('ready',{booking:{...booking,provider_status:'PRIVATE_UNKNOWN'},events:[]});assert.match(html,/Статус неизвестен/);assert.doesNotMatch(html,/PRIVATE_UNKNOWN/);
    });
    await t.test('test disclosure does not imply a live booking',()=>{assert.match(details(),/не подтверждает реальную бронь Hotelbeds/);assert.match(list(),/не подтверждает реальную бронь Hotelbeds/);});
    await t.test('missing environment never invents test or no-charge evidence',()=>{
      const b=publicBooking({...row,payment_status:null,provider_booking_id:null,offer_snapshot:{}});
      const html=details('ready',{booking:b});assert.doesNotMatch(html,/Тестовая запись|Реального списания денег не было/);assert.match(html,/Режим создания не подтверждён/);assert.match(html,/Номер подтверждения поставщика не сохранён/);
    });
    await t.test('no-charge only with explicit stored sandbox evidence',()=>{
      for(const realCharge of [true,false,undefined]) {
        const b=publicBooking({...row,gateway_provider:'sandbox',payment_metadata:{realCharge}});
        assert.equal(details('ready',{booking:b}).includes('Реального списания денег не было'),realCharge===false);
      }
    });
    await t.test('price is stored not current, no projected price fallback',()=>{
      assert.match(details(),/Стоимость заказа/);assert.match(details(),/не текущая цена/);assert.doesNotMatch(details()+list(),/999\s*999/);
      assert.equal(p.bookingAmount({...booking,total_amount:null,quoted_amount:null,price:999999}),null);
      assert.equal(p.bookingAmount({...booking,currency:null}),null);
    });
    await t.test('historical snapshot preserved, current tour ignored',()=>{
      const before=JSON.stringify(row);const b=publicBooking({...row,hotel:'CURRENT',city:'CURRENT',country:'CURRENT',image:'CURRENT'});
      assert.equal(b.hotel,'Stored Grand Kaptan');assert.equal(b.offer_snapshot.roomName,'Side Sea View');assert.equal(b.total_amount,'1014.42');assert.equal(JSON.stringify(row),before);
      const absent=publicBooking({...row,offer_snapshot:{},hotel:'CURRENT',image:'CURRENT'});assert.equal(absent.hotel,'');assert.equal(absent.image,'');
    });
    await t.test('no raw secrets/errors/provider payload in markup',()=>{assert.doesNotMatch(list()+details(),/SECRET|rateKey|offerToken|payment_metadata|provider_response|idempotency/);});
    await t.test('document marker does not become a download or generated voucher',()=>{
      for(const date of [null,'2026-09-27']) {const html=details('ready',{booking:{...booking,voucher_generated_at:date}});assert.match(html,/Ваучер недоступен/);assert.doesNotMatch(html,/href="[^\"]*voucher|Скачать|onClick/);}
    });
    await t.test('payment and refund controls absent, persisted state factual',()=>{const html=details();assert.match(html,/Оплата и возвраты недоступны/);assert.match(html,/Тестовый платёж/);assert.doesNotMatch(html,/>Оплатить|Повторить оплату|Запросить.*возврат/);});
    await t.test('cancellation is a historical state, no action',()=>{const html=details('ready',{booking:{...booking,provider_status:'CANCELLED',cancelled_at:'2026-09-27'}});assert.match(html,/Отмена отмечена в сохранённой записи/);assert.match(html,/Отмена недоступна/);assert.doesNotMatch(html,/>Отменить/);});
    await t.test('unknown payment/event states never expose raw enums',()=>{assert.equal(p.bookingEventLabel('SECRET'),'Событие истории');assert.doesNotMatch(p.bookingPayment({payment_status:'SECRET'}),/SECRET/);});
    await t.test('bad dates/counts and objects render neutral fallbacks',()=>{
      const html=details('ready',{booking:{id:1,hotel:{bad:true},offer_snapshot:{checkIn:'2026-02-31',nights:'bad',roomName:{},boardCode:{},adults:NaN},booking_date:'bad'}});
      assert.doesNotMatch(html,/Invalid Date|NaN|undefined|\[object Object\]/);assert.match(html,/Не сохранена/);
    });
    await t.test('nested stored occupancy and date/room aliases',()=>{
      const facts=p.bookingFacts({offer_snapshot:{stay:{checkIn:'2026-10-05',checkOut:'2026-10-12'},occupancy:{adults:2,children:1,rooms:2},room_type:'Stored Type',board_code:'BB'}});
      assert.equal(facts.rooms,2);assert.match(facts.guests,/2 взрослых/);assert.equal(facts.room,'Stored Type');assert.equal(facts.board,'Завтрак');
    });
    await t.test('list to details and safe back link',()=>{assert.match(list(),/href="\/my-bookings\/12"/);assert.match(details(),/href="\/my-bookings"/);});
    await t.test('direct auth return only allows bounded account IDs',()=>{
      for(const path of ['/bookings','/bookings/12','/my-bookings/12'])assert.equal(authReturnPath(path,'user'),path);
      for(const path of ['//evil','/bookings/12?token=x','/bookings/../admin','/bookings/0','/bookings/12/evil'])assert.equal(authReturnPath(path,'user'),'/');
    });
    await t.test('list/details load via own GET and cache retains list/filter on return',async()=>{
      const h=history();const start=requests.length;await h.list.load();h.setGroup('cancelled');const original=h.list.getSnapshot();const d=h.details('12');await d.load();assert.equal(h.details('12'),d);assert.equal(h.list.getSnapshot(),original);assert.equal(h.getGroup(),'cancelled');assert.deepEqual(requests.slice(start),['/bookings/me','/bookings/12/details']);
    });
    await t.test('concurrent loads deduplicate and expose loading',async()=>{
      let finish,calls=0;const h=history({getMyBookings:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
      const a=h.list.load(),b=h.list.load();await Promise.resolve();assert.equal(a,b);assert.equal(calls,1);assert.equal(h.list.getSnapshot().status,'loading');finish([booking]);await a;
    });
    await t.test('retry recovers both app list and details errors',async()=>{
      const h=history();for(const store of [h.list,h.details('12')]){failure=500;await store.load();assert.equal(store.getSnapshot().status,'error');assert.deepEqual(store.getSnapshot().items,[]);failure=0;await store.load();assert.equal(store.getSnapshot().status,'ready');}
    });
    await t.test('403 and 404 unify not-found, other failures stay retryable',async()=>{
      for(const status of [403,404,500,401]) {const h=history({getBookingDetails:async()=>{throw Object.assign(Error('SECRET'),{status});}});const d=h.details('12');await d.load();assert.equal(d.getSnapshot().status,status===401?'auth':status===500?'error':'ready');if(status===403||status===404)assert.match(details('ready',d.getSnapshot().items[0]),/Запись не найдена или недоступна/);}
    });
    await t.test('guest store does not dispatch private reads',async()=>{let calls=0;const h=createBookingHistory({token:null,readToken:()=>null,api:{getMyBookings:()=>calls++,getBookingDetails:()=>calls++}});await h.list.load();await h.details('12').load();assert.equal(calls,0);});
    await t.test('invalid IDs never reach API, mismatched response rejects',async()=>{let calls=0;const h=history({getBookingDetails:async()=>{calls++;return {success:true,booking:{id:99}};}});await h.details('../secret').load();assert.equal(calls,0);await h.details('12').load();assert.equal(h.details('12').getSnapshot().status,'error');});
    await t.test('late old-account response cannot populate history',async()=>{let finish;const h=history({getBookingDetails:()=>new Promise(resolve=>{finish=resolve;})});const d=h.details('12'),promise=d.load();await Promise.resolve();token='next';h.invalidate();finish(data);await promise;assert.deepEqual(d.getSnapshot().items,[]);assert.equal(h.getGroup(),'all');token='owner';});
    await t.test('global session event clears cache even after leaving page',async()=>{const h=bookingHistory(token);await h.list.load();token=null;window.dispatchEvent(new Event('travio-auth-changed'));assert.deepEqual(h.list.getSnapshot().items,[]);token='owner';assert.notEqual(bookingHistory(token),h);});
    await t.test('semantic headings/list/status/focus and mobile CSS contracts',async()=>{
      const html=list()+details();assert.match(html,/role="list"/);assert.match(html,/role="listitem"/);assert.match(html,/<dl/);assert.match(html,/<ol/);assert.match(html,/aria-label="Открыть запись/);assert.equal((details().match(/<h1>/g)||[]).length,1);assert.match(details(),/disabled=""/);
      const css=await readFile(new URL('../src/styles/BookingDetails.css',import.meta.url),'utf8');const account=await readFile(new URL('../src/styles/AccountPages.css',import.meta.url),'utf8');assert.match(css,/minmax\(0,1fr\)/);assert.match(css,/max-width:768px/);assert.match(css,/max-width:480px/);assert.match(css,/overflow-wrap:anywhere/);assert.match(account,/:focus-visible/);
    });
    await t.test('route protection and read-only wiring prohibit provider/mutation actions',async()=>{
      const {consumerTitle}=await server.ssrLoadModule('/src/utils/consumerTitle.js');
      assert.equal(consumerTitle('/bookings'),'Мои бронирования — Asedeliya');
      assert.equal(consumerTitle('/my-bookings/12'),'Детали заказа — Asedeliya');
      assert.equal(consumerTitle('/bookings/12'),'Детали заказа — Asedeliya');
      const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');assert.match(app,/path="\/bookings\/\:bookingId" element={<ProtectedRoute><BookingDetails/);
      const source=await readFile(new URL('../src/pages/BookingDetails.jsx',import.meta.url),'utf8');assert.doesNotMatch(source,/error\.message|err\.message|syncProviderBooking|cancelProviderBooking|simulateProviderCancellation|downloadBookingVoucher|paymentService|offerResolver|setInterval|selectedOffer/);
      const controller=await readFile(new URL('../../backend/controllers/bookingController.js',import.meta.url),'utf8');assert.match(controller,/WHERE b.user_id = \$1/);assert.match(controller,/req.user.role !== "admin" && Number\(booking.user_id\) !== Number\(req.user.id\)/);
    });
    for(const forbidden of ['Availability','Content','CheckRate','Booking','Cancellation']) await t.test('no '+forbidden+' provider network',()=>{assert.ok(requests.every(path=>path==='/bookings/me'||path==='/bookings/12/details'));});
  } finally {globalThis.localStorage=oldStorage;globalThis.window=oldWindow;await server.close();}
});

