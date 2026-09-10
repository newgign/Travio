import { useRef, useState } from "react";
import {
    useLocation,
    useNavigate,
    useParams,
} from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import CheckoutStepper from "../components/checkout/CheckoutStepper";
import TravelerStep from "../components/checkout/TravelerStep";
import ReviewStep from "../components/checkout/ReviewStep";
import PaymentStep from "../components/checkout/PaymentStep";
import SuccessStep from "../components/checkout/SuccessStep";

import { createBooking, confirmProviderBooking } from "../services/bookingService";
import { createPaymentIntent, payBooking } from "../services/paymentService";

import "../styles/Checkout.css";


export default function Checkout() {

    // =====================================
    // ROUTER
    // =====================================

    const { provider: providerParam, tourId } = useParams();

    const provider = providerParam || "mock";

    const location = useLocation();
    const navigate = useNavigate();


    // =====================================
    // STATE
    // =====================================

    const submitting = useRef(false);
    const [step, setStep] = useState(1);

    const [loading, setLoading] = useState(false);

    const [bookingId, setBookingId] = useState(null);

    const [bookingData, setBookingData] = useState({});

    const [checkout, setCheckout] = useState(null);

    const [paymentResult, setPaymentResult] = useState(null);

    const initialSearchParams = new URLSearchParams(location.search);

    const expectedAdults = Math.max(Number(initialSearchParams.get("people")) || 2, 1);

    const expectedChildren = Math.max(Number(initialSearchParams.get("children")) || 0, 0);

    const childAges = String(initialSearchParams.get("childrenAges") || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));


    // =====================================
    // ПОЛУЧИТЬ ФИЛЬТРЫ ИЗ URL
    // =====================================

    function getSearchFilters() {

        const searchParams =
            new URLSearchParams(
                location.search
            );


        const filters =
            Object.fromEntries(
                searchParams.entries()
            );


        return {

            ...filters,

            people:
                Number(filters.people) ||
                expectedAdults,

            nights:
                Number(filters.nights) ||
                Number(checkout?.tour?.nights) ||
                7,

            children:
                Number(filters.children) ||
                expectedChildren,

        };

    }


    // =====================================
    // PAYMENT
    // =====================================

    async function handlePayment(method) {
        if (submitting.current) return;
        submitting.current = true;

        try {

            setLoading(true);


            let currentBookingId =
                bookingId;


            // =================================
            // Если бронирование еще не создано
            // =================================

            if (!currentBookingId) {

                const filters =
                    getSearchFilters();


                const booking =
                    await createBooking({

                        provider,

                        hotelId:
                            tourId,

                        offerId:
                            checkout?.tour?.offerId || null,

                        acceptedPriceToken: checkout?.acceptedPriceToken || null,
                        checkoutToken:
                            checkout?.checkoutToken || null,

                        tour_id:
                            tourId,

                        firstName:
                            bookingData.firstName,

                        lastName:
                            bookingData.lastName,

                        phone:
                            bookingData.phone,

                        email:
                            bookingData.email,

                        birthDate:
                            bookingData.birthDate ||
                            null,

                        people:
                            Number(
                                filters.people
                            ) ||
                            expectedAdults,

                        travelers:
                            bookingData.travelers || [],

                        comment:
                            bookingData.comment ||
                            "",


                        // =============================
                        // Передаем исходные параметры
                        // поиска в backend
                        // =============================

                        filters,

                    });


                currentBookingId =
                    booking.id;


                setBookingId(
                    currentBookingId
                );

            }


            // =================================
            // Hotelbeds TEST подтверждается Booking API,
            // а не фиктивной локальной оплатой.
            // =================================

            let result;

            if (provider === "hotelbeds") {
                result = await confirmProviderBooking(currentBookingId);
            } else {
                // Sprint 2H: local/mock checkout is a two-step sandbox flow.
                // No real charge is ever performed here.
                await createPaymentIntent(currentBookingId);
                result = await payBooking(currentBookingId, method);
            }

            setPaymentResult(result);


            // =================================
            // SUCCESS
            // =================================

            setStep(4);

        }

        catch (err) {

            console.error(
                "CHECKOUT PAYMENT ERROR:",
                err
            );

            if (err.code === "HOTELBEDS_RATE_EXPIRED" || err.code === "HOTELBEDS_NEW_RATE_REQUIRED") {
                alert(
                    err.message ||
                    "Тариф больше недоступен. Asedeliya не создал бронь. Выполните новый поиск."
                );
                navigate(`/results${location.search}`);
                return;
            }

            if (err.code === "HOTELBEDS_CONFIRMATION_UNKNOWN" || err.code === "HOTELBEDS_RECONCILIATION_UNAVAILABLE") {
                alert(
                    err.message ||
                    "Результат Hotelbeds требует сверки. Не повторяйте бронирование."
                );
                navigate("/my-bookings");
                return;
            }

            if (err.code === "HOTELBEDS_AT_HOTEL_UNSUPPORTED") {
                alert(err.message);
                navigate(`/results${location.search}`);
                return;
            }

            alert(
                err.message ||
                "Ошибка при оформлении бронирования"
            );

        }

        finally {

            setLoading(false);
            submitting.current = false;

        }

    }


    // =====================================
    // RENDER
    // =====================================

    return (

        <>

            <Navbar />


            <div className="checkout-page">


                {/* =================================
                    HEADER
                ================================= */}

                <div className="checkout-header">

                    <h1>

                        {provider === "hotelbeds" ? "Оформление проживания" : "Оформление тура"}

                    </h1>

                    <p>

                        {provider === "hotelbeds"
                            ? "Проверьте данные туристов и подтвердите Hotelbeds TEST-бронирование. Реальная оплата здесь не выполняется."
                            : "Проверьте данные туристов, подтвердите заказ и выберите удобный способ оплаты."}

                    </p>

                </div>

                <div className="checkout-trust-row">
                    <span>✓ 4 понятных шага</span>
                    <span>✓ Данные гостей проверяются перед отправкой</span>
                    <span>🔒 LIVE-платежи выключены</span>
                </div>


                {/* =================================
                    STEPPER
                ================================= */}

                <CheckoutStepper
                    step={step}
                />


                {/* =================================
                    STEP 1
                    TOURISTS
                ================================= */}

                {step === 1 && (

                    <TravelerStep

                        bookingData={
                            bookingData
                        }

                        setBookingData={
                            setBookingData
                        }

                        next={() =>
                            setStep(2)
                        }

                        adults={
                            expectedAdults
                        }

                        children={
                            expectedChildren
                        }

                        childAges={
                            childAges
                        }

                    />

                )}


                {/* =================================
                    STEP 2
                    REVIEW
                ================================= */}

                {step === 2 && (

                    <ReviewStep

                        bookingData={
                            bookingData
                        }

                        checkout={
                            checkout
                        }

                        setCheckout={
                            setCheckout
                        }

                        back={() =>
                            setStep(1)
                        }

                        next={() =>
                            setStep(3)
                        }

                        provider={
                            provider
                        }

                        tourId={
                            tourId
                        }

                        offerToken={
                            location.state?.selectedOffer?.offerToken || null
                        }

                    />

                )}


                {/* =================================
                    STEP 3
                    PAYMENT
                ================================= */}

                {step === 3 && checkout && (

                    <PaymentStep

                        checkout={
                            checkout
                        }

                        back={() =>
                            setStep(2)
                        }

                        onPay={
                            handlePayment
                        }

                        loading={
                            loading
                        }

                    />

                )}


                {/* =================================
                    STEP 4
                    SUCCESS
                ================================= */}

                {step === 4 && (

                    <SuccessStep

                        bookingId={
                            bookingId
                        }

                        checkout={
                            checkout
                        }

                        paymentResult={
                            paymentResult
                        }

                    />

                )}


            </div>


            <Footer />

        </>

    );

}