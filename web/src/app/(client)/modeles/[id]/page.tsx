"use client";

/**
 * Fiche modele, reprise de l'ecran mobile : galerie, description, bouton
 * favori, et l'action qui compte ici — prendre ses mesures pour ce modele.
 *
 * Aucun prix n'est affiche : un modele est confectionne sur mesure et son
 * tarif se negocie avec le tailleur.
 *
 * Balayer la fiche vers la gauche ou la droite (ou les fleches, ou le
 * clavier) passe au modele suivant ou precedent de la liste d'ou l'on vient
 * (voir lib/modelSuite). `router.replace` : le retour ramene a la liste, pas
 * a chaque modele parcouru.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { GarmentModel } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { addToSelection, isSelected, removeFromSelection } from "@/lib/selection";
import { cacheModels, modelCache, readSuite, rememberSuite, setDirection, takeDirection } from "@/lib/modelSuite";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconBack, IconCheck, IconChevronRight, IconHeart, IconModels, IconSearch } from "@/components/icons";

/** Distance (px) au-dela de laquelle un balayage change de modele. */
const SEUIL = 70;

export default function ModelePage() {
  const { id } = useParams<{ id: string }>();
  // Une fiche neuve par modele : etat, photo et animation d'entree repartent
  // de zero a chaque balayage.
  return <ModeleDetail key={id} id={id} />;
}

function ModeleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [model, setModel] = useState<GarmentModel | null | undefined>(() => modelCache.get(id));
  const [shot, setShot] = useState(0);
  const [selected, setSelected] = useState(() => isSelected(id));
  const [error, setError] = useState("");
  const [suite, setSuite] = useState<string[]>([]);
  const [entree] = useState(takeDirection);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; axe: "h" | "v" | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    // Le modele en cache s'affiche tout de suite ; on le relit quand meme
    // (compteur de coeurs, photos ajoutees entre-temps).
    CatalogApi.model(id)
      .then((m) => {
        cacheModels([m]);
        setModel(m);
        setSelected(isSelected(m.id));
      })
      .catch((e) => {
        if (modelCache.has(id)) return;
        setError(e instanceof Error ? e.message : "Modèle introuvable.");
        setModel(null);
      });
  }, [id]);

  const categoryId = model?.category?.id;
  useEffect(() => {
    if (!categoryId) return;
    const retenue = readSuite();
    if (retenue.includes(id)) {
      setSuite(retenue);
      return;
    }
    // Lien direct : les modeles de la meme categorie.
    CatalogApi.models({ category_id: categoryId, sort: "recent" })
      .then((list) => {
        cacheModels(list);
        const ids = list.map((m) => m.id);
        if (!ids.includes(id)) ids.unshift(id);
        rememberSuite(ids);
        setSuite(ids);
      })
      .catch(() => {});
  }, [id, categoryId]);

  const index = suite.indexOf(id);
  const prevId = index > 0 ? suite[index - 1] : null;
  const nextId = index >= 0 && index < suite.length - 1 ? suite[index + 1] : null;

  // Voisins prets a l'avance : donnees et premiere photo.
  useEffect(() => {
    for (const voisin of [prevId, nextId]) {
      if (!voisin) continue;
      const deja = modelCache.get(voisin);
      (deja ? Promise.resolve(deja) : CatalogApi.model(voisin))
        .then((m) => {
          cacheModels([m]);
          const photo = m.photos?.[0] ?? m.photo_url;
          if (photo) new Image().src = photo;
        })
        .catch(() => {});
    }
  }, [prevId, nextId]);

  function go(sens: "next" | "prev") {
    const cible = sens === "next" ? nextId : prevId;
    if (!cible) return;
    setDirection(sens);
    router.replace(`/modeles/${cible}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight") go("next");
      if (e.key === "ArrowLeft") go("prev");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, axe: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Le geste est verrouille sur un axe des les premiers pixels : un
    // defilement vertical ne fait jamais glisser la fiche.
    if (!s.axe && Math.hypot(dx, dy) > 10) s.axe = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    if (s.axe !== "h") return;
    // Au bout de la liste, la fiche resiste.
    const bout = (dx < 0 && !nextId) || (dx > 0 && !prevId);
    setDrag(bout ? dx * 0.25 : dx);
  }

  function onTouchEnd() {
    const s = touch.current;
    touch.current = null;
    if (s?.axe === "h" && Math.abs(drag) > SEUIL) {
      if (drag < 0 && nextId) return go("next");
      if (drag > 0 && prevId) return go("prev");
    }
    setDrag(0);
  }

  async function toggleLike() {
    if (!model) return;
    // Mise a jour optimiste : le compteur reagit immediatement, et on relit
    // le modele si l'appel echoue plutot que de laisser un etat faux.
    const wasLiked = model.liked_by_me;
    const next = {
      ...model,
      liked_by_me: !wasLiked,
      like_count: model.like_count + (wasLiked ? -1 : 1),
    };
    setModel(next);
    cacheModels([next]);
    try {
      if (wasLiked) await CatalogApi.unlike(model.id);
      else await CatalogApi.like(model.id);
    } catch {
      CatalogApi.model(model.id)
        .then((m) => {
          cacheModels([m]);
          setModel(m);
        })
        .catch(() => {});
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
      <div
        className={`container section modelSwipe ${entree === "next" ? "modelEnterNext" : entree === "prev" ? "modelEnterPrev" : ""}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={
          drag
            ? { transform: `translateX(${drag}px)`, opacity: 1 - Math.min(Math.abs(drag) / 700, 0.4), transition: "none" }
            : undefined
        }
      >
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
            {suite.length > 1 && index >= 0 && (
              <div className="modelSuiteNav">
                <button type="button" onClick={() => go("prev")} disabled={!prevId} aria-label="Modèle précédent">
                  <IconBack size={20} aria-hidden />
                </button>
                <span>
                  {index + 1} / {suite.length}
                  <small>Glissez pour changer de modèle</small>
                </span>
                <button type="button" onClick={() => go("next")} disabled={!nextId} aria-label="Modèle suivant">
                  <IconChevronRight size={20} aria-hidden />
                </button>
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
                aria-label={model.liked_by_me ? "Retirer des modèles enregistrés" : "Enregistrer ce modèle"}
              >
                <IconHeart size={20} strokeWidth={2} />
                <span>{model.liked_by_me ? "Enregistré" : "Enregistrer"} · {model.like_count}</span>
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
