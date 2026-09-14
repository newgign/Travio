export default function DestinationOptions({ destinations, country }) {
  return destinations.filter(row=>row.countryCode===country).map(row=><option key={row.code} value={row.code} disabled={!(row.hotelCount>0)}>{row.name || row.code}{!(row.hotelCount>0) ? ' — отели пока не загружены' : ''}</option>);
}
