import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ContactDetails from '../components/ContactDetails';
import '../styles/Help.css';
export function ContactsView() {
  return <main className="support-page"><article className="support-article support-card"><header><h1>Контакты</h1><p>Связаться с Asedeliya</p></header><ContactDetails /><p>По вопросам о работе сайта и данных аккаунта используйте опубликованные контакты.</p><Link to="/help">Перейти в помощь</Link></article></main>;
}
export default function Contacts() { return <><Navbar /><ContactsView /><Footer /></>; }
