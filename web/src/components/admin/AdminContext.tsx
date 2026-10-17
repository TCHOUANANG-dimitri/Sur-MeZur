"use client";

/**
 * Contexte de l'administration : profil de l'administrateur connecte,
 * compteurs du menu (0.2) rafraichis chaque minute, et deconnexion apres
 * inactivite (13.5).
 *
 * Pas de droits a gerer ici : chaque administrateur a acces a tout
 * (backend/app/services/admin_perms.py), le serveur reste seul juge.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Core, type AdminMe } from "@/lib/api/admin";
import { getRefreshToken } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";

interface AdminState {
  me: AdminMe | null;
  counters: Record<string, number>;
  refreshCounters: () => void;
  reloadMe: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AdminState>({
  me: null,
  counters: {},
  refreshCounters: () => {},
  reloadMe: async () => {},
  logout: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { logout: baseLogout } = useAuth();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const lastActivity = useRef(Date.now());

  const reloadMe = useCallback(async () => {
    try {
      setMe(await Core.me());
    } catch {
      /* la garde de route renvoie vers la connexion si la session est perdue */
    }
  }, []);

  const refreshCounters = useCallback(() => {
    Core.counters()
      .then(setCounters)
      .catch(() => {});
  }, []);

  const logout = useCallback(() => {
    const refresh = getRefreshToken();
    // Ferme la session cote serveur (13.5) avant d'oublier les jetons.
    if (refresh) Core.logout(refresh).catch(() => {});
    baseLogout();
  }, [baseLogout]);

  useEffect(() => {
    void reloadMe();
    refreshCounters();
    const timer = setInterval(refreshCounters, 60_000);
    return () => clearInterval(timer);
  }, [reloadMe, refreshCounters]);

  // Deconnexion automatique apres inactivite, en miroir du serveur : la
  // session serveur expire de toute facon, mais on evite de laisser l'ecran
  // affiche sur un poste partage.
  useEffect(() => {
    if (!me?.idle_minutes) return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > me.idle_minutes * 60_000) logout();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [me?.idle_minutes, logout]);

  const value = useMemo(
    () => ({ me, counters, refreshCounters, reloadMe, logout }),
    [me, counters, refreshCounters, reloadMe, logout]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  return useContext(Ctx);
}
