import { Navigate, useLocation } from "react-router-dom";
import { Fragment } from "react";
import useSession from "../hooks/useSession";
import { authOrigin } from "../utils/authPresentation";
import { SessionStatus } from './SessionBoundary';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { token, user, status } = useSession();
  const location = useLocation();

  if (!['guest', 'authenticated'].includes(status)) return <SessionStatus status={status} />;

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ returnTo: authOrigin(location.pathname) }} />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Fragment key={user.id}>{children}</Fragment>;
}
