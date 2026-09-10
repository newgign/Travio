import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import API_URL from "../services/api";
import "../styles/Auth.css";

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (form.password.length < 8) {
      return alert("Пароль должен содержать не менее 8 символов");
    }

    if (form.password !== form.confirmPassword) {
      return alert("Пароли не совпадают");
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка регистрации");
      }

      alert("Аккаунт создан. Теперь войдите в Asedeliya.");
      navigate("/login");
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo">
          ✈️ Asedeliya
        </Link>

        <h1>Создать аккаунт</h1>
        <p>Зарегистрируйтесь для бронирования туров.</p>

        <form onSubmit={handleSubmit}>
          <label>
            Имя
            <input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Ваше имя"
              autoComplete="name"
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Телефон
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 700 000 00 00"
              autoComplete="tel"
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Минимум 8 символов"
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Повторите пароль
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Повторите пароль"
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </div>
    </div>
  );
}
