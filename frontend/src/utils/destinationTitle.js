export function destinationTitle(params, destinations = []) {
  if (params.get('stagingTestHotel')) return 'Найденные предложения';
  const code = params.get('destinationCode');
  if (code) {
    const row = destinations.find(item => item.code === code && (!params.get('country') || item.countryCode === params.get('country')));
    return row?.name ? `Отели: ${row.name}` : 'Отели выбранного направления';
  }
  return params.get('country') ? `Отели: ${params.get('country')}` : 'Найденные предложения';
}
