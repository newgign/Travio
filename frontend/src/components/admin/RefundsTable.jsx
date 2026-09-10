import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminRefunds } from "../../services/adminService";
import { formatMoney } from "../../utils/money";

function dateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

export default function RefundsTable({ search = "" }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [data, setData] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);

  async function load(page = 1) {
    try {
      setLoading(true);
      const result = await getAdminRefunds({ q: search, status, page, limit: 25 });
      setData(result);
    } catch (err) {
      alert(err.message || "Не удалось загрузить возвраты");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
  }, [search, status]);

  return (
    <div className="ops-table-shell">
      <div className="ops-toolbar">
        <div>
          <h3>↩️ Возвраты</h3>
          <p>Sandbox refund lifecycle и история запросов. Реальные возвраты не включены.</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Все статусы</option>
          <option value="requested">requested</option>
          <option value="refunded">refunded</option>
          <option value="draft">draft</option>
        </select>
      </div>

      <div className="ops-table-scroll">
        <table className="admin-table ops-table">
          <thead>
            <tr>
              <th>Refund</th>
              <th>Бронь / отель</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Провайдер</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="ops-empty-cell">Загрузка...</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={7} className="ops-empty-cell">Возвратов не найдено</td></tr>
            ) : data.items.map((item) => (
              <tr key={item.id}>
                <td><strong>#{item.id}</strong><small className="ops-cell-sub">{item.idempotency_key || "—"}</small></td>
                <td><strong>TRAVIO-{item.booking_id}</strong><small className="ops-cell-sub">{item.hotel}</small></td>
                <td>{formatMoney(item.amount, item.currency || item.booking_currency || "KZT")}</td>
                <td><span className={`ops-status ${item.status}`}>{item.status}</span></td>
                <td>{item.provider}</td>
                <td>{dateTime(item.processed_at || item.requested_at || item.created_at)}</td>
                <td><button className="ops-small-btn" type="button" onClick={() => navigate(`/my-bookings/${item.booking_id}`)}>Открыть заказ</button></td>
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
