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
 * (voir lib/modelSuite).
 *
 * FLUIDITE. Pendant le geste, la fiche est deplacee directement dans le DOM
 * (une image par rafraichissement d'ecran), sans rendu React a chaque
 * mouvement du doigt. Le changement de modele se fait sur place : l'adresse
 * est remplacee (`history.replaceState`, le retour ramene a la liste) sans
 * nouvelle navigation, et le modele voisin, deja en cache, s'affiche aussitot.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { GarmentModel } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { addToSelection, isSelected, removeFromSelection } from "@/lib/selection";
import { cacheModels, modelCache, readSuite, rememberSuite, setDirection, takeDirection } from "@/lib/modelSuite";
import { Badge, Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconBack, IconCheck, IconChevronRight, IconHeart, IconModels, IconSearch } from "@/components/icons";
import { tr } from "@/lib/i18n";
import { nomModele, descriptionModele } from "@/lib/modelText";

/** Distance (px) au-dela de laquelle un balayage change de modele... */
const SEUIL = 70;
/** ...ou vitesse (px/ms) d'un coup de doigt rapide, meme court. */
const VITESSE = 0.45;
/** Duree de sortie de la fiche, en ms (voir aussi catalog.css). */
const SORTIE = 180;

export default function ModelePage() {
  const { id } = useParams<{ id: string }>();
  const [current, setCurrent] = useState(id);
  // Navigation venue d'ailleurs (lien vers un autre modele) : on la suit.
  useEffect(() => setCurrent(id), [id]);

  const navigate = useCallback((next: string) => {
    window.history.replaceState(window.history.state, "", `/modeles/${next}`);
    setCurrent(next);
  }, []);

  // Une fiche neuve par modele : etat, photo et animation d'entree repartent
  // de zero a chaque balayage.
  return <ModeleDetail key={current} id={current} onNavigate={navigate} />;
}

function ModeleDetail({ id, onNavigate }: { id: string; onNavigate: (id: string) => void }) {
  const { user } = useAuth();
  const [model, setModel] = useState<GarmentModel | null | undefined>(() => modelCache.get(id));
  const [shot, setShot] = useState(0);
  const [selected, setSelected] = useState(() => isSelected(id));
  const [error, setError] = useState("");
  const [suite, setSuite] = useState<string[]>([]);
  const [entree] = useState(takeDirection);
  const swipeRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; dx: number; axe: "h" | "v" | null } | null>(null);
  const raf = useRef(0);
  const sortie = useRef(false);

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
        setError(e instanceof Error ? e.message : tr("Modèle introuvable.", "Style not found."));
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

  /** Position de la fiche ; `anime` pour un retour ou une sortie en douceur. */
  function placer(dx: number, anime: boolean) {
    const el = swipeRef.current;
    if (!el) return;
    el.style.transition = anime ? `transform ${SORTIE}ms ease-out, opacity ${SORTIE}ms ease-out` : "none";
    el.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : "";
    el.style.opacity = dx ? String(1 - Math.min(Math.abs(dx) / (el.clientWidth * 1.4), 0.6)) : "";
  }

  function go(sens: "next" | "prev") {
    const cible = sens === "next" ? nextId : prevId;
    if (!cible || sortie.current) return;
    sortie.current = true;
    // La fiche sort du cote du geste, la suivante entre par l'autre.
    const largeur = swipeRef.current?.clientWidth ?? window.innerWidth;
    placer(sens === "next" ? -largeur : largeur, true);
    window.setTimeout(() => {
      setDirection(sens);
      onNavigate(cible);
    }, SORTIE);
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
    if (sortie.current) return;
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, axe: null };
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
    s.dx = bout ? dx * 0.25 : dx;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => placer(s.dx, false));
  }

  function onTouchEnd() {
    const s = touch.current;
    touch.current = null;
    cancelAnimationFrame(raf.current);
    if (!s || s.axe !== "h") return;
    const vitesse = Math.abs(s.dx) / Math.max(1, performance.now() - s.t);
    const franchi = Math.abs(s.dx) > SEUIL || (Math.abs(s.dx) > 24 && vitesse > VITESSE);
    if (franchi && s.dx < 0 && nextId) return go("next");
    if (franchi && s.dx > 0 && prevId) return go("prev");
    placer(0, true);
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

  if (model === undefined) return <Spinner />;
  if (model === null) {
    return (
      <>
        <PageHeader title={tr("Modèle", "Style")} back />
        <div className="container section">
          <ErrorBanner message={error} />
          <EmptyState icon={<IconSearch size={30} strokeWidth={1.6} />} title={tr("Ce modèle n'existe pas", "This style doesn't exist")} />
        </div>
      </>
    );
  }

  const gallery = model.photos?.length ? model.photos : model.photo_url ? [model.photo_url] : [];
  const cover = gallery[shot] ?? null;
  const mine = Boolean(model.created_by && model.created_by === user?.id);

  return (
    <>
      <PageHeader title={nomModele(model)} back />
      <div className="modelSwipeViewport">
        <div
          ref={swipeRef}
          className={`container section modelSwipe ${entree === "next" ? "modelEnterNext" : entree === "prev" ? "modelEnterPrev" : ""}`}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="modelDetail">
            <div>
              <div
                className="modelHero"
                style={cover ? { backgroundImage: `url(${cover})` } : { background: model.thumbnail_color }}
                role="img"
                aria-label={nomModele(model)}
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
                  <button type="button" onClick={() => go("prev")} disabled={!prevId} aria-label={tr("Modèle précédent", "Previous style")}>
                    <IconBack size={20} aria-hidden />
                  </button>
                  <span>
                    {index + 1} / {suite.length}
                    <small>{tr("Glissez pour changer", "Swipe to browse")}</small>
                  </span>
                  <button type="button" onClick={() => go("next")} disabled={!nextId} aria-label={tr("Modèle suivant", "Next style")}>
                    <IconChevronRight size={20} aria-hidden />
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="modelTitleRow">
                <h2>{nomModele(model)}</h2>
                <button
                  className={`likeBtn ${model.liked_by_me ? "likeBtnActive" : ""}`}
                  onClick={toggleLike}
                  aria-pressed={model.liked_by_me}
                  aria-label={model.liked_by_me ? tr("Retirer des enregistrés", "Remove from saved") : tr("Enregistrer ce modèle", "Save this style")}
                >
                  <IconHeart size={20} strokeWidth={2} />
                  <span>{model.liked_by_me ? tr("Enregistré", "Saved") : tr("Enregistrer", "Save")} · {model.like_count}</span>
                </button>
              </div>

              <div className="tagRow">
                <Badge>{model.category?.name}</Badge>
                {model.created_by && (
                  <Badge tone="success">{mine ? tr("Votre proposition", "Your suggestion") : tr("Communauté", "Community")}</Badge>
                )}
                {model.style_tags?.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>

              {descriptionModele(model) && <p className="muted modelDescription">{descriptionModele(model)}</p>}

              <div className="actionBar">
                <Button variant={selected ? "secondary" : "ghost"} onClick={toggleSelection}>
                  {selected ? (
                    <>
                      <IconCheck size={17} strokeWidth={2.6} aria-hidden /> {tr("Dans ma sélection", "In my selection")}
                    </>
                  ) : (
                    <>
                      <IconModels size={17} strokeWidth={2} aria-hidden /> {tr("Ajouter à ma sélection", "Add to my selection")}
                    </>
                  )}
                </Button>
                <Link href={`/mesures/nouvelle?modele=${model.id}`} style={{ display: "contents" }}>
                  <Button block>{tr("Prendre mes mesures", "Take my measurements")}</Button>
                </Link>
                <Link href={`/tailleurs?modele=${model.id}`} style={{ display: "contents" }}>
                  <Button block variant="secondary">{tr("Faire coudre par un tailleur", "Have it made by a tailor")}</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
