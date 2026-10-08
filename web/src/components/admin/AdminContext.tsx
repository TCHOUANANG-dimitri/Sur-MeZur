"use client";

/**
 * Contexte de l'administration : profil et droits de l'administrateur
 * connecte (13.1), compteurs du menu (0.2) rafraichis chaque minute, et
 * deconnexion apres inactivite (13.5).
 *
 * Les droits ne servent ici qu'a masquer ce qui n'est pas accessible : le
 * serveur verifie chaque permission de son cote (exigence Q5).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Core, Growth, type AdminMe, type PublicFeatures } from "@/lib/api/admin";
import { getRefreshToken } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";

interface AdminState {
  me: AdminMe | null;
  counters: Record<string, number>;
  features: PublicFeatures;
  can: (perm: string) => boolean;
  refreshCounters: () => void;
  reloadMe: () => Promise<void>;
  logout: () => void;
}

const DEFAULT_FEATURES: PublicFeatures = {
  tailor_verification: false,
  payments: false,
  negotiation: false,
  pattern_generation: "preview",
};

const Ctx = createContext<AdminState>({
  me: null,
  counters: {},
  features: DEFAULT_FEATURES,
  can: () => false,
  refreshCounters: () => {},
  reloadMe: async () => {},
  logout: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { logout: baseLogout } = useAuth();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [features, setFeatures] = useState<PublicFeatures>(DEFAULT_FEATURES);
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
    // Fonctionnalites activees : masquent « Vérifications » et « Paiements »
    // quand elles sont coupees (A2). Comme les compteurs, sans bloquer.
    Growth.features()
      .then((cfg) => {
        if (cfg.features) setFeatures({ ...DEFAULT_FEATURES, ...cfg.features });
      })
      .catch(() => {});
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

  const can = useCallback((perm: string) => Boolean(me?.permissions.includes(perm)), [me]);

  const value = useMemo(
    () => ({ me, counters, features, can, refreshCounters, reloadMe, logout }),
    [me, counters, features, can, refreshCounters, reloadMe, logout]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  return useContext(Ctx);
}
