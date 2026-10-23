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
 * `suite` : identifiants de la liste affichee, dans l'ordre. Toucher la carte
 * les retient pour passer d'un modele a l'autre par balayage sur la fiche.
 *
 * Aucun prix n'est affiche : les modeles sont confectionnes sur mesure et le
 * tarif se negocie avec le tailleur. Montrer un prix de catalogue laisserait
 * croire a un tarif ferme.
 */

import Link from "next/link";
import { useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import { cacheModels, rememberSuite } from "@/lib/modelSuite";
import type { GarmentModel } from "@/lib/api/types";
import { IconCheck, IconHeart } from "./icons";
import { tr } from "@/lib/i18n";

export function ModelCard({
  model,
  selected,
  href,
  saveable = true,
  onSavedChange,
  suite,
}: {
  model: GarmentModel;
  /** Marque les modeles deja dans la selection a coudre. */
  selected?: boolean;
  href?: string;
  /** Affiche le coeur « Enregistrer » (faux pour un visiteur sans compte). */
  saveable?: boolean;
  onSavedChange?: (model: GarmentModel, saved: boolean) => void;
  suite?: string[];
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
    <Link
      href={href ?? `/modeles/${model.id}`}
      className="modelCard"
      onClick={() => {
        if (suite) rememberSuite(suite);
        cacheModels([{ ...model, liked_by_me: saved }]);
      }}
    >
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
          <span className="modelCardBadge" aria-label={tr("Dans votre sélection", "In your selection")}>
            <IconCheck size={14} strokeWidth={3} aria-hidden />
          </span>
        )}
        {saveable && (
          <button
            type="button"
            className={`modelCardSave ${saved ? "modelCardSaveOn" : ""}`}
            onClick={toggle}
            aria-pressed={saved}
            aria-label={saved ? tr(`Retirer ${model.name} des enregistrés`, `Remove ${model.name} from saved`) : tr(`Enregistrer ${model.name}`, `Save ${model.name}`)}
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
