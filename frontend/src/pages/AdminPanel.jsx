import { useState } from "react";

import Sidebar from "../components/admin/Sidebar";
import Header from "../components/admin/Header";
import DashboardCards from "../components/admin/DashboardCards";
import ToursTable from "../components/admin/ToursTable";
import UsersTable from "../components/admin/UsersTable";
import BookingsTable from "../components/admin/BookingsTable";
import OperationsCenter from "../components/admin/OperationsCenter";
import RefundsTable from "../components/admin/RefundsTable";
import NotificationsTable from "../components/admin/NotificationsTable";
import SystemCenter from "../components/admin/SystemCenter";
import IncidentsCenter from "../components/admin/IncidentsCenter";
import TourModal from "../components/admin/TourModal";

import "../styles/admin.css";

const titles = {
  operations: "Asedeliya Operations Center",
  bookings: "Бронирования",
  refunds: "Возвраты",
  notifications: "Email / outbox",
  tours: "Туры",
  users: "Пользователи",
  incidents: "Инциденты / Sprint 3A",
  system: "Система / Sprint 3A",
};

export default function AdminPanel({ initialTab = "operations" }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [showModal, setShowModal] = useState(false);
  const [editingTour, setEditingTour] = useState(null);

  function renderContent() {
    if (tab === "operations") return <OperationsCenter onSelectTab={setTab} />;
    if (tab === "bookings") return <BookingsTable search={search} />;
    if (tab === "refunds") return <RefundsTable search={search} />;
    if (tab === "notifications") return <NotificationsTable search={search} />;
    if (tab === "users") return <UsersTable search={search} />;
    if (tab === "incidents") return <IncidentsCenter />;
    if (tab === "system") return <SystemCenter />;
    return <ToursTable search={search} onEdit={(tour) => { setEditingTour(tour); setShowModal(true); }} />;
  }

  return (
    <div className="admin-layout">
      <Sidebar tab={tab} setTab={setTab} />
      <main className="admin-content">
        <Header title={titles[tab] || "Asedeliya CRM"} search={search} setSearch={setSearch} />
        <DashboardCards />

        <div className="action-bar ops-main-action-bar">
          <div className="ops-section-caption">Sprint 3A · product experience / reliability baseline 2N · real money OFF</div>
          {tab === "tours" && (
            <button className="btn btn-primary" type="button" onClick={() => { setEditingTour(null); setShowModal(true); }}>➕ Добавить тур</button>
          )}
        </div>

        {renderContent()}

        <TourModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          editingTour={editingTour}
          onSuccess={() => window.location.reload()}
        />
      </main>
    </div>
  );
}
