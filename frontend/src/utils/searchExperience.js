// Validate only supported search identity; unknown query fields never reach the API.
export function validateResultsSearch(params, now=new Date()) {
  const date=params.get('checkIn') || params.get('departureDate');
  if(!date && !params.has('checkIn') && !params.has('departureDate'))return {state:'INITIAL',message:''};
  const fail=message=>({state:'INITIAL',message});
  if(!['hotelbeds','mock'].includes(params.get('provider') || 'hotelbeds'))return fail('Выберите направление и выполните поиск заново.');
  const time=Date.parse(date);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==date || date<=now.toISOString().slice(0,10))return fail('Укажите корректную будущую дату заезда.');
  const diagnostic=params.get('stagingTestHotel')==='3424';
  const identity=['provider','countryCode','country','destinationCode','checkIn','departureDate','checkOut','nights','adults','people','children','childrenAges','rooms','stagingTestHotel'];
  if(identity.some(key=>params.getAll(key).length>1) || params.has('hotelCodes') || (params.has('stagingTestHotel') && !diagnostic))return fail('Проверьте параметры поиска.');
  for(const [primary,alias] of [['countryCode','country'],['checkIn','departureDate'],['adults','people']]) {
    if(params.has(primary) && params.has(alias) && params.get(primary)!==params.get(alias))return fail('Параметры поиска противоречат друг другу. Измените поиск.');
  }
  if(!diagnostic && (!/^[A-Z]{2}$/i.test(params.get('countryCode') || params.get('country') || '') || !/^[A-Z0-9_-]{1,16}$/i.test(params.get('destinationCode') || '')))return fail('Выберите корректное направление для поиска.');
  for(const [key,fallback,min,max] of [['nights','7',1,14],['adults',params.get('people') || '2',1,6],['children','0',0,3],['rooms','1',1,1]]) {
    const raw=params.get(key) ?? fallback;
    if(!/^\d+$/.test(raw) || Number(raw)<min || Number(raw)>max)return fail(key==='rooms'?'Сейчас доступен поиск одного номера.':'Проверьте число ночей и состав гостей.');
  }
  const children=Number(params.get('children') || 0), ages=params.get('childrenAges') ? params.get('childrenAges').split(',') : [];
  if(ages.length!==children || ages.some(age=>!/^\d{1,2}$/.test(age) || Number(age)>17))return fail('Укажите возраст каждого ребёнка от 0 до 17 лет.');
  if(params.has('checkOut') && params.get('checkOut')!==new Date(time+Number(params.get('nights') || 7)*86400000).toISOString().slice(0,10))return fail('Даты проживания не совпадают с числом ночей. Измените поиск.');
  return {state:'VALID',message:''};
}
export function resultsState({valid,loading,error,count,rawCount=0}) {
  return !valid?'INITIAL':loading?'LOADING':error?'ERROR':count?'READY':rawCount?'FILTER_EMPTY':'PROVIDER_EMPTY';
}
export const searchFailureMessage='Не удалось получить предложения. Попробуйте ещё раз или измените параметры поиска.';
export const staleResultsMessage='Результаты требуется обновить. Нажмите «Обновить результаты» или измените поиск.';
