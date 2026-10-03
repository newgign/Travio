export default function CheckoutStepper({ step, provider }) {
    if (provider === 'hotelbeds') {
        const current = step === 2 ? 1 : step === 1 ? 2 : 3;
        return <div className="checkout-stepper">{['Проверка', 'Туристы', 'Бронирование недоступно'].map((label, index) =>
            <div key={label} className={current >= index + 1 ? 'step active' : 'step'}>{index + 1}<span>{label}</span></div>)}</div>;
    }

    return (

        <div className="checkout-stepper">

            <div className={step >= 1 ? "step active" : "step"}>
                1
                <span>Туристы</span>
            </div>

            <div className={step >= 2 ? "step active" : "step"}>
                2
                <span>Проверка</span>
            </div>

            <div className={step >= 3 ? "step active" : "step"}>
                3
                <span>Оплата</span>
            </div>

            <div className={step >= 4 ? "step active" : "step"}>
                4
                <span>Готово</span>
            </div>

        </div>

    );

}
