"use client";

/**
 * Enregistrement du service worker (B4), en production seulement : en
 * developpement, le cache masquerait les dernieres modifications.
 */

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* hors ligne a la premiere visite : le navigateur reessaiera */
    });
  }, []);
  return null;
}
