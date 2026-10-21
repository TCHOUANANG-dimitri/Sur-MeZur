"use client";

/**
 * Carte de modele, reprise de l'accueil mobile : vignette, puis le nom et la
 * categorie sous l'image (et non par-dessus).
 *
 * Coeur en bas a droite de la vignette : enregistrer le modele sans ouvrir sa
 * fiche. Les modeles enregistres se retrouvent sur l'accueil (« Mes modeles
 * enregistres »), dans le catalogue (filtre « Enregistrés ») et dans le
 * profil.
 *
 * Aucun prix n'est affiche : les modeles sont confectionnes sur mesure et le
 * tarif se negocie avec le tailleur. Montrer un prix de catalogue laisserait
 * croire a un tarif ferme.
 */

import Link from "next/link";
import { useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { GarmentModel } from "@/lib/api/types";
import { IconCheck, IconHeart } from "./icons";

export function ModelCard({
  model,
  selected,
  href,
  saveable = true,
  onSavedChange,
}: {
  model: GarmentModel;
  /** Marque les modeles deja dans la selection a coudre. */
  selected?: boolean;
  href?: string;
  /** Affiche le coeur « Enregistrer » (faux pour un visiteur sans compte). */
  saveable?: boolean;
  onSavedChange?: (model: GarmentModel, saved: boolean) => void;
}) {
  const photo = model.photo_url ?? model.photos?.[0] ?? null;
  const [saved, setSaved] = useState(model.liked_by_me);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    // Le coeur est dans le lien de la carte : on n'ouvre pas la fiche.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      if (next) await CatalogApi.like(model.id);
      else await CatalogApi.unlike(model.id);
      onSavedChange?.(model, next);
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Link href={href ?? `/modeles/${model.id}`} className="modelCard">
      <div
        className="modelCardImage"
        style={
          photo
            ? { backgroundImage: `url(${photo})` }
            : {
                // Meme degrade que le mobile quand aucune photo n'existe :
                // la couleur du modele vers l'encre sombre de la marque.
                background: `linear-gradient(160deg, ${model.thumbnail_color}, var(--indigo-text))`,
              }
        }
        role="img"
        aria-label={model.name}
      >
        {selected && (
          <span className="modelCardBadge" aria-label="Dans votre sélection">
            <IconCheck size={14} strokeWidth={3} aria-hidden />
          </span>
        )}
        {saveable && (
          <button
            type="button"
            className={`modelCardSave ${saved ? "modelCardSaveOn" : ""}`}
            onClick={toggle}
            aria-pressed={saved}
            aria-label={saved ? `Retirer ${model.name} des modèles enregistrés` : `Enregistrer ${model.name}`}
          >
            <IconHeart size={18} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>
      <span className="modelCardName">{model.name}</span>
      {model.category?.name && <span className="modelCardCategory">{model.category.name}</span>}
    </Link>
  );
}
