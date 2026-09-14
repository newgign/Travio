// Presentation labels for confirmed identities; these do not create catalog entries.
const countries = { PT:'Португалия', AE:'ОАЭ', TR:'Турция', EG:'Египет', TH:'Таиланд' };
const destinations = { 'PT:CEN':'Centre Portugal', 'AE:DXB':'Dubai', 'TR:AYT':'Antalya', 'EG:SSH':'Sharm el Sheikh - Dahab', 'TH:HKT':'Phuket' };
export const countryLabel = (code, name) => countries[code] || name || code;
export const destinationLabel = row => row.name || destinations[`${row.countryCode}:${row.code}`] || row.code;
