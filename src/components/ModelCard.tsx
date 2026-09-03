"use client";

/**
 * Carte de modele du catalogue.
 *
 * Aucun prix n'est affiche : les modeles sont confectionnes sur mesure et le
 * tarif se negocie avec le tailleur. Montrer un prix de catalogue laisserait
 * croire a un tarif ferme.
 */

import Link from "next/link";
import type { GarmentModel } from "@/lib/api/types";

export function ModelCard({ model }: { model: GarmentModel }) {
  const photo = model.photo_url ?? model.photos?.[0] ?? null;
  return (
    <Link href={`/modeles/${model.id}`} className="modelCard">
      <div
        className="modelCardImage"
        style={
          photo
            ? { backgroundImage: `url(${photo})` }
            : { background: model.thumbnail_color ?? "var(--bg-alt)" }
        }
        role="img"
        aria-label={model.name}
      />
      <div className="modelCardBody">
        <span className="modelCardName">{model.name}</span>
      </div>
    </Link>
  );
}
