import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, matchRoutes} from 'react-router-dom';
const require=createRequire(import.meta.url);
require('../../backend/tests/offlineNetwork.cjs');

test('3V help, contacts, factual notices and complete navigation offline',async t=>{
  let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('All HTTP including payment forbidden');});
  const client=require('../../backend/integrations/hotelbeds/client');
  const counters={status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0};
  for(const method of ['availability','contentHotels','contentHotelDetails','contentDestinations','contentCountries','status','checkRates','createBooking','getBooking','listBookings','cancelBooking']) {
    const key=method==='availability'?'availability':method.startsWith('content')?'content':method==='checkRates'?'checkrate':method==='cancelBooking'?'cancellation':method==='createBooking'?'booking':'status';
    t.mock.method(client,method,async()=>{counters[key]++;throw Error('Forbidden provider');});
  }
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  const render=(Component,props={})=>renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(Component,props)));
  try {
    const {HelpView}=await server.ssrLoadModule('/src/pages/Help.jsx');
    const {ContactsView}=await server.ssrLoadModule('/src/pages/Contacts.jsx');
    const {NotFoundView}=await server.ssrLoadModule('/src/pages/NotFound.jsx');
    const {default:Footer}=await server.ssrLoadModule('/src/components/Footer.jsx');
    const {default:Faq}=await server.ssrLoadModule('/src/components/FaqSection.jsx');
    const {helpArticles,faqItems}=await server.ssrLoadModule('/src/content/helpContent.js');
    const {site}=await server.ssrLoadModule('/src/config/site.js');
    const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
    const routes=[...app.matchAll(/path="([^"]+)"/g)].map(match=>({path:match[1]}));
    await t.test('every Footer/help internal destination has a real route and valid topic/anchor',()=>{
      const html=render(Footer)+render(HelpView)+Object.keys(helpArticles).map(topic=>render(HelpView,{topic})).join('');
      for(const [,href] of html.matchAll(/href="([^"]+)"/g)) {
        if(href.startsWith('tel:')||href.startsWith('mailto:'))continue;
        const [path,hash]=href.split('#');
        const matches=matchRoutes(routes,path);assert.ok(matches && matches[0].route.path!=='*',href);
        if(path.startsWith('/help/'))assert.ok(Object.hasOwn(helpArticles,path.slice(6)),href);
        if(hash)assert.ok(['faq','home-search'].includes(hash),href);
      }
      assert.match(render(Footer),/id="contacts"/);assert.match(render(Faq),/id="faq"/);
      assert.match(render(HelpView),/Темы помощи/);assert.equal(Object.keys(helpArticles).length,5);
    });
    await t.test('booking/prices/search describe disabled sales and hotel stay only',()=>{
      const booking=render(HelpView,{topic:'booking'});assert.match(booking,/Реальное бронирование и оплата сейчас отключены/);assert.match(booking,/не создают бронь/);assert.match(booking,/тариф потребуется повторно проверить/);
      assert.doesNotMatch(booking,/нажмите оплатить|мы подтвердим бронь|деньги будут списаны|rateKey|offerToken/i);
      const prices=render(HelpView,{topic:'prices'});assert.match(prices,/не является текущей ценой/);
      assert.match(render(HelpView,{topic:'search'}),/Перелёт, трансфер и страхование не считаются включёнными/);
    });
    await t.test('cancellation/privacy have no fabricated policies, deadlines or compliance',()=>{
      const cancellation=render(HelpView,{topic:'cancellation'});assert.match(cancellation,/сейчас недоступны/);assert.match(cancellation,/зависеть от конкретного тарифа/);
      assert.doesNotMatch(cancellation,/бесплатн|\d+\s*(дн|час|%)|гарантируем/i);
      const privacy=render(HelpView,{topic:'privacy'});assert.match(privacy,/не утверждённая юридическая политика/);assert.match(privacy,/localStorage/);assert.match(privacy,/не удаление аккаунта/);
      assert.doesNotMatch(privacy,/GDPR|соответствуем законодательству|никогда не переда|\d+\s*(лет|дней)/i);
    });
    await t.test('contacts use only existing config, accessible tel/mailto, no map/form',()=>{
      const html=render(ContactsView);
      assert.ok(html.includes(site.supportEmail));assert.ok(html.includes(site.supportPhone));assert.ok(html.includes(site.city));
      assert.ok(html.includes(`href="mailto:${site.supportEmail}"`));assert.ok(html.includes(`href="tel:${site.supportPhone.replace(/[^+\d]/g,'')}"`));
      assert.match(html,/aria-label="Позвонить:/);assert.match(html,/aria-label="Написать:/);
      assert.doesNotMatch(html,/<iframe|<form|24\/7|WhatsApp|Telegram/i);
    });
    await t.test('shared FAQ four Home / six Help items with button-panel relationships',()=>{
      const home=render(Faq),full=render(Faq,{full:true});
      assert.equal((home.match(/aria-expanded="false"/g)||[]).length,4);assert.equal((full.match(/aria-expanded="false"/g)||[]).length,6);
      for(let index=0;index<faqItems.length;index++) {
        assert.ok(full.includes(`aria-controls="faq-answer-${index}"`));assert.ok(full.includes(`id="faq-answer-${index}"`));assert.ok(full.includes(`aria-labelledby="faq-question-${index}"`));
      }
      assert.equal((full.match(/hidden=""/g)||[]).length,6);assert.equal((full.match(/type="button"/g)||[]).length,6);
      assert.match(full,/Как работают избранное и аккаунт/);assert.match(home,/href="\/help"/);
    });
    await t.test('unknown routes/topics have an explicit consumer 404 without redirect',()=>{
      assert.equal(matchRoutes(routes,'/unknown/path')[0].route.path,'*');
      for(const topic of ['missing','constructor','__proto__'])assert.match(render(HelpView,{topic}),/Страница не найдена/);
      assert.match(render(NotFoundView),/Вернуться на главную/);assert.match(app,/path="\*" element=\{<NotFound/);
    });
    await t.test('responsive/a11y/source evidence and no side-effect services',async()=>{
      const files=await Promise.all(['styles/Help.css','components/Footer.css','components/FaqSection.jsx','pages/Help.jsx','pages/Contacts.jsx','pages/NotFound.jsx','components/ContactDetails.jsx'].map(path=>readFile(new URL('../src/'+path,import.meta.url),'utf8')));
      assert.match(files[0],/max-width:840px/);assert.match(files[0],/max-width:1000px/);assert.match(files[0],/max-width:600px/);assert.match(files[0],/min-width:0/);assert.match(files[0],/box-sizing:border-box/);assert.match(files[0],/overflow-wrap:anywhere/);assert.match(files[0],/:focus-visible/);
      assert.match(files[1],/grid-template-columns:minmax\(0,1fr\)/);
      assert.match(files[2],/onClick=\{\(\)=>setOpen\(open===index\?null:index\)\}/);
      assert.doesNotMatch(files.slice(2).join(''),/fetch\(|authFetch|paymentService|bookingService|setInterval|setTimeout|useEffect/);
    });
    assert.equal(requests,0);assert.deepEqual(counters,{status:0,content:0,availability:0,checkrate:0,booking:0,cancellation:0});
    t.diagnostic('Hotelbeds counters: '+JSON.stringify(counters)+'; all HTTP/payment calls=0');
  } finally {await server.close();}
});
