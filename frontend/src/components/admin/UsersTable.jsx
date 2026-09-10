import { useEffect, useState } from "react";
import {
  FiTrash2,
  FiUser,
  FiShield,
} from "react-icons/fi";

import authFetch from "../../services/authFetch";

export default function UsersTable({

  search = "",

}) {

  const [users, setUsers] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();


  async function loadUsers() {

  try {

    const data = await authFetch("/users");

    setUsers(data);

  } catch (err) {

    console.error(err);

  } finally {

    setLoading(false);

  }

}

  useEffect(() => {

    // Loading remote data is the intended side effect on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();

  }, []);

  async function deleteUser(id) {

  if (!window.confirm("Удалить пользователя?"))
    return;

  try {

    await authFetch(`/users/${id}`, {
      method: "DELETE",
    });

    setUsers(prev =>
      prev.filter(user => user.id !== id)
    );

  } catch (err) {

    alert(err.message);

  }

}

  const filteredUsers =
    users.filter((user) => {

      const value =
        search.toLowerCase();

      return (

        user.full_name
          .toLowerCase()
          .includes(value) ||

        user.email
          .toLowerCase()
          .includes(value)

      );

    });

  if (loading) {

    return (

      <div className="table-container">

        <div
          style={{
            padding: "60px",
            textAlign: "center",
          }}
        >
          Загрузка пользователей...
        </div>

      </div>

    );

  }

  return (

    <div className="table-container">

      <table className="admin-table">

        <thead>

          <tr>

            <th>Пользователь</th>

            <th>Email</th>

            <th>Телефон</th>

            <th>Роль</th>

            <th>Действия</th>

          </tr>

        </thead>

        <tbody>          {filteredUsers.length === 0 ? (

            <tr>

              <td
                colSpan={5}
                style={{
                  textAlign: "center",
                  padding: "60px",
                  color: "#64748b",
                }}
              >
                Пользователи не найдены
              </td>

            </tr>

          ) : (

            filteredUsers.map((user) => (

              <tr key={user.id}>

                <td>

                  <div className="hotel-cell">

                    <div
                      className="dashboard-icon"
                      style={{
                        width: 50,
                        height: 50,
                        fontSize: 20,
                      }}
                    >
                      <FiUser />
                    </div>

                    <div className="hotel-info">

                      <h4>
                        {user.full_name}
                      </h4>

                      <p>
                        ID: {user.id}
                      </p>

                    </div>

                  </div>

                </td>

                <td>

                  {user.email}

                </td>

                <td>

                  {user.phone || "-"}

                </td>

                <td>

                  <span
                    className={`admin-role-badge ${
                      user.role === "admin" ? "is-admin" : "is-user"
                    }`}
                  >
                    <FiShield />
                    {user.role === "admin" ? "Администратор" : "Пользователь"}
                  </span>

                </td>

                <td>

                  <div className="actions">

                    {Number(currentUser?.id) === Number(user.id) ? (
                      <span className="admin-current-user-pill">Текущий аккаунт</span>
                    ) : (
                      <button
                        className="icon-btn delete"
                        title="Удалить"
                        onClick={() => deleteUser(user.id)}
                      >
                        <FiTrash2 />
                      </button>
                    )}

                  </div>

                </td>

              </tr>

            ))

          )}

        </tbody>

      </table>      <div className="pagination">

        <div className="pagination-info">
          Всего пользователей: {filteredUsers.length}
        </div>

        <div className="pagination-buttons">

          <button disabled>
            {"<"}
          </button>

          <button
            style={{
              background: "#2563eb",
              color: "#fff",
            }}
          >
            1
          </button>

          <button disabled>
            {">"}
          </button>

        </div>

      </div>

    </div>

  );

}