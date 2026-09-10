import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  cancelProviderBooking,
  downloadBookingVoucherPdf,
  getBookingDetails,
  simulateProviderCancellation,
  syncProviderBooking,
} from "../services/bookingService";
import { completeSandboxRefund, requestSandboxRefund } from "../services/paymentService";
import { formatMoney } from "../utils/money";

import "../styles/BookingDetails.css";

function dateOnly(value) {
  if (!value) return "—";
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("ru-RU");
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU");
}

function text(value, fallback = "—") {
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value);
}

function localStatus(booking) {
  const providerStatus = String(booking?.provider_status || "").toUpperCase();
  if (["RATE_EXPIRED", "CONFIRMATION_FAILED"].includes(providerStatus)) return "Не подтверждена";
  if (providerStatus === "CONFIRMATION_UNKNOWN") return "Требует сверки";
  return booking?.status || "—";
}

function statusTone(value = "") {
  const normalized = String(value).toUpperCase();
  if (normalized.includes("CANCEL") || normalized.includes("ОТМЕН")) return "danger";
  if (normalized.includes("CONFIRM") || normalized.includes("ПОДТВЕРЖ") || normalized === "PAID") return "success";
  if (normalized.includes("UNKNOWN") || normalized.includes("ATTENTION") || normalized.includes("ТРЕБУЕТ")) return "warning";
  if (normalized.includes("FAILED") || normalized.includes("EXPIRED") || normalized.includes("НЕ ПОДТВЕРЖ")) return "danger";
  return "neutral";
}

function paymentLabel(payment, isHotelbeds) {
  if (isHotelbeds) return "Hotelbeds TEST / без локального платежа";
  const refundStatus = String(payment?.refundStatus || "not_requested").toLowerCase();
  if (refundStatus === "refunded") return "Возвращено (sandbox)";
  if (refundStatus === "requested") return "Возврат запрошен";
  const value = String(payment?.status || "pending").toLowerCase();
  const labels = {
    paid: "Оплачено",
    pending: "Ожидает оплаты",
    requires_action: "Готово к sandbox-оплате",
    failed: "Ошибка оплаты",
    test: "TEST",
  };
  return labels[value] || value;
}

function eventIcon(type = "") {
  const icons = {
    booking_created: "🧾",
    booking_confirmed: "✅",
    payment_intent_created: "💳",
    payment_completed: "💰",
    provider_synced: "🔄",
    cancellation_quote: "🧮",
    booking_cancelled: "❌",
    voucher_generated: "📄",
    refund_requested: "↩️",
    refund_completed: "✅",
  };
  return icons[type] || "•";
}

export default function BookingDetails() {
  const { bookingId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const result = await getBookingDetails(bookingId);
      setData(result);
    } catch (err) {
      setError(err.message || "Не удалось загрузить бронирование");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        const result = await getBookingDetails(bookingId);
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message || "Не удалось загрузить бронирование");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      active = false;
    };
  }, [bookingId]);

  const booking = data?.booking || null;
  const payment = data?.payment || null;
  const refund = data?.refundReadiness || null;
  const events = Array.isArray(data?.events) ? data.events : [];
  const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
  const refunds = Array.isArray(data?.refunds) ? data.refunds : [];

  const derived = useMemo(() => {
    const offer = booking?.offer_snapshot || {};
    const filters = booking?.search_filters || {};
    const travelers = Array.isArray(booking?.travelers) ? booking.travelers : [];
    const providerStatus = String(booking?.provider_status || "").toUpperCase();
    const isHotelbeds = booking?.provider === "hotelbeds";
    const providerCancelled = ["CANCELLED", "CANCELED"].includes(providerStatus);
    const providerFailed = ["RATE_EXPIRED", "CONFIRMATION_FAILED"].includes(providerStatus);
    const canSync = isHotelbeds && Boolean(booking?.provider_booking_id || booking?.provider_client_reference);
    const canCancel = isHotelbeds && Boolean(booking?.provider_booking_id && !providerCancelled && !providerFailed);
    const checkIn = offer.checkIn || offer.check_in || offer.stay?.checkIn || filters.departureDate || filters.checkIn;
    const nights = Number(offer.nights || filters.nights || 0) || 0;
    let checkOut = offer.checkOut || offer.check_out || offer.stay?.checkOut || null;
    if (!checkOut && checkIn && nights) {
      const d = new Date(`${String(checkIn).slice(0, 10)}T12:00:00Z`);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + nights);
        checkOut = d.toISOString().slice(0, 10);
      }
    }
    return {
      offer,
      filters,
      travelers,
      providerStatus,
      isHotelbeds,
      providerCancelled,
      providerFailed,
      canSync,
      canCancel,
      checkIn,
      checkOut,
      nights,
      board: offer.boardCode || offer.board_code || offer.board || "—",
      room: offer.roomName || offer.room_name || offer.roomCode || offer.room_code || offer.roomType || offer.room_type || "—",
    };
  }, [booking]);

  async function handlePdf() {
    try {
      setBusy(true);
      const { blob, filename } = await downloadBookingVoucherPdf(booking.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await load();
    } catch (err) {
      alert(err.message || "Не удалось скачать PDF");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    try {
      setBusy(true);
      const result = await syncProviderBooking(booking.id);
      if (result?.noMatch && result?.message) alert(result.message);
      await load();
    } catch (err) {
      alert(err.message || "Не удалось синхронизировать Hotelbeds TEST");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    try {
      setBusy(true);
      const simulation = await simulateProviderCancellation(booking.id);
      const currency = simulation?.currency || booking.currency || "EUR";
      const fee = simulation?.cancellationFee;
      const feeText = Number.isFinite(Number(fee))
        ? formatMoney(Number(fee), currency)
        : "Hotelbeds не вернул отдельную сумму штрафа";

      const accepted = window.confirm(
        `Hotelbeds TEST: условия отмены — ${feeText}.\n\nПродолжить отмену ${booking.provider_booking_id}?`
      );
      if (!accepted) {
        await load();
        return;
      }

      await cancelProviderBooking(booking.id, {
        expectedFee: Number.isFinite(Number(fee)) ? Number(fee) : null,
      });
      await load();
    } catch (err) {
      alert(err.message || "Не удалось отменить Hotelbeds TEST-бронирование");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestRefund() {
    const value = Number(refund?.refundableAmount || 0);
    const accepted = window.confirm(
      `Создать полный TEST-возврат ${formatMoney(value, refund?.currency || booking.currency)}?\n\nЭто только sandbox. Реальный возврат денег выполняться не будет.`
    );
    if (!accepted) return;
    try {
      setBusy(true);
      await requestSandboxRefund(booking.id, "Полный тестовый возврат из личного кабинета Asedeliya");
      await load();
    } catch (err) {
      alert(err.message || "Не удалось создать sandbox-возврат");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteRefund() {
    const accepted = window.confirm(
      "Завершить второй шаг sandbox-возврата?\n\nБронь будет отмечена отменённой, а возвращаемая сумма станет 0. Реальных денежных операций не будет."
    );
    if (!accepted) return;
    try {
      setBusy(true);
      await completeSandboxRefund(booking.id);
      await load();
    } catch (err) {
      alert(err.message || "Не удалось завершить sandbox-возврат");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <><Navbar /><main className="booking-details-shell"><div className="booking-details-state">Загрузка заказа...</div></main><Footer /></>;
  }

  if (error || !booking) {
    return (
      <>
        <Navbar />
        <main className="booking-details-shell">
          <div className="booking-details-state">
            <h2>Не удалось открыть заказ</h2>
            <p>{error || "Бронирование не найдено"}</p>
            <Link to="/my-bookings" className="bd-primary-btn">← Мои бронирования</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const amount = Number(booking.price ?? booking.total_amount) || 0;
  const quote = Number(booking.quoted_amount || derived.offer.price) || amount;
  const hasPriceDelta = quote > 0 && Math.abs(amount - quote) > 0.01;
  const local = localStatus(booking);
  const sandboxNoCharge = payment?.gatewayProvider === "sandbox" && payment?.metadata?.realCharge === false;
  const latestRefund = refunds[0] || null;
  const sandboxRefunded = payment?.refundStatus === "refunded";

  return (
    <>
      <Navbar />
      <main className="booking-details-shell">
        <div className="bd-back-row">
          <Link to="/my-bookings">← Мои бронирования</Link>
          <span>{booking.provider_client_reference || `TRAVIO-${booking.id}`}</span>
        </div>

        <section className="bd-hero">
          <div className="bd-hero-image">
            {booking.image ? <img src={booking.image} alt={booking.hotel} /> : <div className="bd-image-placeholder">🏨</div>}
          </div>
          <div className="bd-hero-main">
            <div className="bd-kicker">ЗАКАЗ ASEDELIYA</div>
            <h1>{booking.hotel}</h1>
            <p className="bd-location">📍 {text(booking.city, "")}{booking.city && booking.country ? ", " : ""}{text(booking.country, "")}</p>
            <div className="bd-badges">
              <span className={`bd-badge ${statusTone(local)}`}>{local}</span>
              {derived.isHotelbeds && <span className="bd-badge test">HOTELBEDS TEST</span>}
              {payment && !derived.isHotelbeds && <span className={`bd-badge ${statusTone(payment.status)}`}>{paymentLabel(payment, false)}</span>}
            </div>
            <div className="bd-ref-grid">
              <div><small>Asedeliya reference</small><strong>{booking.provider_client_reference || `TRAVIO-${booking.id}`}</strong></div>
              <div><small>Provider reference</small><strong>{booking.provider_booking_id || "—"}</strong></div>
              <div><small>Создано</small><strong>{dateTime(booking.booking_date)}</strong></div>
              <div><small>Стоимость</small><strong>{formatMoney(amount, booking.currency || "KZT")}</strong></div>
            </div>
          </div>
        </section>

        {derived.isHotelbeds && (
          <div className="bd-test-note">
            <strong>TEST Hotelbeds.</strong> Это тестовая бронь поставщика и не является подтверждением реального заселения или оплаты.
          </div>
        )}
        {sandboxNoCharge && !sandboxRefunded && (
          <div className="bd-sandbox-note">
            🧪 Sandbox-оплата подтверждена. <strong>Реального списания денег не было.</strong>
          </div>
        )}
        {sandboxRefunded && (
          <div className="bd-sandbox-note">
            ↩️ Sandbox-возврат завершён. <strong>Реального возврата денег не было.</strong>
          </div>
        )}

        <div className="bd-layout">
          <div className="bd-main-column">
            <section className="bd-card">
              <div className="bd-card-title"><h2>Поездка</h2><span>Данные зафиксированы в snapshot брони</span></div>
              <div className="bd-facts-grid">
                <div><small>Заезд</small><strong>{dateOnly(derived.checkIn)}</strong></div>
                <div><small>Выезд</small><strong>{dateOnly(derived.checkOut)}</strong></div>
                <div><small>Ночей</small><strong>{derived.nights || "—"}</strong></div>
                <div><small>Гостей</small><strong>{booking.people || derived.travelers.length || "—"}</strong></div>
                <div><small>Питание</small><strong>{derived.board}</strong></div>
                <div><small>Номер / тариф</small><strong>{derived.room}</strong></div>
              </div>
              {hasPriceDelta && (
                <div className="bd-inline-warning">⚠️ Цена изменилась: было {formatMoney(quote, booking.quoted_currency || booking.currency)}, подтверждено {formatMoney(amount, booking.currency)}.</div>
              )}
            </section>

            <section className="bd-card">
              <div className="bd-card-title"><h2>Туристы</h2><span>{derived.travelers.length || booking.people || 0} проф.</span></div>
              {derived.travelers.length > 0 ? (
                <div className="bd-travelers">
                  {derived.travelers.map((traveler, index) => (
                    <div className="bd-traveler" key={`${traveler.firstName}-${traveler.lastName}-${index}`}>
                      <div className="bd-traveler-index">{index + 1}</div>
                      <div><strong>{text(traveler.firstName, "")} {text(traveler.lastName, "")}</strong><span>{String(traveler.type || "AD").toUpperCase() === "CH" ? "Ребёнок" : "Взрослый"}</span></div>
                      <div><small>Дата рождения</small><strong>{dateOnly(traveler.birthDate)}</strong></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bd-empty-line">Данные туристов не сохранены у этой старой брони.</div>
              )}
            </section>

            <section className="bd-card">
              <div className="bd-card-title"><h2>История заказа</h2><span>Audit trail</span></div>
              {events.length > 0 ? (
                <div className="bd-timeline">
                  {events.map((event) => (
                    <div className="bd-event" key={event.id}>
                      <div className="bd-event-icon">{eventIcon(event.event_type)}</div>
                      <div className="bd-event-body">
                        <div className="bd-event-head"><strong>{event.title}</strong><time>{dateTime(event.occurred_at)}</time></div>
                        {event.description && <p>{event.description}</p>}
                        <div className="bd-event-meta">
                          {event.status && <span>{event.status}</span>}
                          <span>{event.actor_type === "provider" ? "Поставщик" : event.actor_type === "customer" ? "Клиент" : "Asedeliya"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="bd-empty-line">История появится после миграции Sprint 2I.</div>}
            </section>
          </div>

          <aside className="bd-side-column">
            <section className="bd-card bd-payment-card">
              <div className="bd-card-title"><h2>Оплата</h2></div>
              {derived.isHotelbeds ? (
                <div className="bd-payment-test"><strong>Hotelbeds TEST</strong><p>Локальная оплата Asedeliya для этой брони не используется.</p></div>
              ) : payment ? (
                <div className="bd-payment-data">
                  <div><span>Статус</span><strong>{paymentLabel(payment, false)}</strong></div>
                  <div><span>Сумма</span><strong>{formatMoney(payment.amount, payment.currency)}</strong></div>
                  <div><span>Провайдер</span><strong>{payment.gatewayProvider || "—"}</strong></div>
                  <div><span>Метод</span><strong>{payment.method || "—"}</strong></div>
                  <div><span>Дата</span><strong>{dateTime(payment.paidAt)}</strong></div>
                  <div><span>Refund status</span><strong>{payment.refundStatus || "not_requested"}</strong></div>
                  {Number(payment.refundedAmount || 0) > 0 && (
                    <div><span>Возвращено</span><strong>{formatMoney(payment.refundedAmount, payment.currency)}</strong></div>
                  )}
                  {payment.idempotencyKey && <div><span>Idempotency</span><code>{payment.idempotencyKey}</code></div>}
                </div>
              ) : <div className="bd-empty-line">Платёжная запись отсутствует.</div>}
            </section>

            <section className="bd-card">
              <div className="bd-card-title"><h2>Поставщик</h2></div>
              <div className="bd-payment-data">
                <div><span>Provider</span><strong>{booking.provider || "legacy"}</strong></div>
                <div><span>Статус</span><strong>{booking.provider_status || "—"}</strong></div>
                <div><span>Последняя синхронизация</span><strong>{dateTime(booking.provider_synced_at)}</strong></div>
                {booking.provider_reconciled_at && <div><span>Reconciliation</span><strong>{dateTime(booking.provider_reconciled_at)}</strong></div>}
              </div>
              {booking.provider_last_error && (
                <div className="bd-error-box"><strong>Последняя ошибка</strong><p>{booking.provider_last_error.message || booking.provider_last_error.code || "Ошибка поставщика"}</p></div>
              )}
            </section>

            {(derived.providerCancelled || booking.provider_cancellation_snapshot) && (
              <section className="bd-card">
                <div className="bd-card-title"><h2>Отмена</h2></div>
                <div className="bd-payment-data">
                  <div><span>Статус</span><strong>{derived.providerCancelled ? "Отменено у поставщика" : "Условия проверены"}</strong></div>
                  <div><span>Дата отмены</span><strong>{dateTime(booking.provider_cancelled_at || booking.cancelled_at)}</strong></div>
                  <div><span>Snapshot</span><strong>{booking.provider_cancellation_snapshot ? "Сохранён" : "—"}</strong></div>
                </div>
              </section>
            )}

            <section className="bd-card">
              <div className="bd-card-title"><h2>Возврат</h2><span>{refund?.mode || "—"}</span></div>
              {refund && (
                <>
                  <div className="bd-payment-data">
                    <div><span>Статус</span><strong>{refund.status}</strong></div>
                    <div><span>Доступно</span><strong>{formatMoney(refund.refundableAmount || 0, refund.currency || booking.currency)}</strong></div>
                    <div><span>Уже возвращено</span><strong>{formatMoney(refund.refundedAmount || 0, refund.currency || booking.currency)}</strong></div>
                    <div><span>Реальный refund</span><strong className="bd-off">ВЫКЛЮЧЕН</strong></div>
                  </div>
                  <p className="bd-small-copy">{refund.message}</p>
                  {!derived.isHotelbeds && refund.requestEnabled && (
                    <button type="button" className="bd-refund-request-btn" disabled={busy} onClick={handleRequestRefund}>↩️ Запросить тестовый возврат</button>
                  )}
                  {!derived.isHotelbeds && refund.completeEnabled && (
                    <button type="button" className="bd-refund-complete-btn" disabled={busy} onClick={handleCompleteRefund}>✅ Завершить sandbox-возврат</button>
                  )}
                  {latestRefund && (
                    <div className="bd-refund-record">
                      <div><span>Refund #{latestRefund.id}</span><strong>{latestRefund.status}</strong></div>
                      <div><span>Сумма</span><strong>{formatMoney(latestRefund.amount || 0, latestRefund.currency || booking.currency)}</strong></div>
                      {latestRefund.idempotency_key && <code>{latestRefund.idempotency_key}</code>}
                      {latestRefund.requested_at && <small>Запрошен: {dateTime(latestRefund.requested_at)}</small>}
                      {latestRefund.processed_at && <small>Завершён: {dateTime(latestRefund.processed_at)}</small>}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="bd-card">
              <div className="bd-card-title"><h2>Контакты</h2></div>
              <div className="bd-contact-list">
                <strong>{booking.first_name} {booking.last_name}</strong>
                <span>📞 {booking.phone}</span>
                <span>✉️ {booking.email}</span>
                {booking.comment && <p>Комментарий: {booking.comment}</p>}
              </div>
            </section>

            <section className="bd-card">
              <div className="bd-card-title"><h2>Документы и действия</h2></div>
              <div className="bd-actions">
                <Link to={`/voucher/${booking.id}`} className={`bd-primary-btn ${derived.isHotelbeds && !booking.provider_booking_id ? "disabled" : ""}`} onClick={(e) => { if (derived.isHotelbeds && !booking.provider_booking_id) e.preventDefault(); }}>📄 Открыть ваучер</Link>
                <button type="button" className="bd-secondary-btn" disabled={busy || (derived.isHotelbeds && !booking.provider_booking_id)} onClick={handlePdf}>⬇️ Скачать PDF</button>
                {derived.isHotelbeds && (
                  <>
                    <button type="button" className="bd-secondary-btn" disabled={busy || !derived.canSync} onClick={handleSync}>🔄 Синхронизировать HB</button>
                    <button type="button" className="bd-danger-btn" disabled={busy || !derived.canCancel} onClick={handleCancel}>{derived.providerCancelled ? "Отменено в HB" : "Отменить через HB TEST"}</button>
                  </>
                )}
              </div>
            </section>

            {notifications.length > 0 && (
              <section className="bd-card">
                <div className="bd-card-title"><h2>Email</h2><span>{notifications.length}</span></div>
                <div className="bd-notifications">
                  {notifications.slice(0, 5).map((item) => (
                    <div key={item.id}><span>{item.subject}</span><strong>{item.status}</strong></div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
