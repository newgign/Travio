import { Link } from "react-router-dom";
import { site } from "../config/site";
import ContactDetails from './ContactDetails';
import "./Footer.css";
export default function Footer() {
  return <footer id="contacts" className="footer">
    <div className="footer-container">
      <div className="footer-column"><h2>{site.siteName}</h2><p>Поиск отелей для вашего следующего путешествия.</p></div>
      <div className="footer-column"><h3>Навигация</h3>
        <Link to="/">Главная</Link><Link to="/results">Отели</Link><Link to="/favorites">Избранное</Link><Link to="/my-bookings">Мои бронирования</Link>
      </div>
      <div className="footer-column"><h3>Контакты</h3>
        <ContactDetails /><Link to="/contacts">Все контакты</Link>
      </div>
      <div className="footer-column"><h3>Помощь</h3>
        <Link to="/help">Помощь</Link>
        <Link to="/#faq">Часто задаваемые вопросы</Link><Link to="/help/booking">Условия бронирования</Link>
        <Link to="/help/cancellation">Отмена и возврат</Link><Link to="/help/privacy">Конфиденциальность</Link>
      </div>
    </div>
    <div className="footer-bottom">© 2026 {site.siteName}. Все права защищены.</div>
  </footer>;
}
