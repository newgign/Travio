import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useFavorites } from "../context/FavoritesContext";
import "../styles/Navbar.css";
import { site } from "../config/site";
import useSession from "../hooks/useSession";
import { logout } from "../services/session";
import { accountName } from "../utils/profilePresentation";

export default function Navbar() {
  const { favorites, favoritesKnown } = useFavorites();
  const favoriteCount = favoritesKnown ? favorites.length : 0;
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [menuLocation, setMenuLocation] = useState(null);
  const menuOpen = menuLocation === location.key;
  const setMenuOpen = (open) => setMenuLocation(open ? location.key : null);
  const { user } = useSession();




  return (
    <header className={`navbar ${isHome ? "" : "navbar-solid"}`}>
      <div className="navbar-container">
        <Link to="/" className="logo">✈️ <span>{site.siteName}</span></Link>

        <nav className={`nav-menu ${menuOpen ? "open" : ""}`}>
          <Link to="/">Главная</Link>
          <Link to="/results">Туры</Link>
          <Link to="/#countries">Страны</Link>
          <Link to="/#home-search">Поиск</Link>
          <Link to="/#contacts">Контакты</Link>
          <div className="mobile-nav-account">
            <Link to="/favorites">❤️ Избранное {favoriteCount > 0 ? `(${favoriteCount})` : ""}</Link>
            <Link to="/my-bookings">🧳 Мои бронирования</Link>
            {user && <Link to="/profile">👤 Личный кабинет</Link>}
            {user?.role === "admin" && <Link to="/admin">⚙️ Админ-панель</Link>}
            {user
              ? <button type="button" className="login-btn" onClick={logout}>Выйти</button>
              : <Link to="/login">👤 Войти</Link>}
          </div>
        </nav>

        <div className="nav-right">
          <Link to="/favorites" aria-label="Избранное" className="icon-btn desktop-icon">❤️{favoriteCount > 0 && <span className="badge">{favoriteCount}</span>}</Link>
          <Link to="/my-bookings" aria-label="Мои бронирования" className="icon-btn desktop-icon">🧳</Link>
          {user?.role === "admin" && <Link to="/admin" className="icon-btn desktop-icon" title="Админ-панель">⚙️</Link>}
          {user ? (
            <div className="user-box desktop-user"><Link to="/profile" aria-label={`Личный кабинет: ${accountName(user)}`} className="user-name user-name-link">👋 {accountName(user)}</Link><button type="button" className="login-btn" onClick={logout}>Выйти</button></div>
          ) : <Link to="/login" className="login-btn desktop-user">👤 Войти</Link>}
          <button type="button" className={`nav-toggle ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Открыть меню" aria-expanded={menuOpen}><span /><span /><span /></button>
        </div>
      </div>
      {menuOpen && <button type="button" className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" />}
    </header>
  );
}
