import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminBookings, syncProviderBooking, updateAdminBookingStatus } from "../../services/adminService";
import { formatMoney } from "../../utils/money";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

function attention(item) {
  return ["CONFIRMATION_UNKNOWN", "CONFIRMATION_FAILED", "RATE_EXPIRED"].includes(
    String(item.provider_status || "").toUpperCase()
  );
}

export default function BookingsTable({ search = "" }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "all", provider: "all", paymentStatus: "all", refundStatus: "all", attention: false });
  const [data, setData] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load(page = 1) {
    try {
      setLoading(true);
      const result = await getAdminBookings({ q: search, ...filters, page, limit: 25 });
      setData(result);
    } catch (err) {
      alert(err.message || "Не удалось загрузить бронирования CRM");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
  }, [search, filters.status, filters.provider, filters.paymentStatus, filters.refundStatus, filters.attention]);

  async function reconcile(item) {
    if (!window.confirm(`Синхронизировать / Reconcile Hotelbeds для TRAVIO-${item.id}?`)) return;
    try {
      setBusyId(item.id);
      const result = await syncProviderBooking(item.id);
      alert(result.noMatch ? "Hotelbeds не нашёл бронь; статус помечен для внимания." : `HB status: ${result?.booking?.provider_status || "обновлён"}`);
      await load(data.pagination.page || 1);
    } catch (err) {
      alert(err.message || "Ошибка Hotelbeds sync/reconcile");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmLocal(item) {
    if (!window.confirm(`Подтвердить локальную mock-бронь TRAVIO-${item.id}?`)) return;
    try {
      setBusyId(item.id);
      await updateAdminBookingStatus(item.id, "Подтверждена");
      await load(data.pagination.page || 1);
    } catch (err) {
      alert(err.message || "Не удалось изменить статус");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ops-table-shell">
      <div className="ops-toolbar ops-toolbar-wrap">
        <div>
          <h3>📅 Бронирования / операции</h3>
          <p>Поиск по Asedeliya/HB reference, клиенту и отелю; безопасный sync/reconcile Hotelbeds.</p>
        </div>
        <div className="ops-filter-row">
          <select value={filters.provider} onChange={(e) => setFilters((v) => ({ ...v, provider: e.target.value }))}>
            <option value="all">Все провайдеры</option><option value="hotelbeds">Hotelbeds</option><option value="mock">mock</option><option value="legacy">legacy</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))}>
            <option value="all">Все брони</option><option value="Новая">Новая</option><option value="Подтверждена">Подтверждена</option><option value="Отменена">Отменена</option>
          </select>
          <select value={filters.paymentStatus} onChange={(e) => setFilters((v) => ({ ...v, paymentStatus: e.target.value }))}>
            <option value="all">Любая оплата</option><option value="paid">paid</option><option value="requires_action">requires_action</option><option value="pending">pending</option><option value="none">нет оплаты</option>
          </select>
          <select value={filters.refundStatus} onChange={(e) => setFilters((v) => ({ ...v, refundStatus: e.target.value }))}>
            <option value="all">Любой refund</option><option value="not_requested">not_requested</option><option value="requested">requested</option><option value="refunded">refunded</option>
          </select>
          <label className="ops-attention-toggle"><input type="checkbox" checked={filters.attention} onChange={(e) => setFilters((v) => ({ ...v, attention: e.target.checked }))} /> Только внимание</label>
        </div>
      </div>

      <div className="ops-table-scroll">
        <table className="admin-table ops-table">
          <thead><tr><th>Заказ</th><th>Клиент</th><th>Поставщик</th><th>Статусы</th><th>Оплата / refund</th><th>Сумма</th><th>Обновлено</th><th>Действия</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="ops-empty-cell">Загрузка...</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={8} className="ops-empty-cell">Бронирования не найдены</td></tr>
            ) : data.items.map((item) => (
              <tr key={item.id} className={attention(item) ? "ops-row-attention" : ""}>
                <td><strong>TRAVIO-{item.id}</strong><small className="ops-cell-sub">{item.hotel}</small><small className="ops-cell-sub">{item.city}{item.country ? `, ${item.country}` : ""}</small></td>
                <td><strong>{item.user_name || "—"}</strong><small className="ops-cell-sub">{item.email || item.user_email || "—"}</small></td>
                <td><strong>{item.provider}</strong><small className="ops-cell-sub">{item.provider_booking_id || "reference —"}</small></td>
                <td><span className={`ops-status ${attention(item) ? "attention" : "neutral"}`}>{item.status}</span><small className="ops-cell-sub">HB: {item.provider_status || "—"}</small></td>
                <td><strong>{item.payment_status || "—"}</strong><small className="ops-cell-sub">refund: {item.refund_status || "not_requested"}</small></td>
                <td>{formatMoney(item.total_amount ?? item.payment_amount ?? 0, item.currency || "KZT")}</td>
                <td>{fmtDate(item.provider_synced_at || item.updated_at || item.booking_date)}</td>
                <td>
                  <div className="ops-actions-inline">
                    <button type="button" className="ops-small-btn" onClick={() => navigate(`/my-bookings/${item.id}`)}>Открыть заказ</button>
                    {item.provider === "hotelbeds" && (
                      <button type="button" className="ops-small-btn primary" disabled={busyId === item.id} onClick={() => reconcile(item)}>{busyId === item.id ? "..." : "Reconcile HB"}</button>
                    )}
                    {item.provider !== "hotelbeds" && item.status === "Новая" && (
                      <button type="button" className="ops-small-btn success" disabled={busyId === item.id} onClick={() => confirmLocal(item)}>Подтвердить</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops-pagination">
        <span>Всего: {data.pagination.total || 0}</span>
        <div><button disabled={data.pagination.page <= 1 || loading} onClick={() => load(data.pagination.page - 1)}>←</button><b>{data.pagination.page || 1} / {data.pagination.pages || 1}</b><button disabled={data.pagination.page >= data.pagination.pages || loading} onClick={() => load(data.pagination.page + 1)}>→</button></div>
      </div>
    </div>
  );
}
