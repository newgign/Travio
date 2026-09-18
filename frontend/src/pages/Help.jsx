import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import FaqSection from '../components/FaqSection';
import { helpArticles } from '../content/helpContent';
import { NotFoundView } from './NotFound';
import '../styles/Help.css';
export function HelpView({ topic }) {
  if (topic && !Object.hasOwn(helpArticles, topic)) return <NotFoundView />;
  if (!topic) return <main className="support-page"><header><h1>Помощь</h1><p>Как пользоваться поиском отелей и аккаунтом Asedeliya.</p></header><nav className="support-grid" aria-label="Темы помощи">
    {Object.entries(helpArticles).map(([key, page]) => <Link className="support-card" to={`/help/${key}`} key={key}><h2>{page.title}</h2><p>{page.summary}</p></Link>)}
    <Link className="support-card" to="/contacts"><h2>Контакты</h2><p>Опубликованные контакты Asedeliya</p></Link>
  </nav><FaqSection full /></main>;
  const page = helpArticles[topic];
  return <main className="support-page"><article className="support-article support-card"><nav aria-label="Навигация помощи"><Link to="/help">Помощь</Link><span aria-current="page">{page.title}</span></nav><header><h1>{page.title}</h1></header>{page.paragraphs.map(text => <p key={text}>{text}</p>)}<nav aria-label="Следующие разделы"><Link to="/contacts">Контакты</Link><Link to="/#home-search">Найти отели</Link></nav></article></main>;
}
export default function Help() { const { topic } = useParams(); return <><Navbar /><HelpView topic={topic} /><Footer /></>; }
