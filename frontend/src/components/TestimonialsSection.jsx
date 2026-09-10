import "./TestimonialsSection.css";

const reviews = [
  {
    id: 1,
    name: "Алия С.",
    country: "Турция",
    rating: 5,
    text: "Организация путешествия была на высшем уровне. Всё прошло идеально!",
  },
  {
    id: 2,
    name: "Данияр К.",
    country: "ОАЭ",
    rating: 5,
    text: "Очень понравился сервис. Забронировали тур буквально за несколько минут.",
  },
  {
    id: 3,
    name: "Екатерина М.",
    country: "Таиланд",
    rating: 5,
    text: "Лучший отпуск за последние годы. Спасибо Asedeliya!",
  },
];

export default function TestimonialsSection() {
  if (import.meta.env.PROD) return null;
  return (
    <section className="testimonials">

      <div className="section-header">
        <h2>💬 Отзывы наших туристов</h2>
        <p>Нам доверяют тысячи путешественников</p>
      </div>

      <div className="reviews-grid">

        {reviews.map((review) => (
          <div className="review-card" key={review.id}>

            <div className="review-stars">
              {"⭐".repeat(review.rating)}
            </div>

            <p className="review-text">
              "{review.text}"
            </p>

            <div className="review-user">
              <strong>{review.name}</strong>

              <span>{review.country}</span>
            </div>

          </div>
        ))}

      </div>

    </section>
  );
}
