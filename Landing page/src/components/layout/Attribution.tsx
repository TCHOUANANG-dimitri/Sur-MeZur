"use client";

import { useEffect } from "react";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "code"] as const;
const STORE = "smz_attribution";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

type Stored = { at: number; params: Record<string, string> };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return Date.now() - parsed.at < MAX_AGE_MS ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Transmet l'origine de la visite jusqu'à l'application.
 *
 * Le site et l'application sont sur deux domaines : sans ce relais, une
 * personne arrivée par une publicité Facebook ou un code de parrainage
 * s'inscrirait « sans origine ». À la première visite, les paramètres de
 * campagne de l'adresse sont gardés 30 jours dans le navigateur ; chaque lien
 * vers l'application les reçoit, plus le nom du bouton cliqué
 * (utm_content), sauf si la campagne en fixe déjà un.
 */
export function Attribution() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const incoming: Record<string, string> = {};
    for (const key of KEYS) {
      const value = url.searchParams.get(key);
      if (value) incoming[key] = value.slice(0, 120);
    }

    let stored = read();
    if (Object.keys(incoming).length > 0) {
      stored = { at: Date.now(), params: incoming };
      try {
        localStorage.setItem(STORE, JSON.stringify(stored));
      } catch {
        /* stockage indisponible : on transmet quand même pour cette visite */
      }
    }
    const params = stored?.params ?? {};

    document.querySelectorAll<HTMLAnchorElement>("a[data-app-link]").forEach((link) => {
      try {
        const target = new URL(link.href);
        const merged: Record<string, string> = {
          utm_source: "site",
          utm_medium: "landing",
          ...params,
        };
        if (!params.utm_content) merged.utm_content = link.dataset.appLink || "cta";
        for (const [key, value] of Object.entries(merged)) target.searchParams.set(key, value);
        link.href = target.toString();
      } catch {
        /* lien invalide : laissé tel quel */
      }
    });
  }, []);

  return null;
}
