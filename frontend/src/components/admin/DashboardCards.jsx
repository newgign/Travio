import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCalendar, FiMail, FiRotateCcw } from "react-icons/fi";
import { getAdminOverview } from "../../services/adminService";

export default function DashboardCards() {
  const [stats, setStats] = useState({ bookings: {}, refunds: {}, notifications: {} });

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getAdminOverview();
        setStats(data);
      } catch (err) {
        console.error(err);
      }
    }
    loadStats();
  }, []);

  const cards = [
    { title: "Всего броней", value: stats.bookings?.total || 0, icon: <FiCalendar />, color: "blue", progress: 100 },
    { title: "Требуют внимания", value: stats.bookings?.attention || 0, icon: <FiAlertTriangle />, color: "orange", progress: stats.bookings?.attention ? 70 : 15 },
    { title: "Refund requested", value: stats.refunds?.requested || 0, icon: <FiRotateCcw />, color: "red", progress: stats.refunds?.requested ? 65 : 10 },
    { title: "Email queued/failed", value: (stats.notifications?.queued || 0) + (stats.notifications?.failed || 0), icon: <FiMail />, color: "green", progress: (stats.notifications?.queued || stats.notifications?.failed) ? 60 : 10 },
  ];

  return (
    <div className="dashboard-grid">
      {cards.map((card) => (
        <div key={card.title} className={`dashboard-card ${card.color}`}>
          <div className="dashboard-top"><div className="dashboard-icon">{card.icon}</div></div>
          <div className="dashboard-number">{card.value}</div>
          <div className="dashboard-text">{card.title}</div>
          <div className="progress"><div style={{ width: `${card.progress}%` }} /></div>
          <div className="mini-stat"><span>Операционный показатель</span><strong>3A</strong></div>
        </div>
      ))}
    </div>
  );
}
