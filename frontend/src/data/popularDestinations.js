import hurghada from "../assets/images/hurghada-fallback.svg";
import abuDhabi from "../assets/images/abu-dhabi-fallback.svg";
import turkey from "../assets/images/turkey.png";
import egypt from "../assets/images/egypt.png";
import dubai from "../assets/images/dubai.png";
import thailand from "../assets/images/thailand.png";

// Verified against provider_hotels: AYT, SSH, DXB, HKT, HRG, AUH.
// Country images illustrate destinations; they are not hotel photographs.
export const popularDestinations = [
  { country: "Турция", city: "Анталья", destinationCode: "AYT", image: turkey },
  { country: "Египет", city: "Шарм-эль-Шейх", destinationCode: "SSH", image: egypt },
  { country: "ОАЭ", city: "Дубай", destinationCode: "DXB", image: dubai },
  { country: "Таиланд", city: "Пхукет", destinationCode: "HKT", image: thailand },
  { country: "Египет", city: "Хургада", destinationCode: "HRG", image: hurghada, illustration: true },
  { country: "ОАЭ", city: "Абу-Даби", destinationCode: "AUH", image: abuDhabi, illustration: true },
];
export const popularCountries = [
  { country: "Турция", image: turkey },
  { country: "Египет", image: egypt },
  { country: "ОАЭ", image: dubai },
  { country: "Таиланд", image: thailand },
];
export function catalogueLink({ country, destinationCode }) {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const departureDate = [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
  const params = new URLSearchParams({ provider: "hotelbeds", country, departureDate, people: "2", nights: "7" });
  if (destinationCode) params.set("destinationCode", destinationCode);
  return `/results?${params}`;
}
