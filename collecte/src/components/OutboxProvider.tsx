"use client";

/**
 * Etat de la file d'envoi, partage par toute l'application : nombre de
 * fiches en attente, envoi en cours, dernier incident.
 *
 * Declencheurs d'envoi : l'ouverture de l'application, le retour du reseau
 * (evenement `online`), une minuterie tant qu'il reste des fiches, et le
 * bouton « Envoyer maintenant ».
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listOutbox, syncOutbox, type OutboxItem } from "@/lib/outbox";
import { useAuth } from "./AuthProvider";

interface OutboxState {
  items: OutboxItem[];
  syncing: boolean;
  offline: boolean;
  /** Incremente a chaque envoi reussi : les listes s'y abonnent pour se
   *  recharger sans attendre. */
  version: number;
  reload: () => Promise<void>;
  sync: (force?: boolean) => Promise<void>;
}

const Ctx = createContext<OutboxState>({
  items: [],
  syncing: false,
  offline: false,
  version: 0,
  reload: async () => {},
  sync: async () => {},
});

const RETRY_EVERY_MS = 60_000;

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [version, setVersion] = useState(0);
  const userId = user?.id;
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listOutbox(userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  const sync = useCallback(
    async (force = false) => {
      if (!userId || busy.current) return;
      busy.current = true;
      setSyncing(true);
      try {
        const r = await syncOutbox(userId, force);
        setOffline(r.offline);
        if (r.sent > 0) setVersion((v) => v + 1);
      } catch {
        setOffline(true);
      } finally {
        busy.current = false;
        setSyncing(false);
        await reload();
      }
    },
    [userId, reload]
  );

  useEffect(() => {
    void reload().then(() => sync());
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload, sync]);

  const pending = items.filter((i) => !i.blocked).length;
  useEffect(() => {
    if (pending === 0) return;
    const timer = setInterval(() => void sync(), RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [pending, sync]);

  const value = useMemo(
    () => ({ items, syncing, offline, version, reload, sync }),
    [items, syncing, offline, version, reload, sync]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox() {
  return useContext(Ctx);
}
