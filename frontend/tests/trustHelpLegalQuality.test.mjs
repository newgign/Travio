import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router-dom';
import postcss from 'postcss';

const source = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
const render = (View, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(View, props)));
test('5J factual help/legal-facing content and navigation, offline', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('External/provider/API network forbidden');});
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  const load=path=>server.ssrLoadModule('/src/'+path);
  try {
    const {HelpView}=await load('pages/Help.jsx');
    const {ContactsView}=await load('pages/Contacts.jsx');
    const {default:Footer}=await load('components/Footer.jsx');
    const {default:Faq}=await load('components/FaqSection.jsx');
    const {default:Advantages}=await load('components/Advantages.jsx');
    const {helpArticles}=await load('content/helpContent.js');
    const {site}=await load('config/site.js');
    const app=await source('App.jsx');
    const routes=[...app.matchAll(/path="([^"]+)"/g)].map(([,path])=>({path}));
    const article=topic=>render(HelpView,{topic});
    const help=render(HelpView),footer=render(Footer),contacts=render(ContactsView),faq=render(Faq,{full:true});
    const all=help+footer+contacts+faq+render(Advantages)+Object.keys(helpArticles).map(article).join('');

    await t.test('Help landing makes TEST and disabled booking/payment visible',()=>{assert.match(help,/Сервис работает в тестовом режиме/);assert.match(help,/Реальное бронирование и оплата сейчас недоступны/);});
    await t.test('Footer provides short factual status without engineering flags',()=>{assert.match(footer,/Тестовый режим: реальное бронирование и оплата недоступны/);assert.doesNotMatch(footer,/HOTELBEDS_ENV|PAYMENTS_MODE|PRODUCTION_SALES/);});
    await t.test('booking distinguishes current inactive sales from future rate validation',()=>{const html=article('booking');assert.match(html,/Продажи через сервис сейчас не ведутся/);assert.match(html,/не условия действующего договора/);assert.match(html,/не создают бронь и не резервируют номер/);assert.match(html,/тариф потребуется повторно проверить/);});
    await t.test('booking history described as stored records, not proof of stay/payment',()=>{const html=article('booking');assert.match(html,/сохранённые записи заказов и заявок/);assert.match(html,/не подтверждает реальное проживание или оплату/);});
    await t.test('cancellation does not offer active refund or money movement',()=>{const html=article('cancellation');assert.match(html,/Реальная отмена и возврат[^]*сейчас недоступны/);assert.match(html,/не являются подтверждением движения реальных денег/);});
    await t.test('refund rules remain rate-specific with no invented deadlines/fees',()=>{const html=article('cancellation');assert.match(html,/зависеть от конкретного тарифа/);assert.match(html,/не устанавливает правила возврата/);assert.doesNotMatch(html,/\d+\s*(дн|час|%|руб|тенге)|бесплатная отмена|мгновенный возврат/i);});
    await t.test('privacy distinguishes saved notification preferences from delivery',()=>{const html=article('privacy');assert.match(html,/Настройки уведомлений сохраняются в аккаунте/);assert.match(html,/Отправка email и напоминаний сейчас отключена/);});
    await t.test('privacy explains inactive payment without inventing card storage policy',()=>{const html=article('privacy');assert.match(html,/Оплата сейчас отключена/);assert.match(html,/Вводить данные банковской карты[^]*не требуется/);assert.doesNotMatch(html,/храним.*карт|обрабатываем.*карт|PCI|шифрован/i);});
    await t.test('privacy acknowledges stored account data and logout is not deletion',()=>{const html=article('privacy');assert.match(html,/Приложение хранит данные аккаунта/);assert.match(html,/sessionStorage/);assert.match(html,/не удаление аккаунта/);assert.match(html,/не утверждённая юридическая политика/);assert.doesNotMatch(html,/GDPR|соответствуем законодательству|никогда не переда|\d+\s*(лет|дней)/i);});
    await t.test('price help distinguishes TEST snapshots from current availability',()=>{const html=article('prices');assert.match(html,/информация из тестовой среды/);assert.match(html,/не является текущей ценой/);assert.match(html,/не отдельный платёж/);});
    await t.test('search explains hotel stay only without travel-package inclusions',()=>{assert.match(article('search'),/Перелёт, трансфер и страхование не считаются включёнными/);});
    await t.test('trust surfaces contain no unsupported guarantees or support/popularity claims',()=>{assert.doesNotMatch(all,/24\/7|круглосуточн|гарантируем|гарантия лучшей цены|самые низкие цены|официальный партнёр|миллионы отелей|мгновенн.{0,20}(возврат|подтвержд)/i);});
    await t.test('contacts and Footer reuse exact canonical values and contact protocols',()=>{for(const html of [contacts,footer]){assert.ok(html.includes(site.supportPhone));assert.ok(html.includes(site.supportEmail));assert.ok(html.includes(site.city));assert.ok(html.includes(`href="mailto:${site.supportEmail}"`));assert.ok(html.includes(`href="tel:${site.supportPhone.replace(/[^+\d]/g,'')}"`));}});
    await t.test('no invented social links, external service or fake message form',()=>{assert.doesNotMatch(all,/<form|<iframe|сообщение отправлено|WhatsApp|Telegram|instagram|facebook|href="https?:/i);});
    await t.test('all targeted links resolve to app routes/topics or configured contacts',()=>{for(const [,href] of all.matchAll(/href="([^"]+)"/g)){assert.notEqual(href,'#');assert.doesNotMatch(href,/javascript:|void\(/i);if(/^(tel:|mailto:)/.test(href))continue;const [path,hash]=href.split('#');assert.notEqual(matchRoutes(routes,path)?.[0].route.path,'*',href);assert.ok(matchRoutes(routes,path),href);if(path.startsWith('/help/'))assert.ok(Object.hasOwn(helpArticles,path.slice(6)));if(hash)assert.ok(['faq','home-search'].includes(hash));}});
    for(const [path,topic,title] of [['/help',undefined,'Помощь'],['/help/booking','booking','Бронирование'],['/help/cancellation','cancellation','Отмена и возврат'],['/help/privacy','privacy','Конфиденциальность']])await t.test(`${path} has a real route and semantic article heading`,()=>{assert.notEqual(matchRoutes(routes,path)[0].route.path,'*');const html=article(topic);assert.ok(html.includes(`<h1>${title}</h1>`));assert.equal((html.match(/<h1/g)||[]).length,1);});
    await t.test('Contacts route and footer help/legal navigation stay meaningful',()=>{assert.notEqual(matchRoutes(routes,'/contacts')[0].route.path,'*');assert.match(contacts,/<h1>Контакты/);for(const path of ['/help','/#faq','/help/booking','/help/cancellation','/help/privacy','/contacts'])assert.ok(footer.includes(`href="${path}"`));});
    await t.test('shared FAQ preserves keyboard controls, relationships and Home anchor',()=>{assert.match(faq,/id="faq"/);assert.equal((faq.match(/type="button"/g)||[]).length,6);for(const [,id] of faq.matchAll(/aria-controls="([^"]+)"/g))assert.ok(faq.includes(`id="${id}"`));assert.match(faq,/aria-expanded="false"/);assert.match(faq,/role="region"/);assert.doesNotMatch(render(Faq),/Все вопросы и помощь|href="\/help"/);});
    await t.test('unknown help topics fail as not found without fake policy',()=>{for(const topic of ['missing','constructor'])assert.match(article(topic),/Страница не найдена/);});
    await t.test('consumer text has no env flags or fake placeholder handlers',async()=>{assert.doesNotMatch(all,/HOTELBEDS_ENV|PRODUCTION_SALES_ENABLED|PAYMENTS_MODE|EMAIL_ENABLED|VITE_/);const code=(await Promise.all(['pages/Help.jsx','pages/Contacts.jsx','components/Footer.jsx','content/helpContent.js'].map(source))).join('');assert.doesNotMatch(code,/alert\(|javascript:void|href="#"|onSubmit|fetch\(|authFetch|setInterval/);});
    await t.test('320/390 and 768/1440 help/footer wrapping and focus CSS retained',async()=>{const [helpCss,footCss,faqCss]=await Promise.all(['styles/Help.css','components/Footer.css','components/FaqSection.css'].map(source));for(const css of [helpCss,footCss]){assert.doesNotThrow(()=>postcss.parse(css));assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/max-width:600px/);assert.match(css,/max-width:1000px/);assert.match(css,/:focus-visible/);assert.match(css,/minmax\(0,1fr\)/);}assert.match(faqCss,/\.faq-section \.faq-question:focus-visible \{ outline-offset:-4px/);});
    await t.test('Help/Contacts remain lazy, no new runtime or delivery imports on touched surfaces',async()=>{assert.match(app,/const Help = lazy/);assert.match(app,/const Contacts = lazy/);for(const path of ['content/helpContent.js','pages/Help.jsx','components/Footer.jsx'])assert.doesNotMatch(await source(path),/paymentService|bookingService|emailService|hotelbedsClient|useEffect|useLayoutEffect/);});
    await t.test('rendering all trust surfaces causes zero API/provider/external calls',()=>assert.equal(calls,0));
  } finally {await server.close();}
});
