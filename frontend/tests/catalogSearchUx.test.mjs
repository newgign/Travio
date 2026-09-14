import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';

test('3K offline catalog cards, human labels and local offer filtering', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true},esbuild:{jsx:'automatic'}});
  try {
    const {default:Cards}=await server.ssrLoadModule('/src/components/TestDestinationCards.jsx');
    const {default:Options}=await server.ssrLoadModule('/src/components/DestinationOptions.jsx');
    const {countryLabel}=await server.ssrLoadModule('/src/utils/testDestinationLabels.js');
    const {providerQuery,filterOffers,resetOfferFilters,filterEmptyMessage}=await server.ssrLoadModule('/src/utils/localOfferFilters.js');
    const {noRatesMessage}=await server.ssrLoadModule('/src/utils/catalogUx.js');
    const rows=[{countryCode:'PT',code:'CEN',name:'Centre Portugal',hotelCount:10},{countryCode:'TH',code:'HKT',hotelCount:0}];
    const html=renderToStaticMarkup(React.createElement(MemoryRouter,{},React.createElement(Cards,{destinations:rows})));
    assert.match(html,/countryCode=PT&amp;destinationCode=CEN/);
    assert.match(html,/Португалия/);assert.match(html,/Таиланд/);assert.match(html,/Phuket/);
    assert.match(html,/aria-disabled="true"/);assert.equal((html.match(/<a /g)||[]).length,1);
    assert.equal(html.includes('HRG'),false);assert.equal(html.includes('AUH'),false);
    assert.equal(html.includes('https://'),false);assert.match(html,/Направление путешествия/);
    const options=renderToStaticMarkup(React.createElement('select',{},React.createElement(Options,{country:'TH',destinations:rows})));
    assert.match(options,/<option value="HKT" disabled="">Phuket/);
    for (const code of ['PT','AE','TR','EG','TH']) assert.notEqual(countryLabel(code),code);
    const offers=[{id:1,price:100,currency:'EUR',stars:4,boardCode:'BB',roomName:'Superior',offerToken:'offline-one'},{id:2,price:200,currency:'EUR',stars:3,boardCode:'RO',roomName:'Twin',offerToken:'offline-two'}];
    const snapshot=JSON.stringify(offers);
    const base=new URLSearchParams('provider=hotelbeds&countryCode=PT&destinationCode=CEN&checkIn=2030-01-01&nights=1&adults=2&rooms=1&children=1&childrenAges=8');
    const key=providerQuery(base,true);
    for(const [field,value,count] of [['stars','5',0],['food','BB',1],['roomType','superior',1],['maxPrice','150',1],['sort','priceDesc',2]]) {
      const query=new URLSearchParams(base);query.set(field,value);
      assert.equal(providerQuery(query,true),key,'presentation edits retain the fetch effect dependency');
      assert.equal(filterOffers(offers,query).length,count);
      assert.equal(filterOffers(offers,resetOfferFilters(query)).length,2);
      assert.equal(resetOfferFilters(query).get('nights'),'1');
      assert.equal(resetOfferFilters(query).get('childrenAges'),'8');
    }
    assert.equal(JSON.stringify(offers),snapshot);
    assert.notEqual(filterEmptyMessage,noRatesMessage);
    assert.equal(filterOffers([],base).length,0);
    for (const nights of ['1','3','7','3','1']) {
      const query=new URLSearchParams(base);query.set('nights',nights);
      assert.equal(JSON.parse(providerQuery(query,true)).nights,nights);
      if(nights!=='1')assert.notEqual(providerQuery(query,true),key);
    }
    assert.equal(JSON.parse(providerQuery(new URLSearchParams('stagingTestHotel=3424'),true)).stagingTestHotel,'3424');
    assert.equal(JSON.parse(providerQuery(new URLSearchParams('stars=5'),false)).stars,'5');
  } finally {await server.close();}
});
