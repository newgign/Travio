export default function Sidebar({ tab, setTab }) {
  const menu = [
    { key: "operations", title: "Операционный центр", icon: "🛡️" },
    { key: "bookings", title: "Бронирования", icon: "📅" },
    { key: "refunds", title: "Возвраты", icon: "↩️" },
    { key: "notifications", title: "Email / outbox", icon: "✉️" },
    { key: "tours", title: "Туры", icon: "🌍" },
    { key: "users", title: "Пользователи", icon: "👥" },
    { key: "incidents", title: "Инциденты", icon: "🚨" },
    { key: "system", title: "Система / 3A", icon: "⚙️" },
  ];

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-logo"><h2>✈ Asedeliya</h2><span>Admin CRM · Sprint 3A</span></div>
        <nav>
          {menu.map((item) => (
            <button key={item.key} type="button" onClick={() => setTab(item.key)} className={tab === item.key ? "sidebar-link active" : "sidebar-link"}>
              <span className="sidebar-icon">{item.icon}</span><span>{item.title}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer"><div className="admin-profile"><div className="admin-avatar-fallback">A</div><div><strong>Администратор</strong><p>Asedeliya Operations</p></div></div></div>
    </aside>
  );
}
