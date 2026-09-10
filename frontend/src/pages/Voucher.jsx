import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { downloadBookingVoucherPdf, getBookingVoucher } from "../services/bookingService";
import { formatMoney } from "../utils/money";
import "../styles/Voucher.css";

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU");
}

function statusTitle(status) {
  const labels = {
    CONFIRMED: "Подтверждено",
    CANCELLED: "Отменено",
    NOT_CONFIRMED: "Не подтверждено",
    RECONCILIATION_REQUIRED: "Требует сверки",
  };
  return labels[status] || status || "—";
}

export default function Voucher() {
  const { bookingId } = useParams();
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    getBookingVoucher(bookingId)
      .then((result) => {
        if (active) setVoucher(result?.voucher || null);
      })
      .catch((error) => alert(error.message || "Не удалось сформировать ваучер"))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [bookingId]);

  if (loading) {
    return <div className="voucher-shell"><div className="voucher-loading">Формируем ваучер...</div></div>;
  }

  if (!voucher) {
    return (
      <div className="voucher-shell">
        <div className="voucher-loading">
          Ваучер недоступен. <Link to="/my-bookings">Вернуться к бронированиям</Link>
        </div>
      </div>
    );
  }

  const cancelled = voucher.status === "CANCELLED";
  const confirmed = voucher.status === "CONFIRMED";

  async function downloadPdf() {
    try {
      setDownloading(true);
      const { blob, filename } = await downloadBookingVoucherPdf(bookingId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "Не удалось скачать PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="voucher-shell">
      <div className="voucher-actions no-print">
        <Link to="/my-bookings">← Мои бронирования</Link>
        <div className="voucher-action-buttons">
          <button type="button" onClick={downloadPdf} disabled={downloading}>
            {downloading ? "Готовим PDF..." : "⬇️ Скачать PDF"}
          </button>
          <button type="button" className="voucher-print-button" onClick={() => window.print()}>🖨️ Печать</button>
        </div>
      </div>

      <article className={`voucher-document ${cancelled ? "is-cancelled" : ""}`}>
        {voucher.isTest && (
          <div className="voucher-test-banner">
            TEST HOTELBEDS · НЕ ДЛЯ ЗАСЕЛЕНИЯ
          </div>
        )}

        <header className="voucher-header">
          <div>
            <div className="voucher-brand">✈️ Asedeliya</div>
            <p>Accommodation voucher</p>
          </div>

          <div className="voucher-code">
            <span>Voucher</span>
            <strong>{voucher.voucherCode}</strong>
          </div>
        </header>

        <section className="voucher-status-row">
          <div className={`voucher-status ${confirmed ? "ok" : cancelled ? "cancelled" : "attention"}`}>
            {statusTitle(voucher.status)}
          </div>
          <div>
            <small>Сформирован</small>
            <strong>{new Date(voucher.generatedAt).toLocaleString("ru-RU")}</strong>
          </div>
        </section>

        {voucher.isTest && (
          <div className="voucher-warning">
            Это Hotelbeds TEST-бронирование. Ваучер предназначен только для разработки Asedeliya и
            не подтверждает реальную гостиничную бронь, оплату или право на заселение.
          </div>
        )}

        <section className="voucher-section voucher-hotel">
          <div>
            <span className="voucher-label">Отель</span>
            <h1>{voucher.hotel}</h1>
            <p>📍 {[voucher.city, voucher.country].filter(Boolean).join(", ") || "—"}</p>
          </div>
          <div className="voucher-reference-box">
            <div>
              <span>Asedeliya reference</span>
              <strong>{voucher.travioReference}</strong>
            </div>
            <div>
              <span>Provider reference</span>
              <strong>{voucher.providerReference || "—"}</strong>
            </div>
          </div>
        </section>

        <section className="voucher-grid">
          <div>
            <span>Заезд</span>
            <strong>{dateLabel(voucher.checkIn)}</strong>
          </div>
          <div>
            <span>Выезд</span>
            <strong>{dateLabel(voucher.checkOut)}</strong>
          </div>
          <div>
            <span>Ночей</span>
            <strong>{voucher.nights || "—"}</strong>
          </div>
          <div>
            <span>Гостей</span>
            <strong>{voucher.people}</strong>
          </div>
          <div>
            <span>Питание</span>
            <strong>{voucher.boardCode || "—"}</strong>
          </div>
          <div>
            <span>Номер / тариф</span>
            <strong>{voucher.roomName || voucher.rateType || "—"}</strong>
          </div>
        </section>

        <section className="voucher-section">
          <div className="voucher-section-title">
            <h2>Туристы</h2>
            <span>{voucher.travelers.length || voucher.people}</span>
          </div>

          <table className="voucher-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Тип</th>
                <th>Имя и фамилия</th>
                <th>Дата рождения</th>
              </tr>
            </thead>
            <tbody>
              {voucher.travelers.length > 0 ? voucher.travelers.map((traveler, index) => (
                <tr key={`${traveler.type}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{traveler.type === "CH" ? "Ребёнок" : "Взрослый"}</td>
                  <td>{traveler.firstName} {traveler.lastName}</td>
                  <td>{dateLabel(traveler.birthDate)}</td>
                </tr>
              )) : (
                <tr>
                  <td>1</td>
                  <td>Взрослый</td>
                  <td>{voucher.holder.firstName} {voucher.holder.lastName}</td>
                  <td>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="voucher-section voucher-two-column">
          <div>
            <h2>Держатель брони</h2>
            <p>{voucher.holder.firstName} {voucher.holder.lastName}</p>
            <p>{voucher.holder.phone || "—"}</p>
            <p>{voucher.holder.email || "—"}</p>
          </div>

          <div className="voucher-price">
            <span>Стоимость</span>
            <strong>{formatMoney(voucher.amount, voucher.currency)}</strong>
            {voucher.priceChanged && (
              <small>
                Исходно: {formatMoney(voucher.quotedAmount, voucher.quotedCurrency)}
              </small>
            )}
          </div>
        </section>

        {voucher.comment && (
          <section className="voucher-section">
            <h2>Комментарий</h2>
            <p>{voucher.comment}</p>
          </section>
        )}

        <footer className="voucher-footer">
          <div>
            <strong>Asedeliya</strong>
            <span>Сохраните этот документ вместе с данными бронирования.</span>
          </div>
          <div>
            <span>Статус поставщика</span>
            <strong>{voucher.providerStatus || "—"}</strong>
          </div>
        </footer>
      </article>
    </div>
  );
}
