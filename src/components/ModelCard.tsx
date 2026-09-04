"use client";

/**
 * Carte de modele, reprise de l'accueil mobile : vignette, puis le nom et la
 * categorie sous l'image (et non par-dessus).
 *
 * Aucun prix n'est affiche : les modeles sont confectionnes sur mesure et le
 * tarif se negocie avec le tailleur. Montrer un prix de catalogue laisserait
 * croire a un tarif ferme.
 */

import Link from "next/link";
import type { GarmentModel } from "@/lib/api/types";
import { IconCheck } from "./icons";

export function ModelCard({
  model,
  selected,
  href,
}: {
  model: GarmentModel;
  /** Marque les modeles deja dans la selection a coudre. */
  selected?: boolean;
  href?: string;
}) {
  const photo = model.photo_url ?? model.photos?.[0] ?? null;
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
      </div>
      <span className="modelCardName">{model.name}</span>
      {model.category?.name && <span className="modelCardCategory">{model.category.name}</span>}
    </Link>
  );
}
