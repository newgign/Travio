import CheckoutRateStatus from "./CheckoutRateStatus";
import { createCheckoutReview } from "../../services/checkoutReview";
import RateConditions from "../RateConditions";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getCheckout } from "../../services/checkoutService";
import { formatMoney } from "../../utils/money";


export default function ReviewStep({
    bookingData,
    setCheckout,
    back,
    next,
    provider = "mock",
    tourId,
    offerToken = null,
}) {

    const location = useLocation();
    const navigate = useNavigate();
    const review = useMemo(() => createCheckoutReview(() => {
        const filters = Object.fromEntries(new URLSearchParams(location.search).entries());
        const people = Number(bookingData.adults) || Number(filters.people) || 2;
        return getCheckout({ provider, hotelId: tourId, tourId, offerToken, people,
            filters: { ...filters, people, nights: Number(filters.nights) || 7, children: Number(filters.children) || 0 } });
    }), [provider, tourId, offerToken, location.search, bookingData.adults]);
    const state = useSyncExternalStore(review.subscribe, review.getSnapshot, review.getSnapshot);
    const acceptedPriceToken = state.acceptedPriceToken;
    useEffect(() => {
        const timer = setTimeout(() => { review.load(); }, 0);
        return () => clearTimeout(timer);
    }, [review]);
    useEffect(() => { setCheckout(state.data); }, [state.data, setCheckout]);
    // Render only this transition's result, never the parent's stale offer.
    const checkout = state.data;
    if (state.status === 'CHECKING' || !checkout) return <CheckoutRateStatus
        status={state.status} retry={() => review.load()}
        back={() => { if (state.status === 'UNAVAILABLE') navigate(`/results${location.search}`); else back(); }} />;
    return <CheckoutReviewView checkout={checkout} bookingData={bookingData} acceptedPriceToken={acceptedPriceToken}
        acceptPrice={review.acceptPrice} back={back}
        next={() => { const confirmed = review.confirmedCheckout(); if (confirmed) { setCheckout(confirmed); next(); } }} />;
}

export function CheckoutReviewView({ checkout, bookingData, acceptedPriceToken, acceptPrice, back, next }) {
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [agreePolicy, setAgreePolicy] = useState(false);

    // =====================================
    // Tour
    // =====================================

    const tour = checkout.tour;


    const hotelName =
        tour.name ||
        tour.hotel ||
        tour.title ||
        "Отель";


    const image =
        tour.image ||
        tour.images?.[0] ||
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=85";


    const nights =
        Number(tour.nights) ||
        Number(tour.duration) ||
        7;


    // =====================================
    // Prices
    // =====================================

    const pricePerPerson =
        Number(checkout.pricePerPerson) || 0;

    const people =
        Number(checkout.people) || 1;

    const subtotal =
        Number(checkout.subtotal) || 0;

    const discount =
        Number(checkout.discount) || 0;

    const insurance =
        Number(checkout.insurance) || 0;

    const serviceFee =
        Number(checkout.serviceFee) || 0;

    const total =
        Number(checkout.total) || 0;


    const currency =
        tour.currency || checkout.currency || "KZT";

    const isHotelbeds = tour.provider === "hotelbeds";


    return (

        <div className="checkout-card">

            {/* =================================
                HEADER
            ================================= */}

            <h1>
                Подтверждение стоимости
            </h1>

            <p className="checkout-subtitle">

                Проверьте подтверждённую стоимость. Проверка тарифа не является подтверждением бронирования.
                Бронирование и оплата Hotelbeds недоступны.

            </p>


            {/* =================================
                TOUR
            ================================= */}

            <div className="review-tour">

                <img
                    src={image}
                    alt={hotelName}
                    onError={(event) => {

                        event.currentTarget.src =
                            "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=85";

                    }}
                />

                <div>

                    <h2>
                        {hotelName}
                    </h2>


                    <p>

                        📍 {tour.city}

                        {tour.city && tour.country
                            ? ", "
                            : ""}

                        {tour.country}

                    </p>


                    {Number(tour.rating) > 0 && (

                        <p>
                            ⭐ {Number(tour.rating).toFixed(1)}
                        </p>

                    )}


                    <p>
                        🌙 {nights} ночей
                    </p>


                    {tour.roomName && <p>Номер: {tour.roomName}</p>}
                    {tour.food && (

                        <p>
                            🍽 {tour.food}
                        </p>

                    )}


                    {tour.airline?.name && (

                        <p>
                            ✈️ {tour.airline.name}
                        </p>

                    )}


                    {tour.operator?.name && (

                        <p>
                            🧳 {tour.operator.name}
                        </p>

                    )}

                </div>

            </div>


            {/* =================================
                TRAVELERS
            ================================= */}

            <div className="review-block">

                <h3>
                    Туристы
                </h3>

                {(bookingData.travelers || []).map((traveler, index) => (
                    <div className="price-row" key={`${traveler.type}-${index}`}>
                        <span>
                            {traveler.type === "CH"
                                ? `Ребёнок ${index - Number(bookingData.adults || 0) + 1}`
                                : `Взрослый ${index + 1}`}
                        </span>

                        <strong>
                            {traveler.firstName} {traveler.lastName}
                        </strong>
                    </div>
                ))}


                <div className="price-row">

                    <span>
                        Телефон
                    </span>

                    <strong>
                        {bookingData.phone}
                    </strong>

                </div>


                <div className="price-row">

                    <span>
                        Email
                    </span>

                    <strong>
                        {bookingData.email}
                    </strong>

                </div>


                <div className="price-row">

                    <span>
                        Количество туристов
                    </span>

                    <strong>
                        {people}
                    </strong>

                </div>


                {bookingData.comment && (

                    <div className="review-comment">

                        <strong>
                            Комментарий
                        </strong>

                        <p>
                            {bookingData.comment}
                        </p>

                    </div>

                )}

            </div>


            {/* =================================
                PRICE
            ================================= */}

            <div className="review-block">
                <h3>{isHotelbeds ? `Стоимость проживания (${currency})` : "Расчет стоимости"}</h3>

                {isHotelbeds ? (
                    <>
                        {checkout.priceChangedAtCheckRate && (
                            <div className="checkout-provider-warning">
                                Поставщик изменил стоимость предложения.
                                {" "}{formatMoney(checkout.previousTotal, currency)} → {formatMoney(total, currency)}.
                                <label><input type="checkbox" checked={acceptedPriceToken === checkout.checkoutToken} onChange={event => acceptPrice(event.target.checked)} />Подтверждаю новую стоимость проживания</label>
                            </div>
                        )}

                        <div className="price-row">
                            <span>Проживание для {people} турист(ов)</span>
                            <strong>{formatMoney(subtotal, currency)}</strong>
                        </div>

                        <div className="price-row">
                            <span>Страховка / перелёт / трансфер</span>
                            <strong>Не включены</strong>
                        </div>

                        <hr />

                        <div className="price-total">
                            <span>Итого по бронированию</span>
                            <span>{formatMoney(total, currency)}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="price-row">
                            <span>Цена за человека</span>
                            <strong>{formatMoney(pricePerPerson, currency)}</strong>
                        </div>

                        <div className="price-row">
                            <span>Туристов</span>
                            <strong>× {people}</strong>
                        </div>

                        <div className="price-row">
                            <span>Подытог</span>
                            <strong>{formatMoney(subtotal, currency)}</strong>
                        </div>

                        <div className="price-row">
                            <span>Скидка</span>
                            <strong>- {formatMoney(discount, currency)}</strong>
                        </div>

                        <div className="price-row">
                            <span>Страховка</span>
                            <strong>{formatMoney(insurance, currency)}</strong>
                        </div>

                        <div className="price-row">
                            <span>Сервисный сбор</span>
                            <strong>{formatMoney(serviceFee, currency)}</strong>
                        </div>

                        <hr />

                        <div className="price-total">
                            <span>Итого к оплате</span>
                            <span>{formatMoney(total, currency)}</span>
                        </div>
                    </>
                )}
            </div>


            {/* =================================
                AGREEMENTS
            ================================= */}

            {isHotelbeds && <RateConditions offer={tour} />}
            <div className="agreement">

                <label>

                    <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(event) =>
                            setAgreeTerms(
                                event.target.checked
                            )
                        }
                    />

                    Я принимаю условия договора

                </label>


                <label>

                    <input
                        type="checkbox"
                        checked={agreePolicy}
                        onChange={(event) =>
                            setAgreePolicy(
                                event.target.checked
                            )
                        }
                    />

                    Я согласен на обработку персональных данных

                </label>

            </div>


            {/* =================================
                BUTTONS
            ================================= */}

            <div className="checkout-buttons">

                <button
                    type="button"
                    className="back-btn"
                    onClick={back}
                >
                    ← Назад
                </button>


                <button
                    type="button"
                    className="next-btn"
                    disabled={
                        !(agreeTerms && agreePolicy) || (checkout.priceChangedAtCheckRate && acceptedPriceToken !== checkout.checkoutToken)
                    }
                    onClick={next}
                >
                    {isHotelbeds ? "Перейти к данным гостей →" : "Перейти к оплате →"}
                </button>

            </div>

        </div>

    );

}
