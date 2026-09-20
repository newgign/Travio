import { Routes, Route } from "react-router-dom";

import "./App.css";

import Help from "./pages/Help";
import Contacts from './pages/Contacts';
import NotFound from './pages/NotFound';
import ScrollToSection from "./components/ScrollToSection";
import Home from "./pages/Home";
import Results from "./pages/Results";
import Favorites from "./pages/Favorites";
import TourDetails from "./pages/TourDetails";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Checkout from "./pages/Checkout";
import MyBookings from "./pages/MyBookings";
import BookingDetails from "./pages/BookingDetails";
import Profile from "./pages/Profile";
import Voucher from "./pages/Voucher";
import AdminPanel from "./pages/AdminPanel";
import ProtectedRoute from "./components/ProtectedRoute";
import ConsumerShell from './components/ConsumerShell';
import './styles/Consumer.css';

function App() {
  return (
    <ConsumerShell>
    <ScrollToSection />
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
    </ConsumerShell>
  );
}

export default App;
