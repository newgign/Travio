import RateConditions from "../RateConditions";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getCheckout } from "../../services/checkoutService";
import { formatMoney } from "../../utils/money";


export default function ReviewStep({
    bookingData,
    checkout,
    setCheckout,
    back,
    next,
    provider = "mock",
    tourId,
    offerToken = null,
}) {

    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [acceptedPriceToken, setAcceptedPriceToken] = useState(null);
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [agreePolicy, setAgreePolicy] = useState(false);


    // =====================================
    // Загрузка Checkout
    // =====================================

    const loadCheckout = useCallback(async () => {

        try {

            setLoading(true);
            setError("");

            // ---------------------------------
            // Получаем параметры исходного поиска
            // ---------------------------------

            const searchParams =
                new URLSearchParams(
                    location.search
                );

            const filters =
                Object.fromEntries(
                    searchParams.entries()
                );


            // ---------------------------------
            // Количество туристов
            // ---------------------------------

            const people =
                Number(bookingData.adults) ||
                Number(filters.people) ||
                2;


            // ---------------------------------
            // Запрос к новому Checkout API
            // ---------------------------------

            const data = await getCheckout({

                provider,

                hotelId: tourId,

                tourId,

                offerToken,

                people,

                filters: {

                    ...filters,

                    people,

                    nights:
                        Number(filters.nights) || 7,

                    children:
                        Number(filters.children) || 0,

                },

            });


            setCheckout(data);

        } catch (err) {

            console.error(
                "Ошибка загрузки Checkout:",
                err
            );

            setCheckout(null);

            setError(
                err.message ||
                "Не удалось загрузить информацию о туре"
            );

        } finally {

            setLoading(false);

        }

    }, [provider, tourId, offerToken, location.search, bookingData.adults, setCheckout]);


    useEffect(() => {

        const timer = setTimeout(() => {
            loadCheckout();
        }, 0);

        return () => clearTimeout(timer);

    }, [loadCheckout]);


    // =====================================
    // Loading
    // =====================================

    if (loading) {

        return (

            <div className="checkout-card">

                <h2>
                    Загрузка заказа...
                </h2>

                <p className="checkout-subtitle">
                    Проверяем выбранный тур и рассчитываем стоимость.
                </p>

            </div>

        );

    }


    // =====================================
    // Error
    // =====================================

    if (error || !checkout || !checkout.tour) {

        return (

            <div className="checkout-card">

                <h2>
                    Не удалось загрузить информацию о туре
                </h2>

                {error && (
                    <p className="checkout-subtitle">
                        {error}
                    </p>
                )}

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
                        onClick={loadCheckout}
                    >
                        Попробовать снова
                    </button>

                </div>

            </div>

        );

    }


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
                Подтверждение бронирования
            </h1>

            <p className="checkout-subtitle">

                Проверьте информацию перед оплатой.
                После подтверждения изменить данные
                будет невозможно.

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
                <h3>{isHotelbeds ? "Стоимость проживания" : "Расчет стоимости"}</h3>

                {isHotelbeds ? (
                    <>
                        {checkout.priceChangedAtCheckRate && (
                            <div className="checkout-provider-warning">
                                Стоимость предложения изменилась.
                                {" "}{formatMoney(checkout.previousTotal, currency)} → {formatMoney(total, currency)}.
                                <label><input type="checkbox" checked={acceptedPriceToken === checkout.checkoutToken} onChange={event => setAcceptedPriceToken(event.target.checked ? checkout.checkoutToken : null)} />Подтверждаю новую стоимость проживания</label>
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
                    onClick={() => { setCheckout({ ...checkout, acceptedPriceToken }); next(); }}
                >
                    {isHotelbeds ? "Перейти к подтверждению →" : "Перейти к оплате →"}
                </button>

            </div>

        </div>

    );

}
