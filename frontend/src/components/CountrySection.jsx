import { Link } from "react-router-dom";
import { popularCountries, catalogueLink } from "../data/popularDestinations";
import CollectionImage from "./CollectionImage";
import "./CountrySection.css";

export default function CountrySection() {
  // TEST navigation lives in the catalog-driven destination block above.
  if (import.meta.env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true') return null;
  return <section id="countries" className="countries">
    <div className="section-header"><h2>🌍 Популярные страны</h2><p>Выберите страну для следующего путешествия</p></div>
    <div className="country-grid">{popularCountries.map((item) =>
      <Link key={item.country} to={catalogueLink(item)} className="country-card">
        <CollectionImage src={item.image} alt={item.country} />
        <div className="country-overlay"><h3>{item.country}</h3></div>
      </Link>
    )}</div>
  </section>;
}
