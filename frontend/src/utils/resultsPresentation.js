import { localFilterKeys } from './localOfferFilters';
import { normalizeBoardDisplay, stayLabel } from './hotelOfferDisplay';
export function pluralCount(value, words) {
  const n=Number(value)||0;
  return `${n} ${words[n%100>=11 && n%100<=14 ? 2 : n%10===1 ? 0 : n%10>=2 && n%10<=4 ? 1 : 2]}`;
}
export const hotelCount = n => pluralCount(n,['отель','отеля','отелей']);
export function stayGuests(adults,children) {
  return Number(children)>0 ? `${pluralCount(adults,['взрослый','взрослых','взрослых'])} · ${pluralCount(children,['ребёнок','ребёнка','детей'])}` : pluralCount(adults,['гость','гостя','гостей']);
}
export function searchSummary(params) {
  const date=params.get('checkIn') || params.get('departureDate');
  const parsed=date && new Date(`${date}T12:00:00Z`);
  const label=parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}) : '';
  return [label,stayLabel(params.get('nights') || 7).replace(/^за /,''),stayGuests(params.get('adults') || params.get('people') || 2,params.get('children') || 0)].filter(Boolean).join(' · ');
}
export function editSearchLink(params) {
  const query=new URLSearchParams();
  for(const key of ['provider','countryCode','country','destinationCode','stagingTestHotel','checkIn','checkOut','departureDate','nights','adults','people','children','childrenAges','rooms'])if(params.has(key))query.set(key,params.get(key));
  return `/?${query}`;
}
export function changePresentationFilter(params,key,value) {
  const next=new URLSearchParams(params);
  if(!localFilterKeys.includes(key) && key!=='sort')return next;
  if(value)next.set(key,value);else next.delete(key);
  next.set('page','1');
  return next;
}
export function activeFilterChips(params,currency,boards=[]) {
  const labels={stars:value=>`${value}★${value==='5'?'':' и выше'}`,food:value=>normalizeBoardDisplay(value,boards.find(b=>b.code===value)?.name),
    roomType:value=>value,maxPrice:value=>`до ${value} ${currency}`,rating:value=>`Рейтинг ${value}+`,beachLine:value=>`${value}-я линия`,beachType:value=>`Пляж: ${value}`};
  return localFilterKeys.filter(key=>params.get(key)).map(key=>({key,label:labels[key](params.get(key))}));
}
