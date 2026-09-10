import HotelbedsStatus from "./HotelbedsStatus";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminPermissions,
  getAdminSystemEvents,
  getAdminSystemMetrics,
  getAdminSystemStatus,
  runAdminSystemSelfTest,
} from "../../services/adminService";

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU");
}

function checkTone(item) {
  if (item.ready) return "ok";
  return item.blocker ? "blocked" : "warn";
}

function eventTone(level) {
  const value = String(level || "info").toLowerCase();
  if (value === "error") return "blocked";
  if (value === "warn" || value === "warning") return "warn";
  return "ok";
}

export default function SystemCenter() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [selfTestResult, setSelfTestResult] = useState(null);
  const [refreshingEvents, setRefreshingEvents] = useState(false);
  const [eventsRefreshedAt, setEventsRefreshedAt] = useState(null);
  const [eventsRefreshMessage, setEventsRefreshMessage] = useState("");
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);
  const [metricsRefreshedAt, setMetricsRefreshedAt] = useState(null);

  async function load() {
    try {
      setError("");
      const [statusData, eventsData, permissionData, monitorData] = await Promise.all([
        getAdminSystemStatus(),
        getAdminSystemEvents({ limit: 30 }),
        getAdminPermissions(),
        getAdminSystemMetrics(),
      ]);
      setStatus(statusData);
      setEvents(eventsData.items || []);
      setPermissions(permissionData);
      setMonitor(monitorData);
    } catch (err) {
      setError(err.message || "Не удалось загрузить системный центр");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function selfTest() {
    try {
      setRunning(true);
      setError("");
      setSelfTestResult(null);
      const startedAt = Date.now();
      const result = await runAdminSystemSelfTest();
      const nextStatus = result.status || null;
      setStatus(nextStatus);
      const checks = nextStatus?.checks || [];
      const passed = checks.filter((item) => item.ready).length;
      setSelfTestResult({
        ok: Boolean(result.success && nextStatus?.safeModeHealthy),
        success: Boolean(result.success),
        safeModeHealthy: Boolean(nextStatus?.safeModeHealthy),
        passed,
        total: checks.length,
        eventId: result.eventId || null,
        finishedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt),
        checks,
      });
      const eventsData = await getAdminSystemEvents({ limit: 30 });
      setEvents(eventsData.items || []);
    } catch (err) {
      setSelfTestResult(null);
      setError(err.message || "Self-test завершился ошибкой");
    } finally {
      setRunning(false);
    }
  }

  async function refreshEvents() {
    try {
      setRefreshingEvents(true);
      setEventsRefreshMessage("");
      setError("");
      const eventsData = await getAdminSystemEvents({ limit: 30 });
      const nextEvents = eventsData.items || [];
      setEvents(nextEvents);
      const now = new Date().toISOString();
      setEventsRefreshedAt(now);
      setEventsRefreshMessage(`Обновлено · ${nextEvents.length} событий`);
    } catch (err) {
      setEventsRefreshMessage("");
      setError(err.message || "Не удалось обновить System events");
    } finally {
      setRefreshingEvents(false);
    }
  }

  async function refreshMetrics() {
    try {
      setRefreshingMetrics(true);
      setError("");
      const data = await getAdminSystemMetrics();
      setMonitor(data);
      setMetricsRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message || "Не удалось обновить operational metrics");
    } finally {
      setRefreshingMetrics(false);
    }
  }

  const currentPermissions = useMemo(
    () => permissions?.currentPermissions || [],
    [permissions]
  );

  if (loading) return <div className="ops-loading">Загрузка Sprint 3A System Center...</div>;

  return (
    <div className="system-center">
      <HotelbedsStatus />
      {error && <div className="ops-error">{error}</div>}

      <section className="system-hero">
        <div>
          <span className="system-kicker">SPRINT 3A · PRODUCT EXPERIENCE + RELIABILITY BASELINE</span>
          <h2>Система и готовность</h2>
          <p>
            Reliability monitor и incident lifecycle поверх backup, health monitoring, structured logging и API metrics Sprint 2M.
            Реальные списания и возвраты по-прежнему не включаются.
          </p>
        </div>
        <div className="system-hero-actions">
          <span className={`system-health-pill ${status?.safeModeHealthy ? "ok" : "blocked"}`}>
            {status?.safeModeHealthy ? "SAFE MODE HEALTHY" : "ATTENTION"}
          </span>
          <button type="button" className="system-self-test" onClick={selfTest} disabled={running}>
            {running ? "Проверяем..." : "Запустить self-test"}
          </button>
        </div>
      </section>

      {selfTestResult && (
        <section className={`system-self-test-result ${selfTestResult.ok ? "ok" : "warn"}`} role="status" aria-live="polite">
          <div className="system-self-test-result-icon">{selfTestResult.ok ? "✓" : "!"}</div>
          <div className="system-self-test-result-body">
            <div className="system-self-test-result-title-row">
              <div>
                <h3>{selfTestResult.ok ? "Self-test успешно завершён" : "Self-test завершён: требуется внимание"}</h3>
                <p>
                  {selfTestResult.passed}/{selfTestResult.total} проверок пройдено · read-only · реальные операции не выполнялись.
                </p>
              </div>
              <span className={`system-self-test-result-pill ${selfTestResult.ok ? "ok" : "warn"}`}>
                {selfTestResult.ok ? "SYSTEM OK" : "ATTENTION"}
              </span>
            </div>
            <div className="system-self-test-result-grid">
              {selfTestResult.checks.map((item) => (
                <div key={item.key} className={`system-self-test-result-check ${item.ready ? "ok" : "warn"}`}>
                  <span>{item.ready ? "✓" : "!"}</span>
                  <div><strong>{item.label}</strong><small>{item.detail || "—"}</small></div>
                </div>
              ))}
            </div>
            <div className="system-self-test-result-meta">
              <span>{fmtDate(selfTestResult.finishedAt)}</span>
              <span>{selfTestResult.durationMs} ms</span>
              {selfTestResult.eventId ? <span>event #{selfTestResult.eventId}</span> : null}
            </div>
          </div>
          <button type="button" className="system-self-test-result-close" onClick={() => setSelfTestResult(null)} aria-label="Скрыть результат">×</button>
        </section>
      )}

      <div className="system-summary-grid">
        <article className="system-summary-card">
          <span>Release</span>
          <strong>{status?.release || "3A"}</strong>
          <small>{status?.environment || "development"}</small>
        </article>
        <article className="system-summary-card">
          <span>PostgreSQL</span>
          <strong>{status?.database?.ok ? "READY" : "DOWN"}</strong>
          <small>{status?.database?.latencyMs ?? "—"} ms</small>
        </article>
        <article className="system-summary-card">
          <span>Uptime</span>
          <strong>{Math.floor((status?.uptimeSeconds || 0) / 60)} min</strong>
          <small>backend process</small>
        </article>
        <article className="system-summary-card danger">
          <span>Production</span>
          <strong>BLOCKED</strong>
          <small>real money OFF</small>
        </article>
      </div>

      <div className="system-columns">
        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>Readiness checks</h3>
              <p>Проверки, которые можно выполнять без изменения бронирований и платежей.</p>
            </div>
            <span className="ops-pill">{(status?.checks || []).length}</span>
          </div>
          <div className="ops-checks">
            {(status?.checks || []).map((item) => (
              <div className={`ops-check ${checkTone(item)}`} key={item.key}>
                <span className="ops-check-icon">{item.ready ? "✓" : item.blocker ? "!" : "•"}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail || "—"}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>Production blockers</h3>
              <p>Sprint 3A не разрешает LIVE даже при корректной конфигурации TEST-среды.</p>
            </div>
            <span className="ops-pill blocked">LIVE OFF</span>
          </div>
          <div className="system-blockers">
            {(status?.productionBlockers || []).map((item) => (
              <div key={item} className="system-blocker-row"><span>🔒</span><strong>{item}</strong></div>
            ))}
          </div>
          <div className="system-gate-grid">
            <div><span>Продажи</span><b>OFF</b></div>
            <div><span>Списания</span><b>OFF</b></div>
            <div><span>Возвраты</span><b>OFF</b></div>
            <div><span>Enforced safe mode</span><b>{status?.gate?.enforcedSafeMode ? "YES" : "NO"}</b></div>
          </div>
        </section>
      </div>

      <div className="system-columns">
        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>Интеграционные контуры</h3>
              <p>Секреты и ключи в интерфейс не передаются.</p>
            </div>
          </div>
          <div className="system-provider-grid">
            <div><span>Payments</span><strong>{status?.payments?.mode || "—"}</strong><small>{status?.payments?.provider || "none"}</small></div>
            <div><span>Email</span><strong>{status?.email?.mode || "—"}</strong><small>{status?.email?.provider || "—"}</small></div>
            <div><span>Hotelbeds</span><strong>{status?.hotelbeds?.bookingEnabled ? "BOOKING TEST" : "OFF"}</strong><small>{status?.hotelbeds?.testEndpoint ? "mTLS TEST endpoint" : "endpoint check"}</small></div>
            <div><span>Tolerance</span><strong>{status?.hotelbeds?.tolerance ?? 0}%</strong><small>{status?.hotelbeds?.toleranceEnabled ? "enabled" : "strict"}</small></div>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-title">
            <div>
              <h3>RBAC / permissions</h3>
              <p>Текущая роль: <b>{permissions?.currentRole || "—"}</b></p>
            </div>
            <span className="ops-pill">{currentPermissions.length}</span>
          </div>
          <div className="system-permissions">
            {currentPermissions.map((permission) => (
              <span key={permission}>{permission}</span>
            ))}
          </div>
        </section>
      </div>

      <section className="ops-panel system-2m-observability">
        <div className="ops-panel-title">
          <div>
            <h3>2M operational monitoring · retained</h3>
            <p>In-memory API metrics, health monitor и статус автоматического backup scheduler. Секреты и тела запросов не показываются.</p>
          </div>
          <div className="system-events-refresh-actions">
            {metricsRefreshedAt && <span className="system-events-refresh-status">✓ {new Date(metricsRefreshedAt).toLocaleTimeString("ru-RU")}</span>}
            <button type="button" className="ops-small-btn" onClick={refreshMetrics} disabled={refreshingMetrics}>
              {refreshingMetrics ? "Обновляем..." : "Обновить метрики"}
            </button>
          </div>
        </div>

        <div className="system-2m-metrics-grid">
          <article><span>Requests</span><strong>{monitor?.metrics?.totalRequests ?? 0}</strong><small>since backend start</small></article>
          <article><span>In-flight</span><strong>{monitor?.metrics?.inFlight ?? 0}</strong><small>active HTTP requests</small></article>
          <article><span>Average latency</span><strong>{monitor?.metrics?.averageLatencyMs ?? 0} ms</strong><small>P95 {monitor?.metrics?.p95LatencyMs ?? 0} ms</small></article>
          <article><span>Errors · 5 min</span><strong>{monitor?.metrics?.lastFiveMinutes?.errors ?? 0}</strong><small>{monitor?.metrics?.lastFiveMinutes?.errorRatePct ?? 0}% error rate</small></article>
          <article><span>Health monitor</span><strong>{monitor?.healthMonitor?.lastState || "unknown"}</strong><small>{monitor?.healthMonitor?.enabled ? `${Math.round((monitor?.healthMonitor?.intervalMs || 0) / 1000)}s interval` : "disabled"}</small></article>
          <article><span>Reliability monitor</span><strong>{monitor?.reliability?.overallState || "unknown"}</strong><small>{monitor?.reliability?.enabled ? `${Math.round((monitor?.reliability?.intervalMs || 0) / 1000)}s · PostgreSQL history` : "disabled"}</small></article>
          <article><span>Backup scheduler</span><strong>{monitor?.backupScheduler?.enabled ? "ENABLED" : "DISABLED"}</strong><small>{monitor?.backupScheduler?.enabled ? `next ${fmtDate(monitor?.backupScheduler?.nextRunAt)}` : "manual backups remain available"}</small></article>
          <article><span>Backup inventory</span><strong>{monitor?.backups?.count ?? 0}</strong><small>{monitor?.backups?.latest?.modifiedAt ? `latest ${fmtDate(monitor.backups.latest.modifiedAt)}` : "no local backup found"}</small></article>
          <article><span>Log format</span><strong>{status?.operations?.structuredLogging?.format || "pretty"}</strong><small>secret-key redaction enabled</small></article>
        </div>

        <div className="system-2m-window-row">
          <div><span>Последняя минута</span><b>{monitor?.metrics?.lastMinute?.requests ?? 0} req</b><small>{monitor?.metrics?.lastMinute?.averageLatencyMs ?? 0} ms avg</small></div>
          <div><span>Последние 5 минут</span><b>{monitor?.metrics?.lastFiveMinutes?.requests ?? 0} req</b><small>P95 {monitor?.metrics?.lastFiveMinutes?.p95LatencyMs ?? 0} ms</small></div>
          <div><span>HTTP 5xx всего</span><b>{monitor?.metrics?.statusClasses?.["5xx"] ?? 0}</b><small>server errors</small></div>
          <div><span>Health availability</span><b>{monitor?.healthMonitor?.recentAvailabilityPct ?? "—"}%</b><small>recent in-memory samples</small></div>
        </div>

        {(monitor?.metrics?.topRoutes || []).length > 0 && (
          <div className="system-2m-routes">
            <strong>Top API routes</strong>
            {(monitor.metrics.topRoutes || []).slice(0, 5).map((item) => (
              <div key={item.route}><code>{item.route}</code><span>{item.requests} req · {item.averageLatencyMs} ms · {item.errors} err</span></div>
            ))}
          </div>
        )}
      </section>

      <section className="ops-panel system-2l-guardrails">
        <div className="ops-panel-title">
          <div>
            <h3>2L deployment safeguards · retained</h3>
            <p>Контуры развёртывания и восстановления. Backup/restore выполняются только из CLI; данные резервной копии через браузер не передаются.</p>
          </div>
          <span className="ops-pill">SAFE OPS</span>
        </div>
        <div className="system-2l-grid">
          <article>
            <span>API rate limit</span>
            <strong>{status?.operations?.rateLimit?.api?.max || "—"} / {Math.round((status?.operations?.rateLimit?.api?.windowMs || 0) / 1000)}s</strong>
            <small>in-memory · health probes bypass</small>
          </article>
          <article>
            <span>Auth rate limit</span>
            <strong>{status?.operations?.rateLimit?.auth?.max || "—"} / {Math.round((status?.operations?.rateLimit?.auth?.windowMs || 0) / 60000)}m</strong>
            <small>login/register protection</small>
          </article>
          <article>
            <span>Security headers</span>
            <strong>{status?.operations?.securityHeaders?.headers?.length || 0} enabled</strong>
            <small>CSP · frame deny · nosniff · referrer · permissions</small>
          </article>
          <article>
            <span>Graceful shutdown</span>
            <strong>{status?.operations?.gracefulShutdown?.graceMs || "—"} ms</strong>
            <small>drain → close PostgreSQL pool</small>
          </article>
          <article>
            <span>Database backups</span>
            <strong>{status?.operations?.backups?.writable ? "PATH READY" : "PATH BLOCKED"}</strong>
            <small>retention {status?.operations?.backups?.retention || "—"} · encryption {status?.operations?.backups?.encryptionConfigured ? "ON" : "OFF"}</small>
          </article>
          <article>
            <span>Restore guard</span>
            <strong>DRY-RUN DEFAULT</strong>
            <small>transactional · explicit --apply + env gate</small>
          </article>
        </div>
        <div className="system-cli-box">
          <div><span>Create backup</span><code>npm run backup:create</code></div>
          <div><span>Verify backup</span><code>npm run backup:verify -- &lt;file&gt;</code></div>
          <div><span>Restore check</span><code>npm run backup:restore -- &lt;file&gt;</code></div>
          <div><span>Deploy preflight</span><code>npm run preflight</code></div>
          <div><span>Retention cleanup</span><code>npm run backup:cleanup</code></div>
          <div><span>One-shot scheduled backup</span><code>npm run backup:scheduled</code></div>
        </div>
        {!status?.operations?.backups?.encryptionConfigured && (
          <div className="system-2l-warning">
            ⚠ В development резервная копия может быть без шифрования. Она содержит данные БД. Для реального окружения настройте DB_BACKUP_ENCRYPTION_KEY и DB_BACKUP_REQUIRE_ENCRYPTION=true.
          </div>
        )}
      </section>

      <section className="ops-panel">
        <div className="ops-panel-title">
          <div>
            <h3>System events</h3>
            <p>Ошибки HTTP, медленные запросы и результаты self-test. Тела запросов и секреты не логируются.</p>
          </div>
          <div className="system-events-refresh-actions">
            {(eventsRefreshMessage || eventsRefreshedAt) && (
              <span className="system-events-refresh-status" role="status" aria-live="polite">
                ✓ {eventsRefreshMessage || "Обновлено"}
                {eventsRefreshedAt ? ` · ${new Date(eventsRefreshedAt).toLocaleTimeString("ru-RU")}` : ""}
              </span>
            )}
            <button
              type="button"
              className="ops-small-btn system-events-refresh-btn"
              onClick={refreshEvents}
              disabled={refreshingEvents}
            >
              {refreshingEvents ? "Обновляем..." : "Обновить"}
            </button>
          </div>
        </div>

        <div className="system-events-table-wrap">
          <table className="system-events-table">
            <thead>
              <tr><th>Время</th><th>Уровень</th><th>Категория</th><th>Событие</th><th>HTTP</th><th>Request ID</th></tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={6} className="ops-empty-cell">Системных событий пока нет. Запустите read-only self-test.</td></tr>
              ) : events.map((item) => (
                <tr key={item.id}>
                  <td>{fmtDate(item.created_at)}</td>
                  <td><span className={`system-event-level ${eventTone(item.level)}`}>{item.level}</span></td>
                  <td>{item.category}</td>
                  <td><strong>{item.code || "—"}</strong><small>{item.message}</small></td>
                  <td>{item.status_code || "—"}{item.duration_ms !== null && item.duration_ms !== undefined ? ` · ${item.duration_ms} ms` : ""}</td>
                  <td><code>{item.request_id ? String(item.request_id).slice(0, 12) : "—"}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
