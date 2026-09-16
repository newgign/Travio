import API_URL from './api';
export async function loadHomeCatalog(signal, request=fetch) {
  const response=await request(`${API_URL}/catalog/test-options`,{signal});
  if(!response.ok) throw new Error('Каталог временно недоступен');
  const data=await response.json();
  return Array.isArray(data.destinations) ? data.destinations.filter(row=>row.countryCode && row.code) : [];
}
