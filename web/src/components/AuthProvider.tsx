"use client";

/**
 * Session courante, partagee par toute l'application.
 *
 * Le jeton vit dans `localStorage` (voir lib/api/client.ts) ; ce fournisseur
 * n'en est que la lecture reactive : il expose l'utilisateur, son role, et
 * de quoi se connecter/deconnecter. Le rafraichissement automatique du jeton
 * reste gere dans le client d'API.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, setTokens, setOnAuthFailure, startAuthTimer, stopAuthTimer } from "@/lib/api/client";
import { UsersApi } from "@/lib/api/endpoints";
import type { User } from "@/lib/api/types";

interface AuthState {
  user: User | null;
  /** `true` tant qu'on ne sait pas encore si une session existe. Evite le
   *  clignotement « non connecte » au premier rendu. */
  loading: boolean;
  role: string | null;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  role: null,
  refresh: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await UsersApi.me());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setTokens(null, null);
    stopAuthTimer();
    setUser(null);
    router.replace("/connexion");
  }, [router]);

  useEffect(() => {
    startAuthTimer();
    setOnAuthFailure(() => {
      setUser(null);
      router.replace("/connexion");
    });
    void refresh();
    return () => {
      setOnAuthFailure(null);
      stopAuthTimer();
    };
  }, [refresh, router]);

  const value = useMemo(
    () => ({ user, loading, role: user?.role ?? null, refresh, logout }),
    [user, loading, refresh, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
