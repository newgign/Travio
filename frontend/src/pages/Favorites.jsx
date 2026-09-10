import { Link } from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import TourCard from "../components/TourCard";
import { useFavorites } from "../context/FavoritesContext";

import "../styles/Favorites.css";

export default function Favorites() {
  const {
    favorites,
    loadingFavorites,
  } = useFavorites();

  const token = localStorage.getItem("token");

  return (
    <>
      <Navbar />

      <main className="favorites-page">
        <div className="favorites-header">
          <div>
            <h1>❤️ Избранное</h1>
            <p>
              Сохранённые предложения доступны в вашем аккаунте
            </p>
          </div>

          {token && (
            <div className="favorites-count">
              {favorites.length}
            </div>
          )}
        </div>

        {!token ? (
          <div className="favorites-empty">
            <div className="favorites-empty-icon">❤️</div>
            <h2>Войдите в аккаунт</h2>
            <p>
              После входа избранные отели будут сохраняться между устройствами и перезагрузками страницы.
            </p>
            <Link className="favorites-login-btn" to="/login">
              Войти
            </Link>
          </div>
        ) : loadingFavorites ? (
          <div className="favorites-empty">
            <h2>Загружаем избранное...</h2>
          </div>
        ) : favorites.length === 0 ? (
          <div className="favorites-empty">
            <div className="favorites-empty-icon">♡</div>
            <h2>Пока ничего нет</h2>
            <p>
              Нажмите на сердечко в карточке отеля, и предложение появится здесь.
            </p>
            <Link className="favorites-login-btn" to="/results">
              Найти тур
            </Link>
          </div>
        ) : (
          <div className="favorites-list">
            {favorites.map((tour) => (
              <TourCard
                key={`${tour.provider || "mock"}:${tour.providerHotelId ?? tour.id}`}
                tour={tour}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
