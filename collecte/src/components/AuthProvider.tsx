"use client";

/**
 * Session courante. Seuls deux roles entrent dans cette application : l'agent
 * de terrain (`collector`) et l'administrateur. Un compte client ou tailleur
 * qui s'y connecterait est deconnecte avec une explication, plutot que de
 * tomber sur des 403 a chaque ecran.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getToken, setOnAuthFailure, setTokens, startAuthTimer, stopAuthTimer } from "@/lib/api/client";
import { AuthApi, type User } from "@/lib/api/collecte";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<User | null>;
  logout: () => void;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
  refresh: async () => null,
  logout: () => {},
});

export const ALLOWED_ROLES = ["collector", "admin"];

const USER_KEY = "smz_collecte_user";

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* navigation privee : sans cache, seule la saisie hors ligne est perdue */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await AuthApi.me();
      setUser(me);
      writeCachedUser(me);
      return me;
    } catch (e) {
      // Hors reseau, on ne deconnecte pas : la saisie sur le terrain doit
      // rester possible. On reprend le dernier profil connu ; le jeton est
      // garde, et le premier envoi dira s'il est encore valable (un 401
      // declenche alors la deconnexion via setOnAuthFailure).
      const offline = e instanceof TypeError || (e instanceof ApiError && (e.status >= 500 || e.status === 429));
      const cached = offline ? readCachedUser() : null;
      setUser(cached);
      return cached;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setTokens(null, null);
    stopAuthTimer();
    setUser(null);
    writeCachedUser(null);
    router.replace("/connexion");
  }, [router]);

  useEffect(() => {
    startAuthTimer();
    setOnAuthFailure(() => {
      setUser(null);
      writeCachedUser(null);
      router.replace("/connexion");
    });
    void refresh();
    return () => {
      setOnAuthFailure(null);
      stopAuthTimer();
    };
  }, [refresh, router]);

  const value = useMemo(
    () => ({ user, loading, isAdmin: user?.role === "admin", refresh, logout }),
    [user, loading, refresh, logout]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
