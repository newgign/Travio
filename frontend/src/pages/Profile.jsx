import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  changePassword,
  createTravelerProfile,
  deleteTravelerProfile,
  getProfile,
  getTravelerProfiles,
  updateProfile,
  updateTravelerProfile,
} from "../services/profileService";
import { getNotificationStatus, getNotifications, retryNotification, sendTestNotification } from "../services/notificationService";
import { getPaymentReadiness } from "../services/paymentService";
import "../styles/Profile.css";

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

function dateOnlyLabel(value) {
  const normalized = dateOnlyValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}.${month}.${year}`;
}

const EMPTY_TRAVELER = {
  id: null,
  label: "",
  traveler_type: "AD",
  first_name: "",
  last_name: "",
  birth_date: "",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [travelers, setTravelers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [notificationChannel, setNotificationChannel] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [paymentReadiness, setPaymentReadiness] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [travelerForm, setTravelerForm] = useState(EMPTY_TRAVELER);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    let active = true;

    Promise.all([
      getProfile(),
      getTravelerProfiles(),
      getNotificationStatus().catch(() => null),
      getNotifications(8).catch(() => ({ items: [] })),
      getPaymentReadiness().catch(() => null),
    ])
      .then(([profileData, travelerData, notificationStatus, notificationData, paymentData]) => {
        if (!active) return;
        setProfile(profileData);
        setTravelers(Array.isArray(travelerData) ? travelerData : []);
        setNotificationChannel(notificationStatus?.channel || null);
        setNotifications(Array.isArray(notificationData?.items) ? notificationData.items : []);
        setPaymentReadiness(paymentData?.payment || null);
      })
      .catch((error) => alert(error.message || "Не удалось загрузить профиль"))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("ru-RU")
    : "—";

  function updateField(name, value) {
    setProfile((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    try {
      setSavingProfile(true);
      const result = await updateProfile({
        full_name: profile.full_name,
        phone: profile.phone,
        preferred_language: profile.preferred_language,
        email_notifications: profile.email_notifications,
        booking_reminders: profile.booking_reminders,
      });

      const nextUser = result.user;
      setProfile((current) => ({ ...current, ...nextUser, stats: result.stats || current.stats }));
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("travio-auth-changed"));
      alert("Профиль сохранён");
    } catch (error) {
      alert(error.message || "Не удалось сохранить профиль");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();

    if (passwordForm.newPassword.length < 8) {
      return alert("Новый пароль должен содержать не менее 8 символов");
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return alert("Новые пароли не совпадают");
    }

    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      alert("Пароль изменён");
    } catch (error) {
      alert(error.message || "Не удалось изменить пароль");
    }
  }

  function editTraveler(traveler) {
    setTravelerForm({
      id: traveler.id,
      label: traveler.label || "",
      traveler_type: traveler.traveler_type || "AD",
      first_name: traveler.first_name || "",
      last_name: traveler.last_name || "",
      birth_date: dateOnlyValue(traveler.birth_date),
    });
    document.getElementById("saved-traveler-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveTraveler(event) {
    event.preventDefault();

    const payload = {
      label: travelerForm.label,
      traveler_type: travelerForm.traveler_type,
      first_name: travelerForm.first_name,
      last_name: travelerForm.last_name,
      birth_date: travelerForm.birth_date || null,
    };

    try {
      if (travelerForm.id) {
        const updated = await updateTravelerProfile(travelerForm.id, payload);
        setTravelers((current) =>
          current.map((item) => (Number(item.id) === Number(updated.id) ? updated : item))
        );
      } else {
        const created = await createTravelerProfile(payload);
        setTravelers((current) => [...current, created]);
      }

      setTravelerForm(EMPTY_TRAVELER);
    } catch (error) {
      alert(error.message || "Не удалось сохранить туриста");
    }
  }

  async function removeTraveler(traveler) {
    if (!window.confirm(`Удалить сохранённого туриста «${traveler.label}»?`)) return;

    try {
      await deleteTravelerProfile(traveler.id);
      setTravelers((current) => current.filter((item) => Number(item.id) !== Number(traveler.id)));
      if (Number(travelerForm.id) === Number(traveler.id)) {
        setTravelerForm(EMPTY_TRAVELER);
      }
    } catch (error) {
      alert(error.message || "Не удалось удалить туриста");
    }
  }

  async function refreshNotifications() {
    const data = await getNotifications(8);
    setNotifications(Array.isArray(data?.items) ? data.items : []);
  }

  async function testEmailChannel() {
    try {
      setNotificationBusy(true);
      const result = await sendTestNotification();
      setNotificationChannel(result?.channel || notificationChannel);
      await refreshNotifications();
      const status = result?.result?.status || "queued";
      alert(status === "sent" ? "Тестовое email-уведомление отправлено" : `Email-тест: ${status}`);
    } catch (error) {
      alert(error.message || "Не удалось проверить email-канал");
    } finally {
      setNotificationBusy(false);
    }
  }

  async function retryEmail(item) {
    try {
      setNotificationBusy(true);
      await retryNotification(item.id);
      await refreshNotifications();
    } catch (error) {
      alert(error.message || "Не удалось повторить отправку");
    } finally {
      setNotificationBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="profile-page"><div className="profile-loading">Загрузка профиля...</div></main>
        <Footer />
      </>
    );
  }

  if (!profile) return null;

  const stats = profile.stats || {};

  return (
    <>
      <Navbar />

      <main className="profile-page">
        <section className="profile-hero">
          <div>
            <span className="profile-kicker">Личный кабинет</span>
            <h1>👤 {profile.full_name}</h1>
            <p>{profile.email} · в Asedeliya с {memberSince}</p>
          </div>

          <div className="profile-stats">
            <div><strong>{stats.total || 0}</strong><span>Всего</span></div>
            <div><strong>{stats.confirmed || 0}</strong><span>Подтверждено</span></div>
            <div><strong>{stats.cancelled || 0}</strong><span>Отменено</span></div>
            <div><strong>{stats.attention || 0}</strong><span>Требуют внимания</span></div>
          </div>
        </section>

        <div className="profile-layout">
          <section className="profile-card">
            <h2>Контактные данные</h2>
            <p className="profile-hint">Email используется для входа и сейчас изменяется только через администратора.</p>

            <form onSubmit={saveProfile} className="profile-form">
              <label>
                Имя
                <input
                  value={profile.full_name || ""}
                  onChange={(event) => updateField("full_name", event.target.value)}
                  required
                />
              </label>

              <label>
                Email
                <input value={profile.email || ""} disabled />
              </label>

              <label>
                Телефон
                <input
                  value={profile.phone || ""}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="+7 700 000 00 00"
                />
              </label>

              <label>
                Язык интерфейса
                <select
                  value={profile.preferred_language || "ru"}
                  onChange={(event) => updateField("preferred_language", event.target.value)}
                >
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                  <option value="en">English</option>
                </select>
              </label>

              <div className="profile-toggles">
                <label className="profile-toggle">
                  <input
                    type="checkbox"
                    checked={profile.email_notifications !== false}
                    onChange={(event) => updateField("email_notifications", event.target.checked)}
                  />
                  <span>
                    <strong>Email-уведомления</strong>
                    <small>Подтверждение и отмена бронирования. Отправка работает, когда на сервере включён email-провайдер.</small>
                  </span>
                </label>

                <label className="profile-toggle">
                  <input
                    type="checkbox"
                    checked={profile.booking_reminders !== false}
                    onChange={(event) => updateField("booking_reminders", event.target.checked)}
                  />
                  <span>
                    <strong>Напоминания о поездке</strong>
                    <small>Настройка сохранена для будущего сервиса напоминаний.</small>
                  </span>
                </label>
              </div>

              <button className="profile-primary" type="submit" disabled={savingProfile}>
                {savingProfile ? "Сохраняем..." : "Сохранить профиль"}
              </button>
            </form>
          </section>

          <section className="profile-card">
            <h2>Безопасность</h2>
            <p className="profile-hint">Для смены пароля нужно подтвердить текущий пароль.</p>

            <form onSubmit={submitPassword} className="profile-form">
              <label>
                Текущий пароль
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                  }
                  autoComplete="current-password"
                  required
                />
              </label>

              <label>
                Новый пароль
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label>
                Повторите новый пароль
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <button className="profile-secondary" type="submit">Изменить пароль</button>
            </form>
          </section>
        </div>

        <section className="profile-service-grid">
          <article className="profile-card profile-service-card">
            <div className="profile-section-head">
              <div>
                <h2>Email-центр</h2>
                <p className="profile-hint">Подтверждения и отмены бронирований с историей доставки.</p>
              </div>
              <span className={`profile-service-status ${notificationChannel?.enabled ? "ready" : "disabled"}`}>
                {notificationChannel?.enabled
                  ? notificationChannel?.provider === "console" ? "TEST / console" : "Включено"
                  : "Выключено"}
              </span>
            </div>

            <div className="profile-service-meta">
              <span>Провайдер</span><strong>{notificationChannel?.provider || "—"}</strong>
              <span>Режим</span><strong>{notificationChannel?.mode || "disabled"}</strong>
            </div>

            <button type="button" className="profile-primary" disabled={notificationBusy} onClick={testEmailChannel}>
              {notificationBusy ? "Проверяем..." : "Отправить тестовое уведомление"}
            </button>

            <div className="notification-history">
              {notifications.length === 0 ? (
                <div className="profile-empty">История уведомлений пока пуста.</div>
              ) : notifications.map((item) => (
                <div className="notification-row" key={item.id}>
                  <div>
                    <strong>{item.event_type === "booking_confirmed" ? "Бронь подтверждена" : item.event_type === "booking_cancelled" ? "Бронь отменена" : "Проверка email"}</strong>
                    <small>{new Date(item.created_at).toLocaleString("ru-RU")} · {item.recipient}</small>
                  </div>
                  <div className="notification-row-actions">
                    <span className={`notification-status status-${item.status}`}>{item.status}</span>
                    {["failed", "disabled"].includes(item.status) && (
                      <button type="button" disabled={notificationBusy} onClick={() => retryEmail(item)}>Повторить</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="profile-card profile-service-card">
            <div className="profile-section-head">
              <div>
                <h2>Платёжный контур</h2>
                <p className="profile-hint">Подготовка шлюза без включения реальных списаний.</p>
              </div>
              <span className={`profile-service-status ${paymentReadiness?.sandboxAvailable ? "ready" : "disabled"}`}>
                {paymentReadiness?.sandboxAvailable ? "Sandbox" : "Не подключён"}
              </span>
            </div>

            <div className="payment-readiness-box">
              <div><span>Режим</span><strong>{paymentReadiness?.mode || "disabled"}</strong></div>
              <div><span>Провайдер</span><strong>{paymentReadiness?.provider || "none"}</strong></div>
              <div><span>Реальные списания</span><strong className="safe-off">ВЫКЛЮЧЕНЫ</strong></div>
            </div>
            <p className="profile-hint">
              {paymentReadiness?.message || "Hotelbeds TEST работает отдельно от оплаты. Реальный эквайринг будет подключаться следующим этапом."}
            </p>
          </article>
        </section>

        <section className="profile-card profile-travelers">
          <div className="profile-section-head">
            <div>
              <h2>Сохранённые туристы</h2>
              <p className="profile-hint">Их можно быстро подставлять в Checkout. Максимум 12 профилей.</p>
            </div>
            <span className="profile-count">{travelers.length}/12</span>
          </div>

          {travelers.length === 0 ? (
            <div className="profile-empty">Пока нет сохранённых туристов.</div>
          ) : (
            <div className="saved-traveler-grid">
              {travelers.map((traveler) => (
                <article className="saved-traveler" key={traveler.id}>
                  <div>
                    <span className="traveler-type">
                      {traveler.traveler_type === "CH" ? "Ребёнок" : "Взрослый"}
                    </span>
                    <h3>{traveler.label}</h3>
                    <p>{traveler.first_name} {traveler.last_name}</p>
                    <small>
                      {traveler.birth_date
                        ? `Дата рождения: ${dateOnlyLabel(traveler.birth_date)}`
                        : "Дата рождения не указана"}
                    </small>
                  </div>
                  <div className="saved-traveler-actions">
                    <button type="button" onClick={() => editTraveler(traveler)}>Изменить</button>
                    <button type="button" className="danger" onClick={() => removeTraveler(traveler)}>Удалить</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <form id="saved-traveler-form" className="traveler-editor" onSubmit={saveTraveler}>
            <h3>{travelerForm.id ? "Изменить туриста" : "Добавить туриста"}</h3>

            <div className="traveler-editor-grid">
              <label>
                Название
                <input
                  placeholder="Например: Я, Супруга, Ребёнок"
                  value={travelerForm.label}
                  onChange={(event) =>
                    setTravelerForm((current) => ({ ...current, label: event.target.value }))
                  }
                />
              </label>

              <label>
                Тип
                <select
                  value={travelerForm.traveler_type}
                  onChange={(event) =>
                    setTravelerForm((current) => ({ ...current, traveler_type: event.target.value }))
                  }
                >
                  <option value="AD">Взрослый</option>
                  <option value="CH">Ребёнок</option>
                </select>
              </label>

              <label>
                Имя
                <input
                  value={travelerForm.first_name}
                  onChange={(event) =>
                    setTravelerForm((current) => ({ ...current, first_name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Фамилия
                <input
                  value={travelerForm.last_name}
                  onChange={(event) =>
                    setTravelerForm((current) => ({ ...current, last_name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Дата рождения
                <input
                  type="date"
                  value={travelerForm.birth_date}
                  onChange={(event) =>
                    setTravelerForm((current) => ({ ...current, birth_date: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="profile-editor-actions">
              <button className="profile-primary" type="submit">
                {travelerForm.id ? "Сохранить изменения" : "Добавить туриста"}
              </button>
              {travelerForm.id && (
                <button type="button" className="profile-ghost" onClick={() => setTravelerForm(EMPTY_TRAVELER)}>
                  Отмена
                </button>
              )}
            </div>
          </form>
        </section>
      </main>

      <Footer />
    </>
  );
}
