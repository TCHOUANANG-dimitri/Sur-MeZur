"use client";

import { useEffect } from "react";

/** Enregistre public/sw.js (ouverture hors reseau). Sans effet en
 *  developpement, ou le cache masquerait les modifications. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
