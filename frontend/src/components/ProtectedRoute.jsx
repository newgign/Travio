import { Navigate } from "react-router-dom";
import { Fragment } from "react";
import useSession from "../hooks/useSession";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { token, user } = useSession();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Fragment key={user.id}>{children}</Fragment>;
}
