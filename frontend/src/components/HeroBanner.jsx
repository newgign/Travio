import hero from '../assets/images/hero.png';
import HomeSearch from './HomeSearch';
import '../styles/HeroBanner.css';
export default function HeroBanner(props) {
  return <section className="hero" style={{backgroundImage:`url(${hero})`}}><div className="hero-overlay"><div className="hero-content">
    <span className="hero-badge">Найдите своё следующее путешествие</span>
    <h1>Найдите отель для следующего путешествия</h1>
    <p>Сравнивайте доступные варианты, питание и цены в одном месте.</p>
    <HomeSearch {...props} />
  </div></div></section>;
}
