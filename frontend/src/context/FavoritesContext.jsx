/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import authFetch from "../services/authFetch";

const FavoritesContext = createContext(null);

function favoriteKey(id, provider = "mock") {
  return `${provider}:${String(id)}`;
}

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  const loadFavorites = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setFavorites([]);
      return;
    }

    try {
      setLoadingFavorites(true);

      const result = await authFetch("/favorites");

      setFavorites(
        Array.isArray(result?.data)
          ? result.data
          : []
      );
    } catch (error) {
      console.error("LOAD FAVORITES ERROR:", error);
      setFavorites([]);
    } finally {
      setLoadingFavorites(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      loadFavorites();
    }, 0);

    function handleAuthChanged() {
      loadFavorites();
    }

    window.addEventListener("travio-auth-changed", handleAuthChanged);

    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("travio-auth-changed", handleAuthChanged);
    };
  }, [loadFavorites]);

  function isFavorite(id, provider = "mock") {
    const key = favoriteKey(id, provider);

    return favorites.some(
      (tour) =>
        favoriteKey(
          tour.providerHotelId ?? tour.id,
          tour.provider || "mock"
        ) === key
    );
  }

  async function toggleFavorite(tour) {
    const token = localStorage.getItem("token");

    if (!token) {
      throw new Error("AUTH_REQUIRED");
    }

    const provider = tour.provider || "mock";
    const hotelId = tour.providerHotelId ?? tour.id;

    if (isFavorite(hotelId, provider)) {
      await authFetch(
        `/favorites/${encodeURIComponent(provider)}/${encodeURIComponent(hotelId)}`,
        { method: "DELETE" }
      );

      setFavorites((prev) =>
        prev.filter(
          (item) =>
            favoriteKey(
              item.providerHotelId ?? item.id,
              item.provider || "mock"
            ) !== favoriteKey(hotelId, provider)
        )
      );

      return false;
    }

    const result = await authFetch("/favorites", {
      method: "POST",
      body: JSON.stringify({
        provider,
        hotelId,
        filters: { checkIn: tour.checkIn, checkOut: tour.checkOut, departureDate: tour.departureDate, nights: tour.nights, people: tour.adults, children: tour.children, childrenAges: tour.childrenAges, food: tour.boardCode, roomType: tour.roomCode },
      }),
    });

    setFavorites((prev) => {
      const withoutDuplicate = prev.filter(
        (item) =>
          favoriteKey(
            item.providerHotelId ?? item.id,
            item.provider || "mock"
          ) !== favoriteKey(hotelId, provider)
      );

      return [result.data, ...withoutDuplicate];
    });

    return true;
  }

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        loadingFavorites,
        loadFavorites,
        toggleFavorite,
        isFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);

  if (!context) {
    throw new Error("useFavorites must be used inside FavoritesProvider");
  }

  return context;
}
