import { site } from "../config/site";
import hero from "../assets/images/hero.png";
import SearchBar from "./SearchBar";
import "../styles/HeroBanner.css";

export default function HeroBanner() {
  return (
    <section
      className="hero"
      style={{
        backgroundImage: `url(${hero})`,
      }}
    >
      <div className="hero-overlay">

        <div className="hero-content">

          <span className="hero-badge">
            ✈️ Найдите своё следующее путешествие
          </span>

          <h1>
            Открой мир
            <br />
            вместе с {site.siteName}
          </h1>

          <p>
            Выбирайте направление, сравнивайте варианты
            и планируйте отдых в удобном для вас темпе.
          </p>

          <SearchBar />


        </div>

      </div>
    </section>
  );
}
