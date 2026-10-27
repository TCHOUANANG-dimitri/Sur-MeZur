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
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { IconModels, IconSearch } from "@/components/icons";
import { tr } from "@/lib/i18n";

const GENRES: Record<string, [string, string]> = { female: ["Femme", "Women"], male: ["Homme", "Men"], unisex: ["Mixte", "Unisex"] };

/** Nom de categorie, precise du genre quand deux categories portent le meme
 *  nom (« Haut » femme et « Haut » homme). */
function categoryLabel(c: Category, all: Category[]): string {
  const homonyme = all.some((o) => o.id !== c.id && o.name === c.name);
  return homonyme && GENRES[c.gender] ? `${c.name} · ${tr(...GENRES[c.gender])}` : c.name;
}

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
        setError(e instanceof Error ? e.message : tr("Catalogue indisponible.", "Catalogue unavailable."));
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
    // Les deux langues : on retrouve un modèle par son nom français ou anglais.
    return models.filter((m) => `${m.name} ${m.name_en ?? ""}`.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <>
      <PageHeader title={likedOnly ? tr("Modèles enregistrés", "Saved styles") : tr("Modèles", "Styles")} />
      <div className="container section">
        <Input
          type="search"
          placeholder={tr("Rechercher un modèle", "Search styles")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tr("Rechercher un modèle", "Search styles")}
        />

        {/* Menus deroulants : la place des filtres reste la meme quel que
            soit le nombre de categories (en puces, elles s'empilaient sur
            plusieurs lignes). Un filtre actif est mis en couleur. */}
        <div className="galleryFilterBar">
          <label className={`filterSelect filterSelectWide ${categoryId ? "filterSelectOn" : ""}`}>
            <span>{tr("Catégorie", "Category")}</span>
            <Select value={categoryId ?? ""} onChange={(e) => setParam("categorie", e.target.value || null)}>
              <option value="">{tr("Toutes", "All")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c, categories)}
                </option>
              ))}
            </Select>
          </label>
          <label className={`filterSelect ${likedOnly ? "filterSelectOn" : ""}`}>
            <span>{tr("Afficher", "Show")}</span>
            <Select value={likedOnly ? "1" : ""} onChange={(e) => setParam("favoris", e.target.value || null)}>
              <option value="">{tr("Tous", "All")}</option>
              <option value="1">{tr("Enregistrés", "Saved")}</option>
            </Select>
          </label>
          <label className={`filterSelect ${sort === "popular" ? "filterSelectOn" : ""}`}>
            <span>{tr("Trier", "Sort")}</span>
            <Select value={sort === "popular" ? "populaire" : ""} onChange={(e) => setParam("tri", e.target.value || null)}>
              <option value="">{tr("Récents", "Newest")}</option>
              <option value="populaire">{tr("Plus aimés", "Most liked")}</option>
            </Select>
          </label>
        </div>

        {selection.length > 0 && (
          <div className="selectionBar">
            <IconModels size={18} aria-hidden />
            <span>
              {tr(
                `${selection.length} modèle${selection.length > 1 ? "s" : ""} dans votre sélection`,
                `${selection.length} style${selection.length > 1 ? "s" : ""} selected`
              )}
            </span>
          </div>
        )}

        <ErrorBanner message={error} />

        {shown === null ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={30} strokeWidth={1.6} />}
            title={likedOnly ? tr("Aucun modèle enregistré", "No saved styles") : tr("Aucun modèle", "No styles")}
            body={likedOnly && !query ? tr("Touchez le cœur d'un modèle pour l'enregistrer.", "Tap the heart on a style to save it.") : undefined}
            action={
              <Link href="/modeles/proposer">
                <Button variant="ghost">{tr("Proposer un modèle", "Suggest a style")}</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid">
            {shown.map((m) => (
              <ModelCard key={m.id} model={m} selected={selection.includes(m.id)} suite={shown.map((x) => x.id)} />
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
    <Suspense fallback={<Spinner />}>
      <GalerieInner />
    </Suspense>
  );
}
