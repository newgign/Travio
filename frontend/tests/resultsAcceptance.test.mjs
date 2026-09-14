import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';

test('rendered query nights and TEST/non-Hotelbeds card actions', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false, server: { middlewareMode: true },
    plugins: [{name:'offline-favorites', enforce:'pre', load(id) {
      if (id.replaceAll('\\', '/').endsWith('/context/FavoritesContext.jsx')) return 'export function useFavorites(){return {isFavorite:()=>false,toggleFavorite:async()=>{}}}';
    }}],
    esbuild: { jsx: 'automatic' },
  });
  try {
    const {default: Filters} = await server.ssrLoadModule('/src/components/ResultsFilters.jsx');
    const {default: Card} = await server.ssrLoadModule('/src/components/TourCard.jsx');
    const {default: Options} = await server.ssrLoadModule('/src/components/DestinationOptions.jsx');
    const {searchQuery,catalogEmptyMessage,noRatesMessage} = await server.ssrLoadModule('/src/utils/catalogUx.js');
    const options=renderToStaticMarkup(React.createElement('select',{},React.createElement(Options,{country:'TH',destinations:[{countryCode:'TH',code:'HKT',hotelCount:0},{countryCode:'TH',code:'READY',name:'Offline ready',hotelCount:1},{countryCode:'PT',code:'CEN',hotelCount:10}]})));
    assert.match(options,/<option value="HKT" disabled=""/);assert.match(options,/<option value="READY">/);assert.equal(options.includes('CEN'),false);
    for (const nights of ['1','3','7','3','1']) {
      const query=new URLSearchParams(`provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-04-01&checkOut=2030-04-08&nights=${nights}&adults=2&children=1&childrenAges=8&rooms=1`);
      const restored=searchQuery(query);assert.equal(restored.country,'PT');assert.equal(restored.destinationCode,'CEN');assert.equal(restored.checkOut,'2030-04-08');assert.equal(restored.nights,nights);assert.equal(restored.adults,'2');assert.equal(restored.children,'1');assert.equal(restored.childrenAges,'8');assert.equal(restored.rooms,'1');
    }
    assert.equal(catalogEmptyMessage,'Каталог направления пока не загружен');assert.equal(noRatesMessage,'На выбранные даты доступных тарифов не найдено');
    const {default: HotelImage} = await server.ssrLoadModule('/src/components/HotelImage.jsx');
    const {destinationTitle} = await server.ssrLoadModule('/src/utils/destinationTitle.js');
    const destinationQuery = new URLSearchParams('destinationCode=CEN&country=PT&provider=hotelbeds');
    assert.equal(destinationTitle(destinationQuery,[{code:'CEN',name:'Centre Portugal',countryCode:'PT'}]),'Отели: Centre Portugal');
    assert.equal(destinationTitle(destinationQuery,[]),'Отели выбранного направления');
    assert.equal(destinationTitle(new URLSearchParams('stagingTestHotel=3424')),'Найденные предложения');
    const placeholder=renderToStaticMarkup(React.createElement(HotelImage,{src:null,alt:'Offline hotel'}));
    assert.ok(placeholder.includes('Фото недоступно'));assert.equal(placeholder.includes('<img'),false);
    const render = (component, query) => renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries:[`/results?nights=${query}`]}, component));
    // Fresh/direct/refresh and history target URLs render the exact selected option.
    for (const nights of ['1','3','7','3','1']) {
      const html = render(React.createElement(Filters), nights);
      const select = html.match(/<select[^>]*name="nights"[^>]*>(.*?)<\/select>/s)[1];
      assert.match(select, new RegExp(`<option value="${nights}" selected=""`));
    }
    const testOffer = {provider:'hotelbeds',priceEnvironment:'test',stagingTestAllowed:true,bookingDisabled:true,rateType:'BOOKABLE',price:119.57,currency:'EUR',name:'Offline hotel',observedAt:new Date().toISOString()};
    const html = render(React.createElement(Card,{tour:testOffer}), '1');
    assert.ok(html.includes('Фото недоступно'));assert.equal(html.includes('unsplash'),false);
    assert.match(html, /disabled=""[^>]*>Бронирование недоступно<\/button>/);
    assert.match(html, /<button(?:(?!disabled).)*>Подробнее<\/button>/);
    assert.ok(html.includes('Тариф Hotelbeds: BOOKABLE'));
    assert.ok(html.includes('Тестовый режим — бронирование отключено'));
    const ordinary = render(React.createElement(Card,{tour:{...testOffer,provider:'mock'}}),'3');
    assert.match(ordinary, /<button(?:(?!disabled).)*>Выбрать →<\/button>/);
    assert.equal(ordinary.includes('Бронирование недоступно'),false);
  } finally { await server.close(); }
});
