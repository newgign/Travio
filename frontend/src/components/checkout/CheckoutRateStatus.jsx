export default function CheckoutRateStatus({ status, retry, back }) {
  if (status === 'CHECKING') return <div className="checkout-card" role="status">
    <h2>Проверяем стоимость предложения…</h2>
    <p>Уточняем доступность и стоимость выбранного тарифа.</p>
  </div>;
  const unavailable = status === 'UNAVAILABLE';
  return <div className="checkout-card" role="alert">
    <h2>{unavailable ? 'Выбранное предложение больше недоступно' : 'Не удалось проверить стоимость'}</h2>
    <p>{unavailable ? 'Вернитесь к поиску и выберите другой тариф.' : 'Проверка временно не завершена. Попробуйте снова.'}</p>
    <div className="checkout-buttons">
      <button type="button" className="back-btn" onClick={back}>← Назад</button>
      {!unavailable && <button type="button" className="next-btn" onClick={retry}>Попробовать снова</button>}
    </div>
  </div>;
}
