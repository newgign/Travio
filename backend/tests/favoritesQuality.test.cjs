const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./offlineNetwork.cjs');
const pool=require('../db');
const catalog=require('../repositories/providerCatalogRepository');
const manager=require('../providers/providerManager');
const controller=require('../controllers/favoriteController');

test('favorites add uses local catalog, scoped identity and no provider offer',async t=>{
  let writes=0,providerCalls=0,missing=false;
  const data={provider_hotel_id:'3424',name:'Grand Kaptan',city:'ALANYA',country_name:'Turkey',country_code:'TR',destination_code:'ALA',stars:5,image_url:'https://images.example.test/hotel.jpg',content_environment:'test',raw_data:{secret:'PRIVATE'},price:999,rateKey:'PRIVATE'};
  t.mock.method(manager,'getProvider',()=>({getHotelById:()=>{providerCalls++;throw Error('Forbidden');},searchHotels:()=>{providerCalls++;throw Error('Forbidden');}}));
  t.mock.method(catalog,'findHotel',async(provider,id)=>{assert.equal(provider,'hotelbeds');assert.equal(id,'3424');return missing?null:data;});
  t.mock.method(pool,'query',async(sql,args)=>{
    writes++;assert.match(sql,/ON CONFLICT \(user_id, provider, provider_hotel_id\)/);
    assert.equal(args[0],7);assert.equal(args[1],'hotelbeds');assert.equal(args[2],'3424');
    const saved=JSON.parse(args[3]);assert.deepEqual(Object.keys(saved).sort(),['provider','providerHotelId','name','country','countryCode','city','destinationCode','stars','image','contentEnvironment'].sort());
    assert.doesNotMatch(args[3],/PRIVATE|rateKey|price|room|board/);
    return {rows:[{id:1,provider:'hotelbeds',provider_hotel_id:'3424',hotel_data:saved}]};
  });
  let status,body;const res={status(value){status=value;return this;},json(value){body=value;return this;}};
  const request={user:{id:7},body:{provider:'hotelbeds',hotelId:'3424',filters:{price:1},name:'UNTRUSTED'}};
  await controller.addFavorite(request,res);assert.equal(status,201);assert.equal(body.data.name,'Grand Kaptan');assert.equal(body.data.contentEnvironment,'test');assert.equal(writes,1);
  missing=true;await controller.addFavorite(request,res);assert.equal(status,404);assert.equal(writes,1);assert.equal(providerCalls,0);
});
