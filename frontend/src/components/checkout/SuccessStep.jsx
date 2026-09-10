import { Link } from "react-router-dom";
import { formatMoney } from "../../utils/money";

export default function SuccessStep({ bookingId, checkout, paymentResult }) {
    const orderNumber = `TRV-${String(bookingId).padStart(6, "0")}`;
    const isHotelbeds = checkout?.tour?.provider === "hotelbeds";
    const providerBookingId = paymentResult?.booking?.provider_booking_id || null;
    const providerStatus = paymentResult?.booking?.provider_status || null;
    const finalCurrency = paymentResult?.booking?.currency || checkout?.tour?.currency || checkout?.currency || "KZT";
    const quotedTotal = Number(paymentResult?.booking?.quoted_amount) || Number(checkout?.total) || 0;
    const finalTotal = Number(paymentResult?.booking?.total_amount) || Number(checkout?.total) || 0;
    const priceChanged = Math.abs(finalTotal - quotedTotal) > 0.01;
    const payment = paymentResult?.payment || null;
    const isSandboxPayment =
        !isHotelbeds &&
        payment?.gateway_provider === "sandbox" &&
        payment?.metadata?.realCharge === false;

    return (
        <div className="checkout-card success">
            <div className="success-icon">✅</div>

            <h1>{isHotelbeds ? "Hotelbeds TEST-бронирование создано!" : "Бронирование успешно оформлено!"}</h1>

            <p className="checkout-subtitle">
                {isHotelbeds
                    ? "Asedeliya получил подтверждение Hotelbeds Booking API. Это TEST-среда: реального списания денег и реальной гостиничной брони нет."
                    : <>Спасибо, что выбрали <strong>Asedeliya</strong>. Ваше бронирование зарегистрировано.</>}
            </p>

            <div className="success-order">
                <div><span>Номер Asedeliya</span><h2>{orderNumber}</h2></div>
                <div><span>Статус</span><h3 style={{ color: "#16a34a", marginTop: "8px" }}>✔ {isHotelbeds ? providerStatus || "CONFIRMED" : "Подтверждено"}</h3></div>
            </div>

            {isHotelbeds && providerBookingId && (
                <div className="review-block">
                    <h3>Подтверждение поставщика</h3>
                    <div className="price-row"><span>Hotelbeds reference</span><strong>{providerBookingId}</strong></div>
                    <div className="price-row"><span>Подтверждённая стоимость</span><strong>{formatMoney(finalTotal, finalCurrency)}</strong></div>
                    {priceChanged && (
                        <div className="checkout-provider-warning">
                            Цена поставщика отличается от суммы, показанной до Booking: {formatMoney(quotedTotal, finalCurrency)} → {formatMoney(finalTotal, finalCurrency)}.
                            Это отклонение цены требует проверки. Новые запросы после hotfix отправляются с явным tolerance: 0.
                        </div>
                    )}
                </div>
            )}

            {checkout && (
                <div className="success-tour">
                    <img src={checkout.tour.image} alt={checkout.tour.hotel} />
                    <div className="success-tour-info">
                        <h2>{checkout.tour.hotel}</h2>
                        <p>📍 {checkout.tour.city}, {checkout.tour.country}</p>
                        {Number(checkout.tour.rating) > 0 && <p>⭐ {checkout.tour.rating}</p>}
                        <p>🌙 {checkout.tour.nights || checkout.tour.duration} ночей</p>
                        {checkout.tour.food && <p>🍽 {checkout.tour.food}</p>}
                        <h3>{formatMoney(finalTotal, finalCurrency)}</h3>
                    </div>
                </div>
            )}

            <div className="success-info">
                <div>📧 Контактный Email сохранён в заявке Asedeliya.</div>
                <div>📱 Статус бронирования доступен в личном кабинете.</div>
                {isHotelbeds ? (
                    <div>🔄 Hotelbeds-бронь можно синхронизировать и отменить из «Моих бронирований».</div>
                ) : isSandboxPayment ? (
                    <div>🧪 Оплата проведена в sandbox. Реального списания денег не было.</div>
                ) : (
                    <div>💳 Статус оплаты сохранён вместе с бронированием.</div>
                )}
            </div>

            <div className="success-buttons">
                <Link to={`/my-bookings/${bookingId}`} className="next-btn">🧾 Открыть заказ</Link>
                <Link to={`/voucher/${bookingId}`} className="voucher-btn">📄 Ваучер / PDF</Link>
                <Link to="/my-bookings" className="next-btn">Мои бронирования</Link>
                <Link to="/" className="back-btn">На главную</Link>
            </div>
        </div>
    );
}
