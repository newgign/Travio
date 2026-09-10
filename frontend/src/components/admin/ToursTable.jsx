import { useEffect, useState } from "react";
import {
  FiEye,
  FiEdit,
  FiTrash2,
} from "react-icons/fi";

import authFetch from "../../services/authFetch";

export default function ToursTable({
  search = "",
  onEdit = () => {},
}) {

  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);


  async function loadTours() {

    try {

      const data = await authFetch("/tours");

      setTours(data);

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {
    // Loading remote data is the intended side effect on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTours();
  }, []);

  async function deleteTour(id) {

    const ok = window.confirm(
      "Удалить тур?"
    );

    if (!ok) return;

    try {

      await authFetch(
        `/tours/${id}`,
        {
          method: "DELETE",
        }
      );

      setTours((prev) =>
        prev.filter(
          (tour) => tour.id !== id
        )
      );

    } catch (err) {

      alert(err.message);

    }

  }

  const filteredTours =
    tours.filter((tour) => {

      const value =
        search.toLowerCase();

      return (

        tour.hotel
          .toLowerCase()
          .includes(value)

        ||

        tour.country
          .toLowerCase()
          .includes(value)

        ||

        tour.city
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
            fontSize: "18px",
          }}
        >
          Загрузка туров...
        </div>

      </div>

    );

  }

  return (

    <div className="table-container">

      <table className="admin-table">

        <thead>

          <tr>

            <th>Фото</th>

            <th>Отель</th>

            <th>Страна</th>

            <th>Город</th>

            <th>Цена</th>

            <th>Рейтинг</th>

            <th>Действия</th>

          </tr>

        </thead>

        <tbody>          {filteredTours.length === 0 ? (

            <tr>

              <td
                colSpan={7}
                style={{
                  textAlign: "center",
                  padding: "60px",
                  color: "#64748b",
                }}
              >
                Туры не найдены
              </td>

            </tr>

          ) : (

            filteredTours.map((tour) => (

              <tr key={tour.id}>

                <td>

                  <div className="hotel-cell">

                    <img
                      src={tour.image}
                      alt={tour.hotel}
                      className="hotel-image"
                    />

                  </div>

                </td>

                <td>

                  <div className="hotel-info">

                    <h4>{tour.hotel}</h4>

                    <p>
                      {tour.duration} ночей
                    </p>

                  </div>

                </td>

                <td>
                  {tour.country}
                </td>

                <td>
                  {tour.city}
                </td>

                <td>

                  <div className="price">

                    {Number(
                      tour.price
                    ).toLocaleString()} ₸

                  </div>

                </td>

                <td>

                  <span className="rating">

                    ⭐ {tour.rating || 5}

                  </span>

                </td>

                <td>

                  <div className="actions">

                    <button
                      className="icon-btn view"
                      title="Просмотр"
                      onClick={() =>
                        alert(
`${tour.hotel}

${tour.description || "Описание отсутствует"}`
                        )
                      }
                    >
                      <FiEye />
                    </button>

                    <button
                      className="icon-btn edit"
                      title="Редактировать"
                      onClick={() =>
                        onEdit(tour)
                      }
                    >
                      <FiEdit />
                    </button>

                    <button
                      className="icon-btn delete"
                      title="Удалить"
                      onClick={() =>
                        deleteTour(tour.id)
                      }
                    >
                      <FiTrash2 />
                    </button>

                  </div>

                </td>

              </tr>

            ))

          )}

        </tbody>

      </table>      <div className="pagination">

        <div className="pagination-info">
          Всего туров: {filteredTours.length}
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