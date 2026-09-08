"use client";

/**
 * Fiche des modeles a coudre — SECOND document, distinct de la fiche de
 * mesures.
 *
 * Les deux vont de paire mais se telechargent separement : un tailleur
 * imprime volontiers les mesures et garde les visuels a l'ecran, ou les
 * transmet a des personnes differentes. Les melanger dans un seul fichier
 * aurait force l'impression des photos a chaque fois, ce qui coute cher en
 * encre pour un document dont l'essentiel est une liste de chiffres.
 *
 * Meme mecanique que l'autre fiche : mise en page HTML pilotee par
 * `@media print`, puis « Enregistrer en PDF » du navigateur.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { getSelection } from "@/lib/selection";
import { useAuth } from "@/components/AuthProvider";
import { Button, EmptyState, Field, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconModels } from "@/components/icons";

/*
 * Notes personnelles POUR CHAQUE MODELE (preferences, ajustements,
 * instructions de couture). Elles vivent dans `localStorage`, comme la
 * selection de modeles (`src/lib/selection.ts`) : cet eco n'appartient qu'au
 * navigateur et a l'edition de la fiche, rien qui doive etre persiste cote
 * serveur. Structure : un objet `{ [idModele]: note }`. On garde ces helpers
 * ici, sans toucher a `src/lib/**` (fichier partage, hors champ).
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

export default function FicheModeles() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [models, setModels] = useState<GarmentModel[] | null>(null);
  // Preferences par modele : `{ [idModele]: texte }`.
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setNotes(readNotes());
  }, []);

  const setModelNote = (modelId: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text.trim()) next[modelId] = text;
      else delete next[modelId];
      writeNotes(next);
      return next;
    });
  };

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
    // toute la fiche.
    Promise.all(ids.map((mid) => CatalogApi.model(mid).catch(() => null))).then((list) =>
      setModels(list.filter((m): m is GarmentModel => m !== null))
    );
  }, []);

  if (measurement === undefined || models === null) {
    return <Spinner label="Préparation de la fiche…" />;
  }

  if (!models.length) {
    return (
      <>
        <PageHeader title="Fiche des modèles" back />
        <div className="container section">
          <EmptyState
            icon={<IconModels size={30} strokeWidth={1.6} />}
            title="Aucun modèle retenu"
            body="Ajoutez un ou plusieurs modèles à votre sélection depuis le catalogue, puis revenez ici."
            action={
              <Link href="/modeles">
                <Button>Parcourir les modèles</Button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const editee = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader title="Fiche des modèles" back />

      <div className="container section">
        <div className="ficheSwitch no-print">
          <span>
            Ce document ne contient que les modèles.{" "}
            {measurement && (
              <Link href={`/mesures/${measurement.id}/fiche`}>
                Télécharger la fiche de mesures
              </Link>
            )}{" "}
            séparément.
          </span>
        </div>

        <div className="ficheActions no-print">
          <Button block onClick={() => window.print()}>
            Enregistrer en PDF
          </Button>
          <p className="fieldHint" style={{ textAlign: "center" }}>
            Dans la fenêtre qui s&apos;ouvre, choisissez «&nbsp;Enregistrer au format
            PDF&nbsp;» comme destination.
          </p>
        </div>

        <div className="ficheNotesEditor no-print">
          <div className="rowLabel" style={{ marginBottom: 4 }}>
            Vos préférences par modèle
          </div>
          <p className="fieldHint" style={{ marginBottom: 12 }}>
            Ajustements, tissu, finitions, instructions de couture : ce que vous écrivez pour chaque
            modèle sera imprimé sur la fiche, juste sous le modèle correspondant.
          </p>
          <div className="ficheNotesList">
            {models.map((m) => (
              <Field key={m.id} label={m.name}>
                <Textarea
                  rows={3}
                  placeholder="Ex. : manches plus courtes, ourlet à 3 cm, boutons de couleur…"
                  value={notes[m.id] ?? ""}
                  onChange={(e) => setModelNote(m.id, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </div>

        <article className="fiche">
          <header className="ficheHeader">
            <div>
              <span className="ficheBrand">Sur-MeZur</span>
              <h1 className="ficheTitle">
                {models.length > 1 ? "Modèles à coudre" : "Modèle à coudre"}
              </h1>
            </div>
            <div className="ficheMeta">
              {user?.full_name && (
                <div>
                  <strong>{user.full_name}</strong>
                </div>
              )}
              <div>Fiche éditée le {editee}</div>
              {measurement && <div>Prise de mesures n&deg;{measurement.version}</div>}
            </div>
          </header>

          {models.map((m) => (
            <section key={m.id} className="ficheModelBlock">
              {m.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photo_url} alt="" className="ficheModelImage" />
              ) : (
                <span
                  className="ficheModelImage"
                  style={{ background: m.thumbnail_color }}
                  aria-hidden
                />
              )}
              <div className="ficheModelBody">
                <h2 className="ficheModelName">{m.name}</h2>
                {m.category?.name && <p className="ficheModelCat">{m.category.name}</p>}
                {m.description && <p className="ficheModelDesc">{m.description}</p>}
                {m.style_tags?.length > 0 && (
                  <p className="ficheModelTags">{m.style_tags.join(" · ")}</p>
                )}
                {notes[m.id] && (
                  <div className="ficheModelNote">
                    <span className="ficheModelNoteLabel">Vos préférences</span>
                    <p className="ficheModelNoteText">{notes[m.id]}</p>
                  </div>
                )}
              </div>
            </section>
          ))}

          <footer className="ficheFooter">
            À présenter au tailleur avec la fiche de mesures, qui se télécharge séparément.
          </footer>
        </article>
      </div>
    </>
  );
}
