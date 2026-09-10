import { Link } from "react-router-dom";
import "./HotelCard.css";

export default function HotelCard({
  id,
  image,
  name,
  country,
  rating,
  price,
}) {
  return (
    <div className="hotel-card">

      <div className="hotel-image">

        <img
          src={image}
          alt={name}
        />

        <div className="hotel-rating">
          ⭐ {rating}
        </div>

      </div>

      <div className="hotel-content">

        <div className="hotel-info">

          <span className="hotel-country">
            📍 {country}
          </span>

          <h3>{name}</h3>

          <div className="hotel-features">

            <span>🏖 Первая линия</span>

            <span>🍽 All Inclusive</span>

            <span>🛜 Бесплатный Wi-Fi</span>

          </div>

        </div>

        <div className="hotel-actions">

          <div className="hotel-price-label">
            Стоимость
          </div>

          <div className="hotel-price">
            {price}
          </div>

          <Link
            to={`/tour/${id}`}
            className="hotel-btn"
          >
            Подробнее
          </Link>

        </div>

      </div>

    </div>
  );
}