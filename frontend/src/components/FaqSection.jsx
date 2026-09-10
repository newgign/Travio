import { useState } from "react";
import "./FaqSection.css";

const questions = [
  {
    question: "Как забронировать тур?",
    answer:
      "Выберите понравившийся тур, нажмите «Подробнее», затем «Забронировать». Статус заявки доступен в разделе «Мои бронирования».",
  },
  {
    question: "Можно ли отменить бронирование?",
    answer:
      "Да. Условия отмены зависят от выбранного тура и туроператора.",
  },
  {
    question: "Входит ли перелёт в стоимость?",
    answer:
      "Предложения проживания не включают перелёт, трансфер и страховку, если это явно не указано в условиях.",
  },
  {
    question: "Какие способы оплаты доступны?",
    answer:
      "Доступные действия показаны при оформлении. Сейчас сервис работает в тестовом режиме без реального списания денег.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState(null);

  function toggle(index) {
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <section id="faq" className="faq-section">

      <div className="section-header">
        <h2>❓ Часто задаваемые вопросы</h2>
        <p>Ответы на самые популярные вопросы наших клиентов</p>
      </div>

      <div className="faq-list">

        {questions.map((item, index) => (
          <div className="faq-item" key={index}>

            <button
              type="button"
              aria-expanded={openIndex === index}
              aria-controls={`faq-answer-${index}`}
              className="faq-question"
              onClick={() => toggle(index)}
            >
              <span>{item.question}</span>

              <span>
                {openIndex === index ? "−" : "+"}
              </span>
            </button>

            {openIndex === index && (
              <div id={`faq-answer-${index}`} className="faq-answer">
                {item.answer}
              </div>
            )}

          </div>
        ))}

      </div>

    </section>
  );
}
