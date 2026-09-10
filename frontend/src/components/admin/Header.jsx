import {
  FiBell,
  FiSearch,
  FiLogOut,
  FiSettings,
} from "react-icons/fi";

import "./../../styles/admin.css";

export default function Header({
  title = "Dashboard",
  search = "",
  setSearch = () => {},
}) {
  const user = JSON.parse(localStorage.getItem("user"));

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
  }

  return (
    <header className="admin-header">

      <div>

        <h1 className="admin-title">
          {title}
        </h1>

        <p className="section-subtitle">
          Добро пожаловать в систему управления Asedeliya
        </p>

      </div>

      <div className="header-right">

        <div className="header-search">

          <FiSearch />

          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

        </div>

        <button className="icon-btn view">
          <FiBell />
        </button>

        <button className="icon-btn edit">
          <FiSettings />
        </button>

        <div className="admin-profile">

          <img
            src="https://i.pravatar.cc/150?img=12"
            alt=""
          />

          <div>

            <strong>
              {user?.full_name || "Администратор"}
            </strong>

            <p>
              {user?.email || ""}
            </p>

          </div>

        </div>

        <button
          className="icon-btn delete"
          onClick={logout}
        >
          <FiLogOut />
        </button>

      </div>

    </header>
  );
}