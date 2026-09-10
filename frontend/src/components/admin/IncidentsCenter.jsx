import { useEffect, useMemo, useState } from "react";
import {
  acknowledgeAdminIncident,
  getAdminReliability,
  runAdminReliabilityCheck,
} from "../../services/adminService";

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU");
}

function stateLabel(value) {
  const state = String(value || "unknown").toLowerCase();
  if (state === "healthy") return "HEALTHY";
  if (state === "degraded") return "DEGRADED";
  if (state === "unhealthy") return "UNHEALTHY";
  return "UNKNOWN";
}

function durationLabel(item) {
  const start = new Date(item.first_detected_at || item.created_at || 0).getTime();
  const end = item.resolved_at ? new Date(item.resolved_at).getTime() : Date.now();
  if (!start || Number.isNaN(start) || Number.isNaN(end)) return "—";
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч ${rest} мин`;
}

function historyState(item) {
  return String(item?.overall_state || "unknown").toLowerCase();
}

export default function IncidentsCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [acking, setAcking] = useState(null);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  async function load() {
    try {
      setError("");
      const next = await getAdminReliability();
      setData(next);
      setRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message || "Не удалось загрузить reliability dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, []);

  async function runCheck() {
    try {
      setChecking(true);
      setError("");
      const result = await runAdminReliabilityCheck();
      setData(result.dashboard || null);
      setRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message || "Reliability check завершился ошибкой");
    } finally {
      setChecking(false);
    }
  }

  async function acknowledge(id) {
    try {
      setAcking(id);
      setError("");
      await acknowledgeAdminIncident(id);
      await load();
    } catch (err) {
      setError(err.message || "Не удалось подтвердить инцидент");
    } finally {
      setAcking(null);
    }
  }

  const current = data?.current || data?.monitor?.lastSnapshot || null;
  const components = Array.isArray(current?.components) ? current.components : [];
  const active = useMemo(
    () => (data?.incidents || []).filter((item) => item.status === "open" || item.status === "acknowledged"),
    [data]
  );
  const resolved = useMemo(
    () => (data?.incidents || []).filter((item) => item.status === "resolved"),
    [data]
  );
  const history = (data?.history || []).slice(0, 24).reverse();

  if (loading) return <div className="ops-loading">Загрузка Sprint 3A Incident Center...</div>;

  return (
    <div className="incidents-center">
      {error && <div className="ops-error">{error}</div>}

      <section className={`incident-hero ${current?.overallState || "unknown"}`}>
        <div>
          <span className="system-kicker">SPRINT 3A · RELIABILITY BASELINE</span>
          <h2>Incident & Reliability Center</h2>
          <p>
            PostgreSQL, API 5xx, backup freshness, Email/outbox и Hotelbeds TEST. Asedeliya автоматически открывает инцидент при ухудшении и закрывает его после восстановления.
          </p>
        </div>
        <div className="incident-hero-actions">
          <span className={`incident-state-pill ${current?.overallState || "unknown"}`}>{stateLabel(current?.overallState)}</span>
          <button type="button" className="system-self-test" onClick={runCheck} disabled={checking}>
            {checking ? "Проверяем..." : "Проверить сейчас"}
          </button>
          <button type="button" className="ops-small-btn incident-refresh-btn" onClick={load}>Обновить</button>
        </div>
      </section>

      <div className="incident-summary-grid">
        <article><span>Состояние</span><strong>{stateLabel(current?.overallState)}</strong><small>{fmtDate(current?.generatedAt)}</small></article>
        <article><span>Open</span><strong>{data?.counts?.open ?? 0}</strong><small>требуют реакции</small></article>
        <article><span>Acknowledged</span><strong>{data?.counts?.acknowledged ?? 0}</strong><small>администратор увидел</small></article>
        <article><span>Critical active</span><strong>{data?.counts?.critical_active ?? 0}</strong><small>активные critical</small></article>
        <article><span>Resolved</span><strong>{data?.counts?.resolved ?? 0}</strong><small>история восстановления</small></article>
        <article><span>Monitor</span><strong>{data?.monitor?.enabled ? "ENABLED" : "DISABLED"}</strong><small>{Math.round((data?.monitor?.intervalMs || 0) / 1000)}s interval</small></article>
      </div>

      <section className="ops-panel incident-components-panel">
        <div className="ops-panel-title">
          <div><h3>Компоненты</h3><p>Текущая оценка по локальным метрикам и журналам. Дополнительные Hotelbeds booking-запросы монитор не создаёт.</p></div>
          {refreshedAt && <span className="system-events-refresh-status">✓ {new Date(refreshedAt).toLocaleTimeString("ru-RU")}</span>}
        </div>
        <div className="incident-components-grid">
          {components.map((item) => (
            <article key={item.key} className={`incident-component ${item.state}`}>
              <div className="incident-component-head">
                <strong>{item.label}</strong>
                <span className={`incident-mini-state ${item.state}`}>{stateLabel(item.state)}</span>
              </div>
              <p>{item.detail}</p>
            </article>
          ))}
          {!components.length && <div className="ops-empty-cell">Снимок ещё не создан. Нажмите «Проверить сейчас».</div>}
        </div>
      </section>

      <section className="ops-panel incident-active-panel">
        <div className="ops-panel-title">
          <div><h3>Активные инциденты</h3><p>OPEN можно подтвердить. ACKNOWLEDGED означает, что проблему увидели; RESOLVED выставляется автоматически после восстановления.</p></div>
          <span className={`ops-pill ${active.length ? "blocked" : ""}`}>{active.length}</span>
        </div>
        {active.length === 0 ? (
          <div className="incident-empty-ok">✓ Активных инцидентов нет.</div>
        ) : (
          <div className="incident-table-wrap">
            <table className="incident-table">
              <thead><tr><th>Инцидент</th><th>Источник</th><th>Severity</th><th>Статус</th><th>Обнаружен</th><th>Длительность</th><th>Действия</th></tr></thead>
              <tbody>
                {active.map((item) => (
                  <tr key={item.id}>
                    <td><strong>#{item.id} · {item.title}</strong><small>{item.summary}</small></td>
                    <td>{item.source}</td>
                    <td><span className={`incident-severity ${item.severity}`}>{item.severity}</span></td>
                    <td><span className={`incident-status ${item.status}`}>{item.status}</span></td>
                    <td>{fmtDate(item.first_detected_at)}</td>
                    <td>{durationLabel(item)}</td>
                    <td>{item.status === "open" ? <button className="ops-small-btn" disabled={acking === item.id} onClick={() => acknowledge(item.id)}>{acking === item.id ? "..." : "Подтвердить"}</button> : <small>{item.acknowledged_by_name || "Администратор"}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="incident-lower-grid">
        <section className="ops-panel">
          <div className="ops-panel-title"><div><h3>Health history · 24h</h3><p>Последние сохранённые оценки reliability.</p></div><span className="ops-pill">{data?.history?.length || 0}</span></div>
          <div className="incident-history-strip" title="Зелёный = healthy, жёлтый = degraded, красный = unhealthy">
            {history.length ? history.map((item) => <span key={item.id} className={historyState(item)} title={`${fmtDate(item.created_at)} · ${stateLabel(item.overall_state)}`} />) : <small>Истории пока нет</small>}
          </div>
          <div className="incident-history-legend"><span><i className="healthy" /> healthy</span><span><i className="degraded" /> degraded</span><span><i className="unhealthy" /> unhealthy</span></div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-title"><div><h3>Alert thresholds</h3><p>Пороговые значения reliability baseline Sprint 2N.</p></div></div>
          <div className="incident-threshold-grid">
            <div><span>API 5xx</span><b>{current?.thresholds?.apiDegraded5xxPct ?? 2}% / {current?.thresholds?.apiUnhealthy5xxPct ?? 10}%</b><small>degraded / unhealthy · min {current?.thresholds?.apiMinRequests ?? 10} req</small></div>
            <div><span>Backup freshness</span><b>{current?.thresholds?.backupWarnHours ?? 36}h / {current?.thresholds?.backupCriticalHours ?? 72}h</b><small>warn / critical</small></div>
            <div><span>Email failed/stuck</span><b>{current?.thresholds?.emailFailedWarn ?? 1} / {current?.thresholds?.emailFailedCritical ?? 5}</b><small>warn / critical</small></div>
            <div><span>Hotelbeds errors</span><b>{current?.thresholds?.hotelbedsWarnErrors ?? 1} / {current?.thresholds?.hotelbedsCriticalErrors ?? 5}</b><small>{current?.thresholds?.hotelbedsErrorWindowMin ?? 15} min window</small></div>
          </div>
        </section>
      </div>

      <section className="ops-panel incident-resolved-panel">
        <div className="ops-panel-title"><div><h3>Недавние resolved</h3><p>История автоматически закрытых проблем.</p></div><span className="ops-pill">{resolved.length}</span></div>
        {resolved.length === 0 ? <div className="ops-empty-cell">Resolved-инцидентов пока нет.</div> : (
          <div className="incident-resolved-list">
            {resolved.slice(0, 8).map((item) => (
              <div key={item.id}><strong>#{item.id} · {item.title}</strong><span>{item.source} · {fmtDate(item.resolved_at)} · {item.resolution || "resolved"}</span></div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
