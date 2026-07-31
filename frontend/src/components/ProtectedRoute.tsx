import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { Spinner } from "./Misc";

export function ProtectedRoute({ role }: { role: "client" | "tailor" | "admin" }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-shell" style={{ justifyContent: "center", display: "flex" }}>
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    const dest = user.role === "client" ? "/client/home" : user.role === "tailor" ? "/tailor/dashboard" : "/admin/verifications";
    return <Navigate to={dest} replace />;
  }
  return <Outlet />;
}
