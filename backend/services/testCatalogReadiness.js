// Safe local metadata only. Configured codes are not proof of imported Content.
module.exports = function readiness(rows, scopes = []) {
  const values = new Map(rows.map(row => [`${row.country_code}:${row.code}`, {
    code:row.code, countryCode:row.country_code, countryName:row.country_name,
    name:row.name || null, hotelCount:Number(row.hotel_count)||0, environment:'test',
  }]));
  for (const scope of scopes) {
    const key=`${scope.countryCode}:${scope.destinationCode}`;
    if (!values.has(key)) values.set(key,{code:scope.destinationCode,countryCode:scope.countryCode,countryName:null,name:null,hotelCount:0,environment:'test'});
  }
  return [...values.values()].map(row=>({...row,state:row.hotelCount>0?'READY':'EMPTY'}));
};
