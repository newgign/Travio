import { Link } from "react-router-dom";
import CollectionImage from "./CollectionImage";
import { formatMoney } from "../utils/money";
import { offerDetailsLink } from "../utils/hotTours";

const foodLabels = { RO: "Без питания", BB: "Завтраки", HB: "Завтрак и ужин", FB: "Полный пансион", AI: "Всё включено", UAI: "Ультра всё включено" };
const roomLabels = { Standard: "Стандартный номер", Deluxe: "Номер делюкс", Suite: "Люкс", Family: "Семейный номер" };
function plural(value, words) {
  const n = Number(value);
  return `${n} ${words[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;
}
export default function HotTourCard({ tour }) {
  const evidence = tour.discountEvidence;
  const confirmed = tour.priceEnvironment === "live" && evidence?.source === "price_history" && evidence.originalPrice > tour.price;
  const name = tour.name || tour.title || tour.hotel || "Отель";
  const dateValue = tour.checkIn || tour.departureDate;
  const date = dateValue ? new Date(`${String(dateValue).slice(0, 10)}T00:00:00`) : null;
  const food = tour.boardName || foodLabels[tour.food] || foodLabels[tour.boardCode];
  const room = tour.roomName || tour.roomType;
  const stars = Math.min(5, Math.max(0, Math.floor(Number(tour.stars) || 0)));
  return <article className="hot-trip-card">
    <div className="hot-trip-photo"><CollectionImage src={tour.image || tour.images?.[0]} alt={name} />{confirmed && <span className="hot-trip-badge">🔥 Горящее предложение · −{Math.round((evidence.originalPrice - tour.price) / evidence.originalPrice * 100)}%</span>}</div>
    <div className="hot-trip-content">
      <div className="hot-trip-meta">
        {stars > 0 && <span aria-label={`${stars} звёзд`}>{"★".repeat(stars)}</span>}
        {Number(tour.rating) > 0 && <span>Рейтинг {Number(tour.rating).toLocaleString("ru-RU")}</span>}
      </div>
      <h3 title={name}>{name}</h3>
      <p className="hot-trip-location">{[tour.country, tour.city].filter(Boolean).join(" / ")}</p>
      <ul className="hot-trip-facts">
        {date && !Number.isNaN(date.getTime()) && <li>📅 Заезд {date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</li>}
        {Number(tour.nights) > 0 && <li>🌙 {plural(tour.nights, ["ночь", "ночи", "ночей"])}</li>}
        {Number(tour.adults) > 0 && <li>👥 {plural(tour.adults, ["взрослый", "взрослых", "взрослых"])}{Number(tour.children) > 0 ? `, ${plural(tour.children, ["ребёнок", "ребёнка", "детей"])}` : ""}</li>}
        {food && <li>🍽 {food}</li>}
        {room && <li>🛏 {roomLabels[room] || room}</li>}
        <li>{tour.rateClass === "NRF" ? "Невозвратный тариф" : "Отмена по условиям тарифа"}</li>
      </ul>
      <div className="hot-trip-bottom">
        {confirmed && <><small>Ранее зафиксировано</small><del>{formatMoney(evidence.originalPrice, tour.currency)}</del></>}
        <strong>{formatMoney(tour.price, tour.currency)}</strong>
        {confirmed && <small>Экономия {formatMoney(evidence.originalPrice - tour.price, tour.currency)}</small>}
        {confirmed && <small>Цена проверена {new Date(evidence.observedAt).toLocaleString("ru-RU")}</small>}
        <small>{tour.provider === "hotelbeds" ? "за проживание · за всех гостей" : "за тур"}</small>
        <Link className="collection-cta" to={offerDetailsLink(tour)} state={{ selectedOffer: tour }}>Подробнее</Link>
      </div>
    </div>
  </article>;
}
