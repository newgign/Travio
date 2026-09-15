import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';

test('3M.1 access panels distinguish Content/Booking read and unknown/auth blocked states',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
  try {
    const {CircuitPanel}=await server.ssrLoadModule('/src/components/admin/HotelbedsAccess.jsx');
    const render=(name,circuit)=>renderToStaticMarkup(React.createElement(CircuitPanel,{name,circuit,scopes:[{id:'PT:CEN'}],selectedScope:'PT:CEN',setSelectedScope(){},busy:false,act(){}}));
    const content=render('content',{state:'AUTH_BLOCKED',armed:true,operation:'CONTENT',scopeId:'PT:CEN'});
    const booking=render('booking_read',{state:'READY'});
    assert.match(content,/Hotelbeds TEST Content access/);assert.match(content,/CONTROL REQUEST ARMED/);assert.match(content,/PT:CEN/);
    assert.match(content,/403 AUTH_ERROR/);assert.match(booking,/Hotelbeds TEST Booking read access/);assert.doesNotMatch(booking,/403 AUTH_ERROR/);
    assert.match(booking,/Availability 3424/);assert.doesNotMatch(booking,/контрольный STATUS/);
    const unknown=render('content',{state:'UNKNOWN_BLOCKED'});
    assert.match(unknown,/UNKNOWN_BLOCKED/);assert.match(unknown,/ещё не подтверждён/);assert.doesNotMatch(unknown,/403 AUTH_ERROR/);
  } finally {await server.close();}
});
