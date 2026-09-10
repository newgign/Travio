const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

export async function getTours(filters = {}) {

  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      params.append(key, value);
    }

  });

  const response = await fetch(
    `${API_URL}/tours?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Ошибка загрузки туров");
  }

  return response.json();
}

export async function getTourById(id) {

  const response = await fetch(
    `${API_URL}/tours/${id}`
  );

  if (!response.ok) {

    if (response.status === 404) {
      throw new Error("Тур не найден");
    }

    throw new Error("Ошибка загрузки тура");
  }

  return response.json();
}

export async function searchTours(filters = {}) {
  if (import.meta.env.PROD) filters = { ...filters, publicOnly: "true" };

  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      params.append(key, value);
    }

  });

  const response = await fetch(
    `${API_URL}/search?${params.toString()}`
  );

  if (!response.ok) {

    let message = "Ошибка поиска туров";

    try {

      const errorData = await response.json();

      if (errorData?.message) {
        message = errorData.message;
      }

    } catch {
      // Если backend вернул не JSON,
      // оставляем стандартное сообщение.
    }

    throw new Error(message);
  }

  const result = await response.json();

  return {
    data: Array.isArray(result?.data)
      ? result.data
      : [],

    meta: {
      page: Number(result?.meta?.page) || 1,
      limit: Number(result?.meta?.limit) || 20,
      total: Number(result?.meta?.total) || 0,
      pages: Number(result?.meta?.pages) || 1,
      provider: result?.meta?.provider || null,
      executionTime:
        Number(result?.meta?.executionTime) || 0,
    },
  };
}

export async function createTour(tourData) {

  const response = await fetch(
    `${API_URL}/tours`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(tourData),
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка создания тура");
  }

  return response.json();
}

export async function updateTour(id, tourData) {

  const response = await fetch(
    `${API_URL}/tours/${id}`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(tourData),
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка обновления тура");
  }

  return response.json();
}

export async function deleteTour(id) {

  const response = await fetch(
    `${API_URL}/tours/${id}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error("Ошибка удаления тура");
  }

  return response.json();
}