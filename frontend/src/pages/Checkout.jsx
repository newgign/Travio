import { checkoutFailureMessage } from "../utils/feedbackPresentation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
    useLocation,
    useNavigate,
    useParams,
} from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import CheckoutStepper from "../components/checkout/CheckoutStepper";
import TravelerStep from "../components/checkout/TravelerStep";
import ReviewStep, { CheckoutReviewView } from "../components/checkout/ReviewStep";
import FinalReviewStep from "../components/checkout/FinalReviewStep";
import PaymentStep from "../components/checkout/PaymentStep";
import SuccessStep from "../components/checkout/SuccessStep";

import { createBooking, createBookingReview, confirmProviderBooking } from "../services/bookingService";
import { confirmedOccupancy } from "../utils/travellerData";
import { createFinalReview } from "../services/checkoutReadiness";
import { createPaymentIntent, payBooking } from "../services/paymentService";

import "../styles/Checkout.css";


export default function Checkout() {
    const location = useLocation();
    return <CheckoutFlow key={`${location.pathname}${location.search}:${location.state?.selectedOffer?.offerToken || ''}`} />;
}

function CheckoutFlow() {

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
    const [step, setStep] = useState(provider === "hotelbeds" ? 2 : 1);

    const [loading, setLoading] = useState(false);

    const [bookingId, setBookingId] = useState(null);

    const [bookingData, setBookingData] = useState({});

    const [checkout, setCheckout] = useState(null);

    const finalReview = useMemo(() => createFinalReview(createBookingReview), []);
    const reviewState = useSyncExternalStore(finalReview.subscribe, finalReview.getSnapshot, finalReview.getSnapshot);
    const readiness = finalReview.statusFor(checkout, bookingData);
    useEffect(() => {
        if (!reviewState.review) return;
        const timer = setTimeout(() => finalReview.invalidate(), Math.max(0, Date.parse(reviewState.review.expiresAt) - Date.now()));
        return () => clearTimeout(timer);
    }, [finalReview, reviewState.review]);
    const occupancy = provider === 'hotelbeds' ? confirmedOccupancy(checkout) : null;
    function updateBookingData(data) { finalReview.invalidate(); setBookingData(data); }
    async function continueTravellers(data) {
        if (provider !== 'hotelbeds') { setStep(2); return; }
        if (!occupancy) throw Object.assign(Error('INVALID_CONFIRMED_OCCUPANCY'), { code: 'VALIDATION_ERROR' });
        const review = await finalReview.prepare(checkout, data);
        if (review) setStep(3);
    }

    const [paymentResult, setPaymentResult] = useState(null);

    const initialSearchParams = new URLSearchParams(location.search);

    const expectedAdults = Math.max(Number(initialSearchParams.get("people")) || 2, 1);

    const expectedChildren = Math.max(Number(initialSearchParams.get("children")) || 0, 0);

    const childAges = String(initialSearchParams.get("childrenAges") || "")
        .split(",")
        .filter((value) => value.trim() !== '')
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
        if (provider === "hotelbeds") return;
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

            if (err.code === "HOTELBEDS_RATE_EXPIRED" || err.code === "HOTELBEDS_NEW_RATE_REQUIRED") {
                alert(checkoutFailureMessage(err.code));
                navigate(`/results${location.search}`);
                return;
            }

            if (err.code === "HOTELBEDS_CONFIRMATION_UNKNOWN" || err.code === "HOTELBEDS_RECONCILIATION_UNAVAILABLE") {
                alert(checkoutFailureMessage(err.code));
                navigate("/my-bookings");
                return;
            }

            if (err.code === "HOTELBEDS_AT_HOTEL_UNSUPPORTED") {
                alert(checkoutFailureMessage(err.code));
                navigate(`/results${location.search}`);
                return;
            }

            alert(checkoutFailureMessage(err.code));

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
                            ? "Проверьте стоимость выбранного Hotelbeds TEST-предложения. Бронирование и оплата недоступны."
                            : "Проверьте данные туристов, подтвердите заказ и выберите удобный способ оплаты."}

                    </p>

                </div>

                <div className="checkout-trust-row">
                    <span>✓ {provider === 'hotelbeds' ? '3 понятных шага' : '4 понятных шага'}</span>
                    <span>✓ Данные гостей проверяются перед отправкой</span>
                    <span>🔒 LIVE-платежи выключены</span>
                </div>


                {/* =================================
                    STEPPER
                ================================= */}

                <CheckoutStepper
                    step={step}
                    provider={provider}
                />


                {/* =================================
                    STEP 1
                    TOURISTS
                ================================= */}

                {step === 1 && (provider !== 'hotelbeds' || occupancy) && (

                    <TravelerStep

                        bookingData={
                            bookingData
                        }

                        setBookingData={
                            updateBookingData
                        }

                        next={continueTravellers}
                        back={provider === 'hotelbeds' ? () => setStep(2) : undefined}

                        adults={
                            occupancy?.adults ?? expectedAdults
                        }

                        children={
                            occupancy?.children ?? expectedChildren
                        }

                        childAges={
                            occupancy?.childAges ?? childAges
                        }

                    />

                )}


                {/* =================================
                    STEP 2
                    REVIEW
                ================================= */}

                {step === 1 && provider === 'hotelbeds' && !occupancy && <div className="checkout-card">
                    <p role="alert">Состав гостей не подтверждён. Вернитесь к поиску.</p>
                    <button className="back-btn" onClick={() => navigate(`/results${location.search}`)}>← Назад к поиску</button>
                </div>}
                {step === 2 && provider === 'hotelbeds' && checkout?.checkoutToken && checkout?.tour?.checkRatePerformed === true ? (
                    <CheckoutReviewView checkout={checkout} bookingData={bookingData}
                        acceptedPriceToken={checkout.acceptedPriceToken} acceptPrice={value => setCheckout(current => ({ ...current, acceptedPriceToken: value ? current.checkoutToken : null }))}
                        back={() => navigate(`/results${location.search}`)} next={() => setStep(1)} />
                ) : step === 2 && (

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

                        back={() => provider === 'hotelbeds' ? navigate(`/results${location.search}`) : setStep(1)}

                        next={() =>
                            setStep(provider === 'hotelbeds' ? 1 : 3)
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

                {provider === 'hotelbeds' && step >= 3 && (
                    <FinalReviewStep review={reviewState.review} status={readiness}
                        back={() => { finalReview.invalidate(); setStep(occupancy ? 1 : 2); }} />
                )}
                {step === 3 && checkout && provider !== 'hotelbeds' && (

                    <PaymentStep

                        checkout={
                            checkout
                        }

                        back={() =>
                            setStep(provider === 'hotelbeds' ? 1 : 2)
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

                {step === 4 && provider !== 'hotelbeds' && (

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
