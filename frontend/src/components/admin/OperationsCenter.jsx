import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminActions, getAdminOverview, getAdminReadiness } from "../../services/adminService";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

function checkClass(check) {
  if (check.ready) return "ok";
  return check.blocker ? "blocked" : "warn";
}

export default function OperationsCenter({ onSelectTab }) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const [overviewData, readinessData, actionData] = await Promise.all([
        getAdminOverview(),
        getAdminReadiness(),
        getAdminActions(12),
      ]);
      setOverview(overviewData);
      setReadiness(readinessData);
      setActions(actionData.items || []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить операционный центр");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (loading) return <div className="ops-loading">Загрузка operational center...</div>;

  return (
    <div className="ops-center">
      {error && <div className="ops-error">{error}</div>}

      <section className="ops-safety-banner">
        <div>
          <strong>🛡 Sprint 3A — product-ready безопасный режим</strong>
          <p>LIVE продажи выключены. Sprint 3A улучшает клиентский поиск, карточку отеля, checkout и мобильный UX; reliability-контур Sprint 2N сохранён. Реальные операции остаются заблокированы.</p>
        </div>
        <div className="ops-safety-actions">
          <button type="button" onClick={() => onSelectTab?.("incidents")}>🚨 Инциденты</button>
          <button type="button" onClick={load}>Обновить</button>
        </div>
      </section>

      <div className="ops-two-columns">
        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>Production-readiness</h3>
              <p>Что уже готово и что блокирует переход к LIVE.</p>
            </div>
            <span className="ops-pill blocked">LIVE OFF</span>
          </div>

          <div className="ops-checks">
            {(readiness?.checks || []).map((check) => (
              <div key={check.key} className={`ops-check ${checkClass(check)}`}>
                <span className="ops-check-icon">{check.ready ? "✓" : check.blocker ? "!" : "•"}</span>
                <div>
                  <strong>{check.label}</strong>
                  <small>{check.detail || (check.ready ? "готово" : check.blocker ? "требует подключения" : "информационно")}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="ops-runtime-grid">
            <div><span>Payments</span><strong>{readiness?.payments?.mode || "—"}</strong></div>
            <div><span>Email</span><strong>{readiness?.email?.mode || "—"}</strong></div>
            <div><span>Hotelbeds Booking</span><strong>{readiness?.hotelbeds?.bookingEndpoint || "—"}</strong></div>
            <div><span>Tolerance</span><strong>{readiness?.hotelbeds?.tolerance ?? 0}%</strong></div>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>Требуют внимания</h3>
              <p>Hotelbeds-брони с неопределённым или истёкшим состоянием.</p>
            </div>
            <span className="ops-pill warn">{overview?.bookings?.attention || 0}</span>
          </div>

          <div className="ops-attention-list">
            {(overview?.attentionBookings || []).length === 0 ? (
              <div className="ops-empty">Нет броней, требующих ручной проверки.</div>
            ) : (
              overview.attentionBookings.map((item) => (
                <button
                  type="button"
                  className="ops-attention-row"
                  key={item.id}
                  onClick={() => navigate(`/my-bookings/${item.id}`)}
                >
                  <div>
                    <strong>TRAVIO-{item.id} · {item.hotel}</strong>
                    <small>{item.provider_booking_id || "HB reference отсутствует"}</small>
                  </div>
                  <span>{item.provider_status || item.status}</span>
                </button>
              ))
            )}
          </div>

          <button type="button" className="ops-link-button" onClick={() => onSelectTab?.("bookings")}>Открыть все бронирования →</button>
        </section>
      </div>

      <section className="ops-panel">
        <div className="ops-panel-title">
          <div>
            <h3>Журнал действий администратора</h3>
            <p>Отдельный audit trail CRM: sync, изменения статусов, повторная доставка и другие операции.</p>
          </div>
          <span className="ops-pill">{actions.length}</span>
        </div>

        <div className="ops-audit-list">
          {actions.length === 0 ? (
            <div className="ops-empty">Административных действий пока нет.</div>
          ) : (
            actions.map((item) => (
              <div className="ops-audit-row" key={item.id}>
                <div>
                  <strong>{item.action_type}</strong>
                  <small>{item.admin_name || item.admin_email || "Администратор"} · {fmtDate(item.created_at)}</small>
                </div>
                <div className="ops-audit-target">
                  <span>{item.target_type}{item.target_id ? ` #${item.target_id}` : ""}</span>
                  <b className={`ops-action-status ${item.status || "success"}`}>{item.status || "success"}</b>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
