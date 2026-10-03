import { safeReviewModel } from '../../services/checkoutReadiness';
import { formatMoney } from '../../utils/money';

export default function FinalReviewStep({ review, status = 'REVIEW_NOT_READY', back }) {
    let model;
    if (status === 'REVIEW_READY') {
        try { model = safeReviewModel(review); } catch { /* Incomplete/expired review never becomes ready. */ }
    }
    if (!model) {
        const message = status === 'CHECKRATE_REQUIRED' ? 'Сначала подтвердите стоимость предложения.'
            : status === 'TRAVELLER_VALIDATION_ERROR' ? 'Проверьте данные гостей.'
            : status === 'INTERNAL_RETRYABLE_ERROR' ? 'Не удалось проверить данные. Повторите попытку позже.'
            : 'Итоговая проверка пока недоступна. Вернитесь к данным гостей.';
        return <div className="checkout-card"><h1>Итоговая проверка</h1><p role="alert">{message}</p>
            <button type="button" className="back-btn" onClick={back}>← Назад</button></div>;
    }
    return <div className="checkout-card">
        <h1>Итоговая проверка</h1>
        <p className="checkout-subtitle">Проверьте предложение и гостей. Подтверждение CheckRate не является бронированием.</p>
        <p>Hotelbeds TEST / Evaluation — только техническое тестирование.</p>
        <div className="review-block"><h3>Проживание</h3>
            <div className="price-row"><span>Отель</span><strong>{model.hotel || 'Название не указано'}</strong></div>
            <div className="price-row"><span>Заезд</span><strong>{model.stay.checkIn}</strong></div>
            <div className="price-row"><span>Выезд</span><strong>{model.stay.checkOut}</strong></div>
            <div className="price-row"><span>Ночей</span><strong>{model.stay.nights}</strong></div>
            <div className="price-row"><span>Номер</span><strong>{model.offer.room || 'Не указано'}</strong></div>
            <div className="price-row"><span>Питание</span><strong>{model.offer.board || 'Не указано'}</strong></div>
            <div className="price-total"><span>Подтверждённая стоимость проживания ({model.offer.currency})</span><strong>{formatMoney(model.offer.price, model.offer.currency)}</strong></div>
        </div>
        <div className="review-block"><h3>Гости: {model.expectedTravelers}</h3>
            {model.travelers.map((guest, index) => <div className="price-row" key={`${guest.type}-${index}`}>
                <span>Гость {index + 1} — {guest.type === 'AD' ? 'взрослый' : 'ребёнок'}{guest.type === 'CH' ? ` (${guest.age} лет)` : ''}</span>
                <strong>{guest.firstName} {guest.lastName}{guest.birthDate && <small> · Дата рождения: {guest.birthDate}</small>}</strong>
            </div>)}
        </div>
        <div className="checkout-provider-warning"><p>Бронирование пока недоступно. Оплата недоступна.</p>
            <p>Бронь не создана. Списаний нет.</p></div>
        <div className="checkout-buttons"><button type="button" className="back-btn" onClick={back}>← Назад к гостям</button>
            <button type="button" className="next-btn" disabled>Бронирование пока недоступно</button></div>
    </div>;
}
