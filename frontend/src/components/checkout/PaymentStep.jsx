import { useState } from "react";
import { formatMoney } from "../../utils/money";

export default function PaymentStep({
    checkout,
    back,
    onPay,
    loading,
}) {
    const [method, setMethod] = useState("Kaspi");

    const currency = checkout?.tour?.currency || checkout?.currency || "KZT";
    const isHotelbeds = checkout?.tour?.provider === "hotelbeds";

    if (isHotelbeds && (checkout.tour.priceEnvironment === 'live' || checkout.tour.bookingDisabled || (import.meta.env.PROD && checkout.tour.priceEnvironment === 'test'))) {
        return <div className="checkout-card"><h1>Бронирование пока недоступно</h1>
            {checkout.tour.priceEnvironment === 'test' && <p>Hotelbeds TEST / Evaluation — только техническое тестирование.</p>}
            <p>Стоимость проживания: {formatMoney(checkout.total, currency)}. Приём оплаты и подтверждение бронирований ещё не подключены.</p>
            <button className="back-btn" onClick={back}>Назад</button>
        </div>;
    }

    const methods = [
        { id: "Kaspi", icon: "🟢", title: "Kaspi QR", description: "Оплата через Kaspi QR" },
        { id: "Visa", icon: "💳", title: "Visa", description: "Банковская карта Visa" },
        { id: "MasterCard", icon: "💳", title: "MasterCard", description: "Банковская карта MasterCard" },
        { id: "Freedom", icon: "🏦", title: "Freedom Bank", description: "Оплата через Freedom" },
        { id: "Halyk", icon: "🏛", title: "Halyk Bank", description: "Оплата через Halyk" },
        { id: "Office", icon: "🏢", title: "В офисе", description: "Оплата при посещении офиса" },
    ];

    function handlePay() {
        onPay(isHotelbeds ? "HOTELBEDS_TEST" : method);
    }

    return (
        <div className="checkout-card">
            <h1>{isHotelbeds ? "Подтверждение Hotelbeds TEST" : "Выберите способ оплаты"}</h1>

            <p className="checkout-subtitle">
                {isHotelbeds
                    ? "Asedeliya отправит только выбранный rateKey в Hotelbeds Booking API. Реального списания и LIVE-бронирования в этом режиме нет."
                    : "После успешной оплаты бронирование автоматически подтвердится."}
            </p>

            {isHotelbeds ? (
                <div className="review-block">
                    <h3>Перед отправкой</h3>
                    <div className="price-row"><span>Booking API</span><strong>TEST</strong></div>
                    <div className="price-row"><span>Тип тарифа</span><strong>{checkout.tour.rateType || "BOOKABLE"}</strong></div>
                    <div className="price-row"><span>Оплата поставщику</span><strong>{checkout.tour.paymentType || "AT_WEB"}</strong></div>
                    <div className="price-row"><span>Допуск изменения цены в Booking API</span><strong>0%</strong></div>
                    <div className="price-row"><span>Локальная оплата</span><strong>Не выполняется</strong></div>
                </div>
            ) : (
                <div className="payment-grid">
                    {methods.map((item) => (
                        <div
                            key={item.id}
                            className={method === item.id ? "payment-card active" : "payment-card"}
                            onClick={() => setMethod(item.id)}
                        >
                            <div className="payment-icon">{item.icon}</div>
                            <h3>{item.title}</h3>
                            <p>{item.description}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="payment-summary">
                <div className="summary-row">
                    <span>{isHotelbeds ? "Режим" : "Способ оплаты"}</span>
                    <strong>{isHotelbeds ? "Hotelbeds TEST" : method}</strong>
                </div>
                <div className="summary-row">
                    <span>{isHotelbeds ? "Подтверждаемая стоимость проживания" : "К оплате"}</span>
                    <strong>{formatMoney(checkout.total, currency)}</strong>
                </div>
            </div>

            <div className="payment-note">
                {isHotelbeds
                    ? "🧪 Asedeliya отправляет tolerance: 0. Если Hotelbeds отклонит исходную цену или тариф станет недоступен, потребуется новый поиск."
                    : "🔒 Все платежи защищены. Мы используем безопасное соединение для передачи данных."}
            </div>

            <div className="checkout-buttons">
                <button className="back-btn" onClick={back}>← Назад</button>
                <button className="next-btn" disabled={loading} onClick={handlePay}>
                    {loading
                        ? isHotelbeds ? "Отправляем Booking API..." : "Обработка оплаты..."
                        : isHotelbeds
                            ? `Создать TEST-бронь ${formatMoney(checkout.total, currency)}`
                            : `Оплатить ${formatMoney(checkout.total, currency)}`}
                </button>
            </div>
        </div>
    );
}
