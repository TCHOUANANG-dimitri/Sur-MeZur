import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthApi, UsersApi } from "../api/endpoints";
import { getToken, setAuthFailureHandler, setTokens } from "../api/client";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  register: (body: {
    role: "client" | "tailor";
    phone: string;
    full_name: string;
    password: string;
    language: "fr" | "en";
    photo_consent: boolean;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await UsersApi.me();
      setUser(me);
    } catch {
      await setTokens(null, null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When even the refresh token is spent, the API layer signals here so the
  // whole app drops to the logged-out state instead of each screen throwing.
  useEffect(() => {
    setAuthFailureHandler(() => setUser(null));
    return () => setAuthFailureHandler(null);
  }, []);

  const login = async (phone: string, password: string) => {
    const tok = await AuthApi.login(phone, password);
    await setTokens(tok.access_token, tok.refresh_token);
    const me = await UsersApi.me();
    setUser(me);
    return me;
  };

  const register: AuthContextValue["register"] = async (body) => {
    const tok = await AuthApi.register(body);
    await setTokens(tok.access_token, tok.refresh_token);
    const me = await UsersApi.me();
    setUser(me);
    return me;
  };

  const logout = async () => {
    await setTokens(null, null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
