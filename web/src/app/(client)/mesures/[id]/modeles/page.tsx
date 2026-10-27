"use client";

/**
 * Modeles retenus, a montrer au tailleur — distinct de la fiche de mesures.
 *
 * Pour chaque modele :
 *  - la PHOTO a telecharger, marquee « Sur-MeZur » (lib/watermark) : c'est
 *    ce qu'on envoie au tailleur la plupart du temps ;
 *  - une FICHE seulement si la personne a des precisions a donner sur la
 *    confection : un modele par fiche, la photo en grand sur la premiere
 *    page, ses ajustements sur la seconde.
 *
 * La fiche suit la meme mecanique que la fiche de mesures : mise en page
 * HTML pilotee par `@media print`, puis « Enregistrer en PDF » du navigateur.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { getSelection } from "@/lib/selection";
import { photoFileName, watermarkedPhoto } from "@/lib/watermark";
import { useAuth } from "@/components/AuthProvider";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconDownload, IconEdit, IconModels, IconPrint } from "@/components/icons";
import { locale, tr } from "@/lib/i18n";
import { nomModele, descriptionModele } from "@/lib/modelText";

/*
 * Ajustements POUR CHAQUE MODELE (preferences, tissu, finitions). Ils vivent
 * dans `localStorage`, comme la selection de modeles (`src/lib/selection.ts`) :
 * ils n'appartiennent qu'au navigateur et a l'edition de la fiche, rien qui
 * doive etre persiste cote serveur. Structure : `{ [idModele]: texte }`.
 */
const NOTES_KEY = "sm_model_notes";

function readNotes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeNotes(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  } catch {
    /* stockage indisponible : la note ne persistera pas, sans plus */
  }
}

function photoOf(m: GarmentModel): string | null {
  return m.photo_url ?? m.photos?.[0] ?? null;
}

export default function FicheModeles() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Modeles dont le champ « ajustements » est ouvert.
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Modele a imprimer, et sa photo marquee (URL blob).
  const [print, setPrint] = useState<{ model: GarmentModel; src: string | null } | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    const n = readNotes();
    setNotes(n);
    setEditing(Object.fromEntries(Object.keys(n).map((k) => [k, true])));
  }, []);

  useEffect(() => {
    if (!id) return;
    MeasurementsApi.list()
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch(() => setMeasurement(null));
  }, [id]);

  useEffect(() => {
    const ids = getSelection();
    if (!ids.length) {
      setModels([]);
      return;
    }
    // Un modele supprime entre-temps est ignore plutot que de faire echouer
    // toute la page.
    Promise.all(ids.map((mid) => CatalogApi.model(mid).catch(() => null))).then((list) =>
      setModels(list.filter((m): m is GarmentModel => m !== null))
    );
  }, []);

  // L'URL blob de la photo imprimee est liberee quand elle est remplacee.
  useEffect(() => {
    const src = print?.src;
    return () => {
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [print?.src]);

  // Sans photo, rien a attendre : impression des que la fiche est rendue.
  useEffect(() => {
    if (print && !print.src && !printed.current) {
      printed.current = true;
      requestAnimationFrame(() => window.print());
    }
  }, [print]);

  const setModelNote = (modelId: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text.trim()) next[modelId] = text;
      else delete next[modelId];
      writeNotes(next);
      return next;
    });
  };

  async function downloadPhoto(m: GarmentModel) {
    const src = photoOf(m);
    if (!src) return;
    setBusy(`photo-${m.id}`);
    setError("");
    try {
      const url = URL.createObjectURL(await watermarkedPhoto(src));
      const a = document.createElement("a");
      a.href = url;
      a.download = photoFileName(nomModele(m));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError(tr("Photo indisponible. Réessayez.", "Photo unavailable. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function printFiche(m: GarmentModel) {
    const src = photoOf(m);
    setBusy(`fiche-${m.id}`);
    setError("");
    printed.current = false;
    try {
      setPrint({ model: m, src: src ? URL.createObjectURL(await watermarkedPhoto(src)) : null });
    } catch {
      // Filigrane impossible : la fiche part avec la photo telle quelle.
      setPrint({ model: m, src });
    } finally {
      setBusy(null);
    }
  }

  if (measurement === undefined || models === null) {
    return <Spinner />;
  }

  if (!models.length) {
    return (
      <>
        <PageHeader title={tr("Mes modèles", "My styles")} back />
        <div className="container section">
          <EmptyState
            icon={<IconModels size={30} strokeWidth={1.6} />}
            title={tr("Aucun modèle retenu", "No styles chosen")}
            action={
              <Link href="/modeles">
                <Button>{tr("Parcourir les modèles", "Browse styles")}</Button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const editee = new Date().toLocaleDateString(locale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const meta = (
    <div className="ficheMeta">
      {user?.full_name && (
        <div>
          <strong>{user.full_name}</strong>
        </div>
      )}
      <div>{tr(`Éditée le ${editee}`, `Issued ${editee}`)}</div>
      {measurement && <div>{tr("Mesures n°", "Measurements #")}{measurement.version}</div>}
    </div>
  );

  return (
    <>
      <PageHeader title={tr("Mes modèles", "My styles")} back />

      <div className="container section no-print">
        {measurement && (
          <div className="ficheSwitch">
            <Link href={`/mesures/${measurement.id}/fiche`}>{tr("Ma fiche de mesures", "My measurement sheet")}</Link>
          </div>
        )}

        <ErrorBanner message={error} />

        <div className="modelSheetList">
          {models.map((m) => {
            const photo = photoOf(m);
            const note = notes[m.id] ?? "";
            const open = editing[m.id] ?? false;
            return (
              <section key={m.id} className="modelSheetCard">
                <div
                  className="modelSheetPhoto"
                  style={photo ? { backgroundImage: `url(${photo})` } : { background: m.thumbnail_color }}
                  role="img"
                  aria-label={nomModele(m)}
                />
                <div className="modelSheetBody">
                  <h2 className="ficheModelName">{nomModele(m)}</h2>
                  {m.category?.name && <p className="ficheModelCat">{m.category.name}</p>}

                  <div className="modelSheetActions">
                    <Button
                      onClick={() => downloadPhoto(m)}
                      disabled={!photo || busy !== null}
                      title={photo ? undefined : tr("Pas de photo.", "No photo.")}
                    >
                      <IconDownload size={17} aria-hidden />
                      {busy === `photo-${m.id}` ? tr("Préparation…", "Preparing…") : tr("Télécharger la photo", "Download photo")}
                    </Button>
                    {!open && (
                      <Button variant="ghost" onClick={() => setEditing((e) => ({ ...e, [m.id]: true }))}>
                        <IconEdit size={17} aria-hidden /> {tr("Ajouter des ajustements", "Add adjustments")}
                      </Button>
                    )}
                  </div>

                  {open && (
                    <div className="modelSheetNotes">
                      <label className="fieldLabel" htmlFor={`note-${m.id}`}>
                        {tr("Vos ajustements", "Your adjustments")}
                      </label>
                      <Textarea
                        id={`note-${m.id}`}
                        rows={4}
                        placeholder={tr("Ex. manches plus courtes, doublure…", "E.g. shorter sleeves, lining…")}
                        value={note}
                        onChange={(e) => setModelNote(m.id, e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => printFiche(m)}
                        disabled={!note.trim() || busy !== null}
                      >
                        <IconPrint size={17} aria-hidden />
                        {busy === `fiche-${m.id}` ? tr("Préparation…", "Preparing…") : tr("Télécharger la fiche (PDF)", "Download sheet (PDF)")}
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {print && (
        <article className="fiche ficheModele print-only" aria-hidden>
          <section className="ficheModelePage">
            <header className="ficheHeader">
              <div>
                <span className="ficheBrand">Sur-MeZur</span>
                <h1 className="ficheTitle">{tr("Modèle à coudre", "Style to sew")}</h1>
              </div>
              {meta}
            </header>
            <div className="ficheModeleTitre">
              <h2 className="ficheModelName">{nomModele(print.model)}</h2>
              {print.model.category?.name && <p className="ficheModelCat">{print.model.category.name}</p>}
            </div>
            {print.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={print.src}
                alt=""
                className="ficheModeleImage"
                onLoad={() => {
                  if (printed.current) return;
                  printed.current = true;
                  window.print();
                }}
              />
            ) : (
              <span className="ficheModeleImage" style={{ background: print.model.thumbnail_color }} />
            )}
          </section>

          <section className="ficheModelePage">
            <header className="ficheHeader">
              <div>
                <span className="ficheBrand">Sur-MeZur</span>
                <h1 className="ficheTitle">{tr("Ajustements", "Adjustments")}</h1>
              </div>
              {meta}
            </header>
            <div className="ficheModeleTitre">
              <h2 className="ficheModelName">{nomModele(print.model)}</h2>
              {print.model.category?.name && <p className="ficheModelCat">{print.model.category.name}</p>}
            </div>
            <p className="ficheModeleNotes">{notes[print.model.id]}</p>
            {descriptionModele(print.model) && (
              <p className="ficheModelDesc">
                <strong>{tr("Description : ", "Description: ")}</strong>
                {descriptionModele(print.model)}
              </p>
            )}
            <footer className="ficheFooter">
              {tr("À présenter avec la fiche de mesures", "Show with the measurement sheet")}
              {measurement ? ` (n°${measurement.version})` : ""}.
            </footer>
          </section>
        </article>
      )}
    </>
  );
}
