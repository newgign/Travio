import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { FavoritesProvider } from "./context/FavoritesContext";
import SessionBoundary from './components/SessionBoundary';

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SessionBoundary>
    <FavoritesProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FavoritesProvider>
    </SessionBoundary>
  </StrictMode>
);
