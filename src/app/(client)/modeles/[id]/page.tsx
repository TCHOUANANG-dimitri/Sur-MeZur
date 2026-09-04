"use client";

/**
 * Fiche modele, reprise de l'ecran mobile : galerie, description, bouton
 * favori, et l'action qui compte ici — prendre ses mesures pour ce modele.
 *
 * Aucun prix n'est affiche : un modele est confectionne sur mesure et son
 * tarif se negocie avec le tailleur.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { GarmentModel } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { addToSelection, isSelected, removeFromSelection } from "@/lib/selection";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconCheck, IconModels, IconReviews, IconSearch } from "@/components/icons";

export default function ModeleDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [model, setModel] = useState<GarmentModel | null | undefined>(undefined);
  const [shot, setShot] = useState(0);
  const [selected, setSelected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    CatalogApi.model(id)
      .then((m) => {
        setModel(m);
        setSelected(isSelected(m.id));
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Modèle introuvable.");
        setModel(null);
      });
  }, [id]);

  async function toggleLike() {
    if (!model) return;
    // Mise a jour optimiste : le compteur reagit immediatement, et on relit
    // le modele si l'appel echoue plutot que de laisser un etat faux.
    const wasLiked = model.liked_by_me;
    setModel({
      ...model,
      liked_by_me: !wasLiked,
      like_count: model.like_count + (wasLiked ? -1 : 1),
    });
    try {
      if (wasLiked) await CatalogApi.unlike(model.id);
      else await CatalogApi.like(model.id);
    } catch {
      CatalogApi.model(model.id).then(setModel).catch(() => {});
    }
  }

  function toggleSelection() {
    if (!model) return;
    if (selected) {
      removeFromSelection(model.id);
      setSelected(false);
    } else {
      addToSelection(model.id);
      setSelected(true);
    }
  }

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

  const gallery = model.photos?.length ? model.photos : model.photo_url ? [model.photo_url] : [];
  const cover = gallery[shot] ?? null;
  const mine = Boolean(model.created_by && model.created_by === user?.id);

  return (
    <>
      <PageHeader title={model.name} back />
      <div className="container section">
        <div className="modelDetail">
          <div>
            <div
              className="modelHero"
              style={cover ? { backgroundImage: `url(${cover})` } : { background: model.thumbnail_color }}
              role="img"
              aria-label={model.name}
            />
            {gallery.length > 1 && (
              <div className="modelThumbs">
                {gallery.map((src, i) => (
                  <button
                    key={src}
                    className={`modelThumb ${i === shot ? "modelThumbActive" : ""}`}
                    style={{ backgroundImage: `url(${src})` }}
                    onClick={() => setShot(i)}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="modelTitleRow">
              <h2>{model.name}</h2>
              <button
                className={`likeBtn ${model.liked_by_me ? "likeBtnActive" : ""}`}
                onClick={toggleLike}
                aria-pressed={model.liked_by_me}
                aria-label={model.liked_by_me ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <IconReviews size={20} strokeWidth={2} />
                <span>{model.like_count}</span>
              </button>
            </div>

            <div className="tagRow">
              <Badge>{model.category?.name}</Badge>
              {model.created_by && (
                <Badge tone="success">{mine ? "Votre proposition" : "Modèle de la communauté"}</Badge>
              )}
              {model.style_tags?.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>

            {model.description && <p className="muted modelDescription">{model.description}</p>}

            <div className="card cardFlat modelNext">
              <h3>Et maintenant ?</h3>
              <p className="muted">
                Ajoutez ce modèle à votre sélection, puis prenez vos mesures. Votre fiche à
                télécharger réunira vos mensurations et les modèles retenus.
              </p>
            </div>

            <div className="actionBar">
              <Button variant={selected ? "secondary" : "ghost"} onClick={toggleSelection}>
                {selected ? (
                  <>
                    <IconCheck size={17} strokeWidth={2.6} aria-hidden /> Dans ma sélection
                  </>
                ) : (
                  <>
                    <IconModels size={17} strokeWidth={2} aria-hidden /> Ajouter à ma sélection
                  </>
                )}
              </Button>
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
