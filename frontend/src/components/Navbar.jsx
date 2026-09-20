import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useFavorites } from "../context/FavoritesContext";
import "../styles/Navbar.css";
import { site } from "../config/site";
import useSession from "../hooks/useSession";
import { logout } from "../services/session";
import { accountName } from "../utils/profilePresentation";
import { useId, useRef } from 'react';

export default function Navbar() {
  const { favorites, favoritesKnown } = useFavorites();
  const favoriteCount = favoritesKnown ? favorites.length : 0;
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [menuLocation, setMenuLocation] = useState(null);
  const menuOpen = menuLocation === location.key;
  const setMenuOpen = (open) => setMenuLocation(open ? location.key : null);
  const { user } = useSession();
  const menuId = useId();
  const toggleRef = useRef(null);




  return (
    <header className={`navbar ${isHome ? "" : "navbar-solid"}`} onKeyDown={(event) => {
      if (event.key === 'Escape' && menuOpen) {
        event.preventDefault();
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }}>
      <div className="navbar-container">
        <Link to="/" className="logo">✈️ <span>{site.siteName}</span></Link>

        <nav id={menuId} aria-label="Основная навигация" className={`nav-menu ${menuOpen ? "open" : ""}`}>
          <Link to="/">Главная</Link>
          <Link to="/results">Отели</Link>
          <Link to="/#countries">Страны</Link>
          <Link to="/#home-search">Поиск</Link>
          <Link to="/contacts">Контакты</Link>
          <div className="mobile-nav-account">
            <Link to="/favorites">❤️ Избранное {favoriteCount > 0 ? `(${favoriteCount})` : ""}</Link>
            <Link to="/my-bookings">🧳 Мои бронирования</Link>
            {user && <Link to="/profile">👤 Личный кабинет</Link>}
            {user?.role === "admin" && <Link to="/admin">⚙️ Админ-панель</Link>}
            {user
              ? <button type="button" className="login-btn" onClick={logout}>Выйти</button>
              : <><Link to="/login">👤 Войти</Link><Link to="/register">Создать аккаунт</Link></>}
          </div>
        </nav>

        <div className="nav-right">
          <Link to="/favorites" aria-label="Избранное" className="icon-btn desktop-icon">❤️{favoriteCount > 0 && <span className="badge">{favoriteCount}</span>}</Link>
          <Link to="/my-bookings" aria-label="Мои бронирования" className="icon-btn desktop-icon">🧳</Link>
          {user?.role === "admin" && <Link to="/admin" className="icon-btn desktop-icon" title="Админ-панель">⚙️</Link>}
          {user ? (
            <div className="user-box desktop-user"><Link to="/profile" aria-label={`Личный кабинет: ${accountName(user)}`} className="user-name user-name-link">👋 {accountName(user)}</Link><button type="button" className="login-btn" onClick={logout}>Выйти</button></div>
          ) : <div className="user-box desktop-user"><Link to="/login" className="login-btn">Войти</Link><Link to="/register" className="user-name user-name-link">Регистрация</Link></div>}
          <button ref={toggleRef} type="button" className={`nav-toggle ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls={menuId}><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /></button>
        </div>
      </div>
      {menuOpen && <button type="button" className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" />}
    </header>
  );
}
