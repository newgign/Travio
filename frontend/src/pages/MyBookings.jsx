import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import {
    cancelProviderBooking,
    downloadBookingVoucherPdf,
    getMyBookings,
    simulateProviderCancellation,
    syncProviderBooking,
} from "../services/bookingService";
import { formatMoney } from "../utils/money";

import "../styles/MyBookings.css";

function providerStatusLabel(status) {
    const value = String(status || "").toUpperCase();
    const labels = {
        CONFIRMED: "CONFIRMED",
        MODIFIED: "MODIFIED",
        CANCELLED: "CANCELLED",
        CANCELED: "CANCELLED",
        CONFIRMING: "Подтверждается",
        CONFIRMATION_UNKNOWN: "Требует сверки",
        CONFIRMATION_FAILED: "Не подтверждена",
        RATE_EXPIRED: "Тариф недоступен",
        LOCAL_PENDING: "Готово к отправке",
    };
    return labels[value] || status || "—";
}

function localStatusLabel(booking) {
    const providerStatus = String(booking.provider_status || "").toUpperCase();
    if (["RATE_EXPIRED", "CONFIRMATION_FAILED"].includes(providerStatus)) {
        return "Не подтверждена";
    }
    if (providerStatus === "CONFIRMATION_UNKNOWN") {
        return "Требует сверки";
    }
    return booking.status;
}

export default function MyBookings() {
    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user?.id;

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");

    useEffect(() => {
        let active = true;

        async function load() {
            if (!userId) {
                if (active) setLoading(false);
                return;
            }

            try {
                const data = await getMyBookings();
                if (active) setBookings(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error(error);
            } finally {
                if (active) setLoading(false);
            }
        }

        load();

        return () => {
            active = false;
        };
    }, [userId]);

    const bookingStats = useMemo(() => {
        const total = bookings.length;
        const confirmed = bookings.filter((booking) => {
            const providerStatus = String(booking.provider_status || "").toUpperCase();
            return booking.status === "Подтверждена" || ["CONFIRMED", "MODIFIED"].includes(providerStatus);
        }).length;
        const attention = bookings.filter((booking) =>
            ["CONFIRMATION_UNKNOWN", "CONFIRMATION_FAILED", "RATE_EXPIRED"].includes(String(booking.provider_status || "").toUpperCase())
        ).length;
        const cancelled = bookings.filter((booking) => {
            const providerStatus = String(booking.provider_status || "").toUpperCase();
            return booking.status === "Отменена" || ["CANCELLED", "CANCELED"].includes(providerStatus);
        }).length;
        return { total, confirmed, attention, cancelled };
    }, [bookings]);

    const filteredBookings = useMemo(() => {
        let data = [...bookings];

        if (status !== "all") {
            data = data.filter((booking) => {
                const providerStatus = String(booking.provider_status || "").toUpperCase();
                if (status === "cancelled") {
                    return booking.status === "Отменена" || ["CANCELLED", "CANCELED"].includes(providerStatus);
                }
                if (status === "test") return booking.provider === "hotelbeds";
                if (status === "confirmed") {
                    return booking.status === "Подтверждена" || ["CONFIRMED", "MODIFIED"].includes(providerStatus);
                }
                if (status === "attention") {
                    return ["CONFIRMATION_UNKNOWN", "CONFIRMATION_FAILED", "RATE_EXPIRED"].includes(providerStatus);
                }
                return booking.payment_status === status;
            });
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            data = data.filter(
                (booking) =>
                    String(booking.hotel || "").toLowerCase().includes(q) ||
                    String(booking.country || "").toLowerCase().includes(q) ||
                    String(booking.city || "").toLowerCase().includes(q) ||
                    String(booking.provider_booking_id || "").toLowerCase().includes(q) ||
                    String(booking.provider_client_reference || "").toLowerCase().includes(q)
            );
        }

        data.sort((a, b) => new Date(b.booking_date) - new Date(a.booking_date));
        return data;
    }, [bookings, search, status]);

    function replaceBooking(updatedBooking) {
        setBookings((current) =>
            current.map((booking) =>
                Number(booking.id) === Number(updatedBooking.id)
                    ? { ...booking, ...updatedBooking }
                    : booking
            )
        );
    }

    async function handleSync(booking) {
        try {
            setActionId(booking.id);
            const result = await syncProviderBooking(booking.id);
            if (result?.booking) replaceBooking(result.booking);
            if (result?.noMatch && result?.message) alert(result.message);
        } catch (error) {
            alert(error.message || "Не удалось синхронизировать Hotelbeds-бронь");
        } finally {
            setActionId(null);
        }
    }

    async function handleCancel(booking) {
        try {
            setActionId(booking.id);

            const simulation = await simulateProviderCancellation(booking.id);
            const currency = simulation?.currency || booking.currency || "EUR";
            const fee = simulation?.cancellationFee;

            const feeText = Number.isFinite(Number(fee))
                ? formatMoney(Number(fee), currency)
                : "Hotelbeds не вернул отдельную сумму штрафа";

            const accepted = window.confirm(
                `Hotelbeds TEST: расчёт отмены — ${feeText}.\n\nПродолжить отмену тестовой брони ${booking.provider_booking_id}?`
            );

            if (!accepted) return;

            const result = await cancelProviderBooking(booking.id, {
                expectedFee: Number.isFinite(Number(fee)) ? Number(fee) : null,
            });

            if (result?.booking) replaceBooking(result.booking);
        } catch (error) {
            alert(error.message || "Не удалось отменить Hotelbeds-бронь");
        } finally {
            setActionId(null);
        }
    }

    async function handlePdf(booking) {
        try {
            setActionId(booking.id);
            const { blob, filename } = await downloadBookingVoucherPdf(booking.id);
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
            setActionId(null);
        }
    }

    return (
        <>
            <Navbar />

            <div className="my-bookings">
                <div className="page-title">
                    <h1>📅 Мои бронирования</h1>
                    <p>Все поездки, статусы, документы и действия в одном месте</p>
                </div>

                {!loading && bookings.length > 0 && (
                    <div className="booking-summary">
                        <button type="button" className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}><strong>{bookingStats.total}</strong><span>Все поездки</span></button>
                        <button type="button" className={status === "confirmed" ? "active" : ""} onClick={() => setStatus("confirmed")}><strong>{bookingStats.confirmed}</strong><span>Подтверждено</span></button>
                        <button type="button" className={status === "attention" ? "attention active" : "attention"} onClick={() => setStatus("attention")}><strong>{bookingStats.attention}</strong><span>Требуют внимания</span></button>
                        <button type="button" className={status === "cancelled" ? "active" : ""} onClick={() => setStatus("cancelled")}><strong>{bookingStats.cancelled}</strong><span>Отменено</span></button>
                    </div>
                )}

                {!loading && bookings.length > 0 && (
                    <div className="booking-toolbar">
                        <input
                            type="text"
                            placeholder="Поиск по отелю, HB reference или Asedeliya reference..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />

                        <select value={status} onChange={(event) => setStatus(event.target.value)}>
                            <option value="all">Все</option>
                            <option value="test">Hotelbeds TEST</option>
                            <option value="confirmed">Подтверждённые</option>
                            <option value="attention">Требуют внимания</option>
                            <option value="paid">Оплачено</option>
                            <option value="pending">Ожидает оплаты</option>
                            <option value="cancelled">Отменено</option>
                        </select>
                    </div>
                )}

                {loading ? (
                    <div className="empty-bookings"><h2>Загрузка...</h2></div>
                ) : filteredBookings.length === 0 ? (
                    <div className="empty-bookings">
                        <h2>Бронирования не найдены</h2>
                        <Link to="/" className="back-home">Найти тур</Link>
                    </div>
                ) : (
                    <div className="booking-list">
                        {filteredBookings.map((booking) => {
                            const isHotelbeds = booking.provider === "hotelbeds";
                            const providerStatus = String(booking.provider_status || "").toUpperCase();
                            const providerCancelled = ["CANCELLED", "CANCELED"].includes(providerStatus);
                            const providerFailed = ["RATE_EXPIRED", "CONFIRMATION_FAILED"].includes(providerStatus);
                            const busy = Number(actionId) === Number(booking.id);
                            const canSync = isHotelbeds && Boolean(
                                booking.provider_booking_id || booking.provider_client_reference
                            );
                            const canCancel = isHotelbeds && Boolean(
                                booking.provider_booking_id && !providerCancelled && !providerFailed
                            );

                            const actualAmount = Number(booking.price) || 0;
                            const quote = Number(booking.quoted_amount) || Number(booking.offer_snapshot?.price) || 0;
                            const hasPriceDelta = quote > 0 && Math.abs(actualAmount - quote) > 0.01;
                            const displayStatus = localStatusLabel(booking);
                            const statusTone = providerFailed
                                ? "provider-failed"
                                : providerStatus === "CONFIRMATION_UNKNOWN"
                                    ? "provider-unknown"
                                    : providerCancelled
                                        ? "provider-cancelled"
                                        : ["CONFIRMED", "MODIFIED"].includes(providerStatus)
                                            ? "provider-confirmed"
                                            : "provider-pending";

                            return (
                                <div className="booking-card" key={booking.id}>
                                    <img src={booking.image} alt={booking.hotel} />

                                    <div className="booking-content">
                                        <div className="booking-top">
                                            <div>
                                                <h2>{booking.hotel}</h2>
                                                <p>📍 {booking.city}{booking.city && booking.country ? ", " : ""}{booking.country}</p>
                                            </div>

                                            <span className={`status ${statusTone}`}>
                                                {displayStatus}
                                            </span>
                                        </div>

                                        <div className="booking-info">
                                            <span>👥 {booking.people} турист(ов)</span>
                                            <span>💰 {formatMoney(actualAmount, booking.currency || "KZT")}</span>
                                            <span>📅 {new Date(booking.booking_date).toLocaleDateString("ru-RU")}</span>
                                            <span>🧾 {booking.provider_client_reference || `TRAVIO-${booking.id}`}</span>

                                            {isHotelbeds && booking.provider_booking_id && (
                                                <span>🏨 HB: {booking.provider_booking_id}</span>
                                            )}

                                            {isHotelbeds && booking.provider_status && (
                                                <span>🔄 HB: {providerStatusLabel(booking.provider_status)}</span>
                                            )}

                                            {hasPriceDelta && (
                                                <span className="booking-price-warning">
                                                    ⚠️ Было {formatMoney(quote, booking.quoted_currency || booking.currency || "EUR")}
                                                </span>
                                            )}
                                        </div>

                                        {providerFailed && (
                                            <div className="booking-provider-message">
                                                Hotelbeds не создал эту бронь. Для бронирования нужен новый поиск и новый rateKey.
                                            </div>
                                        )}

                                        <div className="booking-actions">
                                            <Link className="details-btn" to={`/my-bookings/${booking.id}`}>
                                                🧾 Открыть заказ
                                            </Link>

                                            {isHotelbeds ? (
                                                <>
                                                    {providerFailed ? (
                                                        <Link to="/" className="details-btn">
                                                            🔎 Найти новый тариф
                                                        </Link>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="details-btn"
                                                            disabled={busy || !canSync}
                                                            onClick={() => handleSync(booking)}
                                                        >
                                                            {busy ? "Обработка..." : "🔄 Синхронизировать HB"}
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="cancel-btn"
                                                        disabled={busy || !canCancel}
                                                        onClick={() => handleCancel(booking)}
                                                    >
                                                        {providerCancelled ? "Отменено в HB" : "Отменить через HB TEST"}
                                                    </button>
                                                </>
                                            ) : (
                                                <Link
                                                    to={
                                                        booking.provider &&
                                                        booking.provider !== "legacy" &&
                                                        booking.provider_hotel_id
                                                            ? `/tour/${encodeURIComponent(booking.provider)}/${encodeURIComponent(booking.provider_hotel_id)}`
                                                            : `/tour/${booking.tour_id}`
                                                    }
                                                    className="details-btn"
                                                >
                                                    🏨 Страница тура
                                                </Link>
                                            )}

                                            {isHotelbeds && !booking.provider_booking_id ? (
                                                <button className="voucher-btn" disabled>
                                                    📄 Ваучер
                                                </button>
                                            ) : (
                                                <>
                                                    <Link className="voucher-btn" to={`/voucher/${booking.id}`}>
                                                        📄 Ваучер / PDF
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        className="voucher-btn"
                                                        disabled={busy}
                                                        onClick={() => handlePdf(booking)}
                                                    >
                                                        ⬇️ PDF
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Footer />
        </>
    );
}
