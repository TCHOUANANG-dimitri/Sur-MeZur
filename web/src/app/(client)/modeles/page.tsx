"use client";

/**
 * Catalogue. Les filtres vivent dans l'URL (`categorie`, `tri`, `favoris`)
 * plutot que dans l'etat local : une vue filtree devient partageable, le
 * retour arriere du navigateur la restitue, et l'accueil peut y pointer
 * directement.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { Category, GarmentModel } from "@/lib/api/types";
import { ModelCard } from "@/components/ModelCard";
import { getSelection, onSelectionChange } from "@/lib/selection";
import { Button, Chip, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from "@/components/ui";
import { IconModels, IconSearch } from "@/components/icons";

function GalerieInner() {
  const router = useRouter();
  const params = useSearchParams();

  const categoryId = params.get("categorie");
  const sort = params.get("tri") === "populaire" ? "popular" : "recent";
  const likedOnly = params.get("favoris") === "1";

  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    CatalogApi.categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const sync = () => setSelection(getSelection());
    sync();
    return onSelectionChange(sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setError("");
    CatalogApi.models({
      ...(categoryId ? { category_id: categoryId } : {}),
      sort,
      ...(likedOnly ? { liked_only: true } : {}),
    })
      .then((list) => !cancelled && setModels(list))
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Catalogue indisponible.");
        setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, sort, likedOnly]);

  /** Reecrit l'URL en conservant les autres filtres. */
  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`/modeles${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  // Filtrage par mot-cle cote navigateur : le catalogue tient en memoire et
  // cela evite une requete a chaque frappe.
  const shown = useMemo(() => {
    if (!models) return null;
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <>
      <PageHeader title={likedOnly ? "Mes favoris" : "Modèles"} />
      <div className="container section">
        <Input
          type="search"
          placeholder="Rechercher un modèle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un modèle"
        />

        <div className="chipRow galleryFilters">
          <Chip active={!likedOnly} onClick={() => setParam("favoris", null)}>
            Tous
          </Chip>
          <Chip active={likedOnly} onClick={() => setParam("favoris", "1")}>
            Mes favoris
          </Chip>
          <span className="filterDivider" aria-hidden />
          <Chip active={sort === "recent"} onClick={() => setParam("tri", null)}>
            Récents
          </Chip>
          <Chip active={sort === "popular"} onClick={() => setParam("tri", "populaire")}>
            Les plus aimés
          </Chip>
        </div>

        {categories.length > 0 && (
          <div className="chipRow galleryFilters">
            <Chip active={!categoryId} onClick={() => setParam("categorie", null)}>
              Toutes catégories
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setParam("categorie", c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        )}

        {selection.length > 0 && (
          <div className="selectionBar">
            <IconModels size={18} aria-hidden />
            <span>
              {selection.length} modèle{selection.length > 1 ? "s" : ""} dans votre sélection
            </span>
          </div>
        )}

        <ErrorBanner message={error} />

        {shown === null ? (
          <Spinner label="Chargement du catalogue…" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={30} strokeWidth={1.6} />}
            title={likedOnly ? "Aucun favori" : "Aucun modèle"}
            body={
              query
                ? "Aucun modèle ne correspond à votre recherche."
                : likedOnly
                  ? "Ajoutez des modèles à vos favoris depuis leur fiche."
                  : "Le catalogue est vide pour ce filtre."
            }
            action={
              <Link href="/modeles/proposer">
                <Button variant="ghost">Proposer un modèle</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid">
            {shown.map((m) => (
              <ModelCard key={m.id} model={m} selected={selection.includes(m.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function Galerie() {
  // `useSearchParams` impose une frontiere Suspense en App Router.
  return (
    <Suspense fallback={<Spinner label="Chargement…" />}>
      <GalerieInner />
    </Suspense>
  );
}
