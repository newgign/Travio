import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/Help.css';
export function NotFoundView() {
  return <main className="support-page"><section className="support-article support-card"><h1>Страница не найдена</h1><p>Проверьте адрес или выберите нужный раздел.</p><nav aria-label="Куда перейти"><Link to="/">Вернуться на главную</Link><Link to="/help">Помощь</Link></nav></section></main>;
}
export default function NotFound() { return <><Navbar /><NotFoundView /><Footer /></>; }
