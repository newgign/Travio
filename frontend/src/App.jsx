import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

import "./App.css";
// Existing global cascade stays eager; legacy CSS is not route-isolated.
import "./styles/Navbar.css";
import "./components/Footer.css";
import "./components/FaqSection.css";
import "./styles/Help.css";
import "./components/HomeSearch.css";
import "./styles/HeroBanner.css";
import "./styles/Advantages.css";
import "./styles/Home.css";
import "./styles/HomeCollections.css";
import "./components/TourCard.css";
import "./components/ResultsFilters.css";
import "./styles/Results.css";
import "./styles/AccountPages.css";
import "./styles/Favorites.css";
import "./styles/TourDetails.css";
import "./styles/Auth.css";
import "./styles/Checkout.css";
import "./styles/MyBookings.css";
import "./styles/BookingDetails.css";
import "./styles/Profile.css";
import "./styles/Voucher.css";
import "./styles/admin.css";
import "./styles/ReconciliationCenter.css";
import "./styles/Consumer.css";

import NotFound from './pages/NotFound';
import ScrollToSection from "./components/ScrollToSection";
import Home from "./pages/Home";

import ProtectedRoute from "./components/ProtectedRoute";
import ConsumerShell from './components/ConsumerShell';

import RouteBoundary from "./components/RouteBoundary";

const Help = lazy(() => import("./pages/Help"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Results = lazy(() => import("./pages/Results"));
const Favorites = lazy(() => import("./pages/Favorites"));
const TourDetails = lazy(() => import("./pages/TourDetails"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const BookingDetails = lazy(() => import("./pages/BookingDetails"));
const Profile = lazy(() => import("./pages/Profile"));
const Voucher = lazy(() => import("./pages/Voucher"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

function App() {
  return (
    <ConsumerShell>
    <ScrollToSection />
    <RouteBoundary>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/help/:topic" element={<Help />} />
      <Route path="/help" element={<Help />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/results" element={<Results />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/tour/:provider/:id" element={<TourDetails />} />
      <Route path="/tour/:id" element={<TourDetails />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
      <Route path="/bookings/:bookingId" element={<ProtectedRoute><BookingDetails /></ProtectedRoute>} />

      <Route
        path="/checkout/:provider/:tourId"
        element={
          <ProtectedRoute>
            <Checkout />
          </ProtectedRoute>
        }
      />

      <Route
        path="/checkout/:tourId"
        element={
          <ProtectedRoute>
            <Checkout />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      <Route
        path="/voucher/:bookingId"
        element={
          <ProtectedRoute>
            <Voucher />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-bookings"
        element={
          <ProtectedRoute>
            <MyBookings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-bookings/:bookingId"
        element={
          <ProtectedRoute>
            <BookingDetails />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminPanel />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/bookings"
        element={
          <ProtectedRoute adminOnly>
            <AdminPanel initialTab="bookings" />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </RouteBoundary>
    </ConsumerShell>
  );
}

export default App;
