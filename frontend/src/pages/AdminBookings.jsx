import { useEffect, useState } from "react";

import authFetch from "../services/authFetch";
import { formatMoney } from "../utils/money";

import {
  updateBookingStatus,
  deleteBooking,
} from "../services/bookingService";

import "../styles/AdminBookings.css";

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    try {
      const data = await authFetch("/bookings");
      setBookings(data);
    } catch (err) {
      console.error(err);
      alert(err.message || "Ошибка загрузки бронирований");
    } finally {
      setLoading(false);
    }
  }

  async function approve(id) {
    try {
      await updateBookingStatus(id, "Подтверждена");
      loadBookings();
    } catch (err) {
      alert(err.message);
    }
  }

  async function cancel(id) {
    try {
      await updateBookingStatus(id, "Отменена");
      loadBookings();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Удалить бронирование?")) return;

    try {
      await deleteBooking(id);
      loadBookings();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="admin-bookings">
        <h2>Загрузка...</h2>
      </div>
    );
  }

  return (
    <div className="admin-bookings">
      <h1>📋 Управление бронированиями</h1>

      {bookings.length === 0 ? (
        <div className="empty">Пока нет заявок</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Тур</th>
              <th>Клиент</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Туристы</th>
              <th>Стоимость</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>
                  <strong>{item.hotel}</strong>
                  <br />
                  <small>{item.city}, {item.country}</small>
                </td>
                <td>{item.first_name} {item.last_name}</td>
                <td>{item.phone}</td>
                <td>{item.email}</td>
                <td>{item.people}</td>
                <td>{formatMoney(item.price, item.currency || "KZT")}</td>
                <td>
                  <span className={`status ${item.status}`}>
                    {item.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="btn btn-success" title="Подтвердить" onClick={() => approve(item.id)}>✅</button>
                    <button className="btn btn-danger" title="Отменить" onClick={() => cancel(item.id)}>❌</button>
                    <button className="btn btn-delete" title="Удалить" onClick={() => remove(item.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
