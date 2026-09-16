export const destinationKey = row => JSON.stringify([row.countryCode, row.code]);
export const nightLabel = n => `${n} ${n === 1 ? 'ночь' : n >= 2 && n <= 4 ? 'ночи' : 'ночей'}`;
export const guestLabel = (adults, children) => `${adults} ${Number(adults) === 1 ? 'взрослый' : 'взрослых'}${Number(children) ? ` · ${children} ${Number(children) === 1 ? 'ребёнок' : 'ребёнка'}` : ''}`;
export function initialHomeSearch(params) {
  const children = Number(params.get('children') || 0);
  return {destination:destinationKey({countryCode:params.get('countryCode') || params.get('country') || '',code:params.get('destinationCode') || ''}),
    checkIn:params.get('checkIn') || params.get('departureDate') || '',nights:params.get('nights') || '7',
    adults:Number(params.get('adults') || params.get('people') || 2),children,
    childrenAges:params.get('childrenAges') ? params.get('childrenAges').split(',') : Array.from({length:Math.min(3,Math.max(0,children))},()=>'' )};
}
export function changeGuestCount(form, field, delta) {
  const value = Math.min(field === 'adults' ? 6 : 3, Math.max(field === 'adults' ? 1 : 0, Number(form[field]) + delta));
  return {...form,[field]:value,...(field === 'children' ? {childrenAges:Array.from({length:value},(_,i)=>form.childrenAges[i] ?? '')} : {})};
}
export function buildHomeSearch(form, destinations, diagnostic=false, now=new Date()) {
  const errors={};
  const selected=destinations.find(row=>destinationKey(row)===form.destination && row.hotelCount>0);
  if (!diagnostic && !selected) errors.destination='Выберите доступное направление.';
  const parsed=Date.parse(form.checkIn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.checkIn) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10)!==form.checkIn || form.checkIn<=now.toISOString().slice(0,10)) errors.checkIn='Выберите корректную будущую дату заезда.';
  if (!Number.isInteger(Number(form.nights)) || Number(form.nights)<1 || Number(form.nights)>14) errors.nights='Выберите от 1 до 14 ночей.';
  if (!Number.isInteger(form.adults) || form.adults<1 || form.adults>6 || !Number.isInteger(form.children) || form.children<0 || form.children>3) errors.guests='Допустимо 1–6 взрослых и 0–3 ребёнка.';
  if (form.childrenAges.length!==form.children || form.childrenAges.some(age=>!/^\d{1,2}$/.test(String(age)) || Number(age)>17)) errors.guests='Укажите возраст каждого ребёнка от 0 до 17 лет.';
  if (Object.keys(errors).length) return {errors};
  const query=new URLSearchParams({provider:'hotelbeds',checkIn:form.checkIn,nights:String(Number(form.nights)),adults:String(form.adults),children:String(form.children),rooms:'1'});
  if(diagnostic) query.set('stagingTestHotel','3424');
  else {query.set('countryCode',selected.countryCode);query.set('destinationCode',selected.code);}
  if(form.children) query.set('childrenAges',form.childrenAges.map(Number).join(','));
  return {errors:{},url:`/results?${query}`};
}
