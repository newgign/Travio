import { useEffect, useState } from "react";
import authFetch from "../../services/authFetch";

export default function TourModal({
  isOpen,
  onClose,
  onSuccess,
  editingTour,
}) {

  const [form, setForm] = useState({
    hotel: "",
    country: "",
    city: "",
    image: "",
    price: "",
    rating: "",
    duration: "",
    food: "",
    description: "",
  });

  useEffect(() => {

    if (editingTour) {

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        hotel: editingTour.hotel || "",
        country: editingTour.country || "",
        city: editingTour.city || "",
        image: editingTour.image || "",
        price: editingTour.price || "",
        rating: editingTour.rating || "",
        duration: editingTour.duration || "",
        food: editingTour.food || "",
        description: editingTour.description || "",
      });

    } else {

            setForm({
        hotel: "",
        country: "",
        city: "",
        image: "",
        price: "",
        rating: "",
        duration: "",
        food: "",
        description: "",
      });

    }

  }, [editingTour]);

  if (!isOpen) return null;

  async function saveTour() {

    try {

      const method = editingTour
        ? "PUT"
        : "POST";

      const url = editingTour
        ? `/tours/${editingTour.id}`
        : "/tours";

      await authFetch(url, {
        method,
        body: JSON.stringify(form),
      });

      onSuccess();

      onClose();

    } catch (err) {

      alert(err.message);

    }

  }
    return (

    <div className="modal">

      <div className="modal-content">

        <div className="modal-header">

          <h2>
            {editingTour
              ? "✏️ Редактировать тур"
              : "➕ Добавить тур"}
          </h2>

          <button
            className="close-btn"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="form-grid">

          <div className="form-group">

            <label>Отель</label>

            <input
              value={form.hotel}
              onChange={(e)=>
                setForm({
                  ...form,
                  hotel:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group">

            <label>Страна</label>

            <input
              value={form.country}
              onChange={(e)=>
                setForm({
                  ...form,
                  country:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group">

            <label>Город</label>

            <input
              value={form.city}
              onChange={(e)=>
                setForm({
                  ...form,
                  city:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group">

            <label>Цена</label>

            <input
              type="number"
              value={form.price}
              onChange={(e)=>
                setForm({
                  ...form,
                  price:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group">

            <label>Рейтинг</label>

            <input
              type="number"
              step="0.1"
              value={form.rating}
              onChange={(e)=>
                setForm({
                  ...form,
                  rating:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group">

            <label>Ночей</label>

            <input
              type="number"
              value={form.duration}
              onChange={(e)=>
                setForm({
                  ...form,
                  duration:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group full">

            <label>Фото (URL)</label>

            <input
              value={form.image}
              onChange={(e)=>
                setForm({
                  ...form,
                  image:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group full">

            <label>Питание</label>

            <input
              value={form.food}
              onChange={(e)=>
                setForm({
                  ...form,
                  food:e.target.value,
                })
              }
            />

          </div>

          <div className="form-group full">

            <label>Описание</label>

            <textarea
              value={form.description}
              onChange={(e)=>
                setForm({
                  ...form,
                  description:e.target.value,
                })
              }
            />

          </div>

        </div>
                <div className="modal-footer">

          <button
            className="btn btn-secondary"
            onClick={onClose}
          >
            Отмена
          </button>

          <button
            className="btn btn-primary"
            onClick={saveTour}
          >
            {editingTour
              ? "💾 Сохранить"
              : "➕ Добавить"}
          </button>

        </div>

      </div>

    </div>

  );

}