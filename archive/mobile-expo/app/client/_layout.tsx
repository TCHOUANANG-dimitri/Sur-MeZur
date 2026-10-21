import { Redirect, Stack } from "expo-router";
import React from "react";
import { useAuth } from "../../src/state/AuthContext";

export default function ClientLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "client") return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
