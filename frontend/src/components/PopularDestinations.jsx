import { Link } from "react-router-dom";
import { popularDestinations, catalogueLink } from "../data/popularDestinations";
import CollectionImage from "./CollectionImage";

function DestinationCard({ destination }) {
  const { country, city, image } = destination;
  const link = catalogueLink(destination);
  return <Link className="destination-card" to={link}>
    <CollectionImage src={image} alt={`${country}, ${city}${destination.illustration ? " — иллюстрация" : ""}`} />
    <div className="destination-caption"><span>{country}</span><h3>{city}</h3></div>
  </Link>;
}
export default function PopularDestinations() {
  return <section id="popular" className="popular section">
    <div className="section-header"><h2>🌍 Популярные направления</h2><p>Выберите направление для следующего путешествия</p></div>
    <div className="collection-grid">{popularDestinations.map((destination) => <DestinationCard key={`${destination.country}-${destination.city}`} destination={destination} />)}</div>
  </section>;
}
