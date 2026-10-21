import { Redirect, Stack } from "expo-router";
import React from "react";
import { useAuth } from "../../src/state/AuthContext";

export default function AdminLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin") return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
