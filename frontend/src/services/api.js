const API_URL = (import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "/api")).replace(/\/$/, "");

export default API_URL;
