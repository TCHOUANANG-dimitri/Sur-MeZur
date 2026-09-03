"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { Category, GarmentModel } from "@/lib/api/types";
import { ModelCard } from "@/components/ModelCard";
import { Chip, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from "@/components/ui";

export default function Modeles() {
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    CatalogApi.categories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setError("");
    CatalogApi.models(categoryId ? { category_id: categoryId } : {})
      .then((list) => !cancelled && setModels(list))
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Catalogue indisponible.");
        setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  // Filtrage par mot-cle cote navigateur : le catalogue tient largement en
  // memoire et cela evite une requete a chaque frappe.
  const shown = useMemo(() => {
    if (!models) return null;
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <>
      <PageHeader title="Modèles" />
      <div className="container section">
        <Input
          type="search"
          placeholder="Rechercher un modèle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un modèle"
        />

        {categories.length > 0 && (
          <div className="chipRow" style={{ margin: "14px 0" }}>
            <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
              Tous
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        )}

        <ErrorBanner message={error} />

        {shown === null ? (
          <Spinner label="Chargement du catalogue…" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="👗"
            title="Aucun modèle"
            body={
              query
                ? "Aucun modèle ne correspond à votre recherche."
                : "Le catalogue est vide pour cette catégorie."
            }
          />
        ) : (
          <div className="grid">
            {shown.map((m) => (
              <ModelCard key={m.id} model={m} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
