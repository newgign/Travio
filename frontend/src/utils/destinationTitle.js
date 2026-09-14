export function destinationTitle(params, destinations = []) {
  if (params.get('stagingTestHotel')) return 'Найденные предложения';
  const code = params.get('destinationCode');
  const country = params.get('country') || params.get('countryCode');
  if (code) {
    const row = destinations.find(item => item.code === code && (!country || item.countryCode === country));
    return row?.name ? `Отели: ${row.name}` : 'Отели выбранного направления';
  }
  return country ? `Отели: ${country}` : 'Найденные предложения';
}
