const reviews = [
  {
    name: "Александр",
    rating: 5,
    text: "Отличный отель! Питание превосходное, море чистое, персонал очень дружелюбный.",
  },
  {
    name: "Айгерим",
    rating: 5,
    text: "Отдыхали с детьми. Аквапарк, детский клуб и анимация были великолепны.",
  },
  {
    name: "Дмитрий",
    rating: 4,
    text: "Хороший сервис, большие бассейны и удобный пляж. Обязательно вернёмся.",
  },
];

export default function Reviews() {
  return (
    <section className="reviews">

      <h2>⭐ Отзывы туристов</h2>

      {reviews.map((review, index) => (
        <div className="review-card" key={index}>

          <h3>{review.name}</h3>

          <div className="review-rating">
            {"⭐".repeat(review.rating)}
          </div>

          <p>{review.text}</p>

        </div>
      ))}

    </section>
  );
}