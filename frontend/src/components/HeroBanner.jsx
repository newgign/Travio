import hero from '../assets/images/hero.png';
import HomeSearch from './HomeSearch';
import '../styles/HeroBanner.css';
export default function HeroBanner(props) {
  return <section className="hero hero-unclipped"><div className="hero-visual" style={{backgroundImage:`url(${hero})`}} aria-hidden="true" /><div className="hero-overlay hero-interactive"><div className="hero-content">
    <span className="hero-badge">Найдите своё следующее путешествие</span>
    <h1>Найдите отель для следующего путешествия</h1>
    <p>Сравнивайте доступные варианты, питание и цены в одном месте.</p>
    <HomeSearch {...props} />
  </div></div></section>;
}
