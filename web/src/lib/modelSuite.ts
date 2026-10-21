/**
 * Suite de modeles parcourue par balayage sur la fiche modele.
 *
 * Toucher une carte retient l'ordre de la liste d'ou l'on vient (catalogue
 * filtre, section de l'accueil, modeles enregistres) : balayer la fiche vers
 * la gauche ou la droite passe au modele suivant ou precedent de CETTE liste,
 * comme dans une galerie. Arrive par un lien direct, la fiche reconstitue une
 * suite avec les modeles de la meme categorie.
 *
 * La suite vit dans `sessionStorage` : propre a l'onglet, oubliee a sa
 * fermeture, sans rien a nettoyer.
 *
 * Les modeles voisins sont gardes en memoire (`cache`) : la fiche suivante
 * s'affiche sans attendre le reseau.
 */

import type { GarmentModel } from "@/lib/api/types";

const KEY = "smz_suite_modeles";

export function rememberSuite(ids: string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : la fiche reconstituera une suite */
  }
}

export function readSuite(): string[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Modeles deja charges, par identifiant (le temps de la session). */
export const modelCache = new Map<string, GarmentModel>();

export function cacheModels(models: GarmentModel[]): void {
  models.forEach((m) => modelCache.set(m.id, m));
}

/** Sens du dernier balayage : la fiche suivante entre du bon cote. */
let lastDirection: "next" | "prev" | null = null;

export function setDirection(d: "next" | "prev" | null): void {
  lastDirection = d;
}

export function takeDirection(): "next" | "prev" | null {
  const d = lastDirection;
  lastDirection = null;
  return d;
}
