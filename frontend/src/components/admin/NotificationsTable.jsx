import { useEffect, useState } from "react";
import { getAdminNotifications, retryAdminNotification } from "../../services/adminService";

function dateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

export default function NotificationsTable({ search = "" }) {
  const [status, setStatus] = useState("all");
  const [data, setData] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load(page = 1) {
    try {
      setLoading(true);
      const result = await getAdminNotifications({ q: search, status, page, limit: 25 });
      setData(result);
    } catch (err) {
      alert(err.message || "Не удалось загрузить email-outbox");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
  }, [search, status]);

  async function retry(item) {
    if (!window.confirm(`Повторить доставку уведомления #${item.id} на ${item.recipient}?`)) return;
    try {
      setBusyId(item.id);
      const result = await retryAdminNotification(item.id);
      alert(`Результат доставки: ${result?.result?.status || "ok"}`);
      await load(data.pagination.page || 1);
    } catch (err) {
      alert(err.message || "Не удалось повторить доставку");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ops-table-shell">
      <div className="ops-toolbar">
        <div>
          <h3>✉️ Email / outbox</h3>
          <p>Контроль очереди, ошибок и повторной доставки уведомлений.</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Все статусы</option>
          <option value="queued">queued</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
          <option value="disabled">disabled</option>
          <option value="skipped">skipped</option>
        </select>
      </div>

      <div className="ops-table-scroll">
        <table className="admin-table ops-table">
          <thead>
            <tr>
              <th>ID / событие</th>
              <th>Получатель</th>
              <th>Статус</th>
              <th>Попытки</th>
              <th>Последняя ошибка</th>
              <th>Создано</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="ops-empty-cell">Загрузка...</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={7} className="ops-empty-cell">Уведомлений не найдено</td></tr>
            ) : data.items.map((item) => (
              <tr key={item.id}>
                <td><strong>#{item.id} · {item.event_type}</strong><small className="ops-cell-sub">Booking: {item.booking_id || "—"}</small></td>
                <td><strong>{item.recipient}</strong><small className="ops-cell-sub">{item.subject}</small></td>
                <td><span className={`ops-status ${item.status}`}>{item.status}</span></td>
                <td>{item.attempts || 0}</td>
                <td><span className="ops-error-text">{item.last_error || "—"}</span></td>
                <td>{dateTime(item.created_at)}</td>
                <td>
                  {['failed', 'disabled'].includes(String(item.status).toLowerCase()) && (
                    <button className="ops-small-btn" type="button" disabled={busyId === item.id} onClick={() => retry(item)}>
                      {busyId === item.id ? "..." : "Повторить"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-pagination">
        <span>Всего: {data.pagination.total || 0}</span>
        <div>
          <button disabled={data.pagination.page <= 1 || loading} onClick={() => load(data.pagination.page - 1)}>←</button>
          <b>{data.pagination.page || 1} / {data.pagination.pages || 1}</b>
          <button disabled={data.pagination.page >= data.pagination.pages || loading} onClick={() => load(data.pagination.page + 1)}>→</button>
        </div>
      </div>
    </div>
  );
}
