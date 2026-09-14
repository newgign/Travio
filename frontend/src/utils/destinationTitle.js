import { countryLabel, destinationLabel } from './testDestinationLabels';
export function destinationTitle(params, destinations = []) {
  if (params.get('stagingTestHotel')) return 'Найденные предложения';
  const code = params.get('destinationCode');
  const country = params.get('country') || params.get('countryCode');
  if (code) {
    const row = destinations.find(item => item.code === code && (!country || item.countryCode === country));
    return row ? `Отели: ${destinationLabel(row)}` : 'Отели выбранного направления';
  }
  return country ? `Отели: ${countryLabel(country)}` : 'Найденные предложения';
}
