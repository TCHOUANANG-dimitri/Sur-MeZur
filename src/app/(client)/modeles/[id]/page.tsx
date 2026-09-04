"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { GarmentModel } from "@/lib/api/types";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconSearch } from "@/components/icons";

export default function ModeleDetail() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<GarmentModel | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    CatalogApi.model(id)
      .then(setModel)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Modèle introuvable.");
        setModel(null);
      });
  }, [id]);

  if (model === undefined) return <Spinner label="Chargement…" />;
  if (model === null) {
    return (
      <>
        <PageHeader title="Modèle" back />
        <div className="container section">
          <ErrorBanner message={error} />
          <EmptyState icon={<IconSearch size={30} strokeWidth={1.6} />} title="Ce modèle n'existe pas" />
        </div>
      </>
    );
  }

  const photo = model.photo_url ?? model.photos?.[0] ?? null;

  return (
    <>
      <PageHeader title={model.name} back />
      <div className="container section">
        <div className="modelDetail">
          <div
            className="modelHero"
            style={photo ? { backgroundImage: `url(${photo})` } : { background: model.thumbnail_color }}
            role="img"
            aria-label={model.name}
          />

          <div>
            <h2>{model.name}</h2>
            {model.description && <p className="muted">{model.description}</p>}

            {model.style_tags?.length > 0 && (
              <div className="tagRow">
                {model.style_tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            )}

            <div className="card cardFlat" style={{ margin: "22px 0" }}>
              <h3 style={{ marginBottom: 6 }}>Et maintenant ?</h3>
              <p className="muted" style={{ margin: 0 }}>
                Prenez vos mesures en deux photos. Vous obtiendrez une fiche à télécharger,
                avec ce modèle et vos mesures, à remettre à votre tailleur.
              </p>
            </div>

            <div className="actionBar">
              <Link href={`/mesures/nouvelle?modele=${model.id}`} style={{ display: "contents" }}>
                <Button block>Prendre mes mesures</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
