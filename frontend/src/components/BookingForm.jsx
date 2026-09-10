import { useState } from "react";

export default function BookingForm() {

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    date: "",
    people: 2,
    comment: "",
  });

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  function submit(e) {
    e.preventDefault();

    alert("✅ Спасибо! Ваша заявка успешно отправлена.");

    console.log(form);
  }

  return (
    <form className="booking-form" onSubmit={submit}>

      <h2>Забронировать тур</h2>

      <input
        name="firstName"
        placeholder="Имя"
        onChange={handleChange}
      />

      <input
        name="lastName"
        placeholder="Фамилия"
        onChange={handleChange}
      />

      <input
        name="phone"
        placeholder="Телефон"
        onChange={handleChange}
      />

      <input
        name="email"
        type="email"
        placeholder="E-mail"
        onChange={handleChange}
      />

      <input
        name="date"
        type="date"
        onChange={handleChange}
      />

      <input
        name="people"
        type="number"
        min="1"
        value={form.people}
        onChange={handleChange}
      />

      <textarea
        name="comment"
        rows="5"
        placeholder="Комментарий"
        onChange={handleChange}
      />

      <button type="submit">
        Забронировать
      </button>

    </form>
  );
}