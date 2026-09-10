import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getProfile, getTravelerProfiles } from "../../services/profileService";

function dateOnlyValue(value) {
    if (!value) return "";

    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function buildInitialTravelers({ bookingData, adults, children, childAges }) {
    if (Array.isArray(bookingData.travelers) && bookingData.travelers.length === adults + children) {
        return bookingData.travelers;
    }

    const result = [];

    for (let index = 0; index < adults; index += 1) {
        result.push({
            type: "AD",
            firstName: index === 0 ? bookingData.firstName || "" : "",
            lastName: index === 0 ? bookingData.lastName || "" : "",
            birthDate: index === 0 ? bookingData.birthDate || "" : "",
            age: null,
            roomId: 1,
        });
    }

    for (let index = 0; index < children; index += 1) {
        result.push({
            type: "CH",
            firstName: "",
            lastName: "",
            birthDate: "",
            age: Number(childAges[index] ?? 0),
            roomId: 1,
        });
    }

    return result;
}

export default function TravelerStep({
    bookingData,
    setBookingData,
    next,
    adults = 2,
    children = 0,
    childAges = [],
}) {
    const initialTravelers = useMemo(
        () => buildInitialTravelers({ bookingData, adults, children, childAges }),
        [bookingData, adults, children, childAges]
    );

    const [form, setForm] = useState({
        phone: bookingData.phone || "",
        email: bookingData.email || "",
        comment: bookingData.comment || "",
        travelers: initialTravelers,
    });

    const [savedTravelers, setSavedTravelers] = useState([]);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        let active = true;

        Promise.all([getProfile(), getTravelerProfiles()])
            .then(([profile, travelers]) => {
                if (!active) return;

                setSavedTravelers(Array.isArray(travelers) ? travelers : []);

                setForm((current) => ({
                    ...current,
                    phone: current.phone || profile?.phone || "",
                    email: current.email || profile?.email || "",
                }));
            })
            .catch(() => {
                // Checkout remains fully usable even if profile enrichment is unavailable.
            });

        return () => {
            active = false;
        };
    }, []);

    function updateContact(event) {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
    }

    function updateTraveler(index, field, value) {
        setForm((prev) => ({
            ...prev,
            travelers: prev.travelers.map((traveler, travelerIndex) =>
                travelerIndex === index ? { ...traveler, [field]: value } : traveler
            ),
        }));

        setErrors((prev) => ({ ...prev, [`traveler_${index}_${field}`]: "" }));
    }

    function applySavedTraveler(index, savedId) {
        if (!savedId) return;

        const saved = savedTravelers.find((item) => Number(item.id) === Number(savedId));
        if (!saved) return;

        setForm((current) => ({
            ...current,
            travelers: current.travelers.map((traveler, travelerIndex) =>
                travelerIndex === index
                    ? {
                        ...traveler,
                        firstName: saved.first_name || "",
                        lastName: saved.last_name || "",
                        birthDate: dateOnlyValue(saved.birth_date),
                    }
                    : traveler
            ),
        }));
    }

    function validate() {
        const newErrors = {};

        if (!form.phone.trim()) newErrors.phone = "Введите телефон";

        if (!form.email.trim()) {
            newErrors.email = "Введите Email";
        } else if (!/\S+@\S+\.\S+/.test(form.email)) {
            newErrors.email = "Некорректный Email";
        }

        form.travelers.forEach((traveler, index) => {
            if (!traveler.firstName.trim()) {
                newErrors[`traveler_${index}_firstName`] = "Введите имя";
            }

            if (!traveler.lastName.trim()) {
                newErrors[`traveler_${index}_lastName`] = "Введите фамилию";
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    function handleNext() {
        if (!validate()) return;

        const holder = form.travelers.find((traveler) => traveler.type === "AD") || form.travelers[0];

        setBookingData({
            ...form,
            firstName: holder?.firstName || "",
            lastName: holder?.lastName || "",
            birthDate: holder?.birthDate || "",
            adults,
            children,
            people: adults + children,
        });

        next();
    }

    return (
        <div className="checkout-card">
            <h1>Данные туристов</h1>

            <p className="checkout-subtitle">
                Для бронирования нужны имя и фамилия каждого гостя. Первый взрослый будет держателем брони.
            </p>

            <div className="traveler-count-note">
                👥 {adults} взрослых
                {children > 0 ? ` · 👶 ${children} детей` : ""}
                {savedTravelers.length > 0 && (
                    <span className="saved-traveler-hint">
                        · ⚡ Доступно сохранённых туристов: {savedTravelers.length}
                    </span>
                )}
            </div>

            <div className="traveler-list">
                {form.travelers.map((traveler, index) => {
                    const options = savedTravelers.filter(
                        (item) => String(item.traveler_type || "AD") === traveler.type
                    );

                    return (
                        <div className="traveler-card" key={`${traveler.type}-${index}`}>
                            <div className="traveler-card-title">
                                <strong>
                                    {traveler.type === "CH"
                                        ? `Ребёнок ${index - adults + 1}`
                                        : `Взрослый ${index + 1}`}
                                </strong>

                                {traveler.type === "CH" && Number.isFinite(Number(traveler.age)) && (
                                    <span>{traveler.age} лет</span>
                                )}
                            </div>

                            {options.length > 0 && (
                                <label className="saved-traveler-select">
                                    Быстро заполнить
                                    <select defaultValue="" onChange={(event) => applySavedTraveler(index, event.target.value)}>
                                        <option value="">Выберите сохранённого туриста</option>
                                        {options.map((saved) => (
                                            <option value={saved.id} key={saved.id}>
                                                {saved.label} — {saved.first_name} {saved.last_name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            <div className="checkout-grid traveler-grid">
                                <div>
                                    <input
                                        value={traveler.firstName}
                                        placeholder="Имя латиницей или как в документе"
                                        onChange={(event) => updateTraveler(index, "firstName", event.target.value)}
                                    />
                                    {errors[`traveler_${index}_firstName`] && (
                                        <small className="input-error">{errors[`traveler_${index}_firstName`]}</small>
                                    )}
                                </div>

                                <div>
                                    <input
                                        value={traveler.lastName}
                                        placeholder="Фамилия"
                                        onChange={(event) => updateTraveler(index, "lastName", event.target.value)}
                                    />
                                    {errors[`traveler_${index}_lastName`] && (
                                        <small className="input-error">{errors[`traveler_${index}_lastName`]}</small>
                                    )}
                                </div>

                                <div>
                                    <label>Дата рождения</label>
                                    <input
                                        type="date"
                                        value={traveler.birthDate || ""}
                                        onChange={(event) => updateTraveler(index, "birthDate", event.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="checkout-profile-link">
                <Link to="/profile">Управлять сохранёнными туристами в профиле →</Link>
            </div>

            <div className="review-block contact-block">
                <h3>Контакты держателя брони</h3>

                <div className="checkout-grid">
                    <div>
                        <input
                            name="phone"
                            placeholder="+7 (777) 777-77-77"
                            value={form.phone}
                            onChange={updateContact}
                        />
                        {errors.phone && <small className="input-error">{errors.phone}</small>}
                    </div>

                    <div>
                        <input
                            type="email"
                            name="email"
                            placeholder="Email"
                            value={form.email}
                            onChange={updateContact}
                        />
                        {errors.email && <small className="input-error">{errors.email}</small>}
                    </div>
                </div>
            </div>

            <div className="checkout-comment">
                <label>Комментарий к заказу</label>
                <textarea
                    rows="5"
                    name="comment"
                    placeholder="Например: поздний заезд, пожелания к номеру и т.д."
                    value={form.comment}
                    onChange={updateContact}
                />
            </div>

            <div className="checkout-buttons">
                <button className="next-btn" onClick={handleNext}>Продолжить →</button>
            </div>
        </div>
    );
}
