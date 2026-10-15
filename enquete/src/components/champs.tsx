"use client";

/**
 * Champs du questionnaire. Penses pour un telephone : gros boutons, choix en
 * pastilles plutot qu'en listes deroulantes, clavier numerique pour les cm.
 */

import { useRef, useState } from "react";
import type { Choice } from "@/lib/questionnaire";
import { photoSrc, type Photo } from "@/lib/api";
import { preparePhoto, UnreadablePhotoError } from "@/lib/imageCompress";
import { IconAddPhoto, IconDelete } from "./icons";
import { Chip, ErrorBanner } from "./ui";

/** Nombre (cm, kg, h...) : vide = null, jamais 0 par defaut. */
export function Nombre({
  value,
  onChange,
  unite,
  min = 0,
  max = 400,
  placeholder,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  unite?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [texte, setTexte] = useState(value == null ? "" : String(value).replace(".", ","));
  return (
    <div className="nombre">
      <input
        className="input"
        inputMode="decimal"
        placeholder={placeholder ?? "—"}
        aria-label={ariaLabel}
        value={texte}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.,]/g, "");
          setTexte(t);
          const n = parseFloat(t.replace(",", "."));
          onChange(Number.isFinite(n) && n >= min && n <= max ? n : null);
        }}
      />
      {unite && <span className="unite">{unite}</span>}
    </div>
  );
}

export function ChoixUnique({
  choix,
  value,
  onChange,
}: {
  choix: Choice[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="chipRow">
      {choix.map((c) => (
        <Chip key={c.value} type="button" active={value === c.value} onClick={() => onChange(value === c.value ? undefined : c.value)}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
}

export function ChoixMultiple({
  choix,
  value,
  onChange,
}: {
  choix: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="chipRow">
      {choix.map((c) => {
        const actif = value.includes(c);
        return (
          <Chip key={c} type="button" active={actif} onClick={() => onChange(actif ? value.filter((x) => x !== c) : [...value, c])}>
            {c}
          </Chip>
        );
      })}
    </div>
  );
}

/** Grille de photos d'un type donne + bouton d'ajout (appareil photo ou galerie). */
export function Photos({
  titre,
  aide,
  photos,
  onAjouter,
  onSupprimer,
  lectureSeule,
}: {
  titre: string;
  aide?: string;
  photos: Photo[];
  onAjouter: (f: File) => Promise<void>;
  onSupprimer: (p: Photo) => Promise<void>;
  lectureSeule?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(0);
  const [erreur, setErreur] = useState("");

  async function choisir(files: FileList | null) {
    if (!files?.length) return;
    setErreur("");
    const liste = Array.from(files);
    setEnvoi((n) => n + liste.length);
    for (const f of liste) {
      try {
        await onAjouter(await preparePhoto(f));
      } catch (e) {
        setErreur(e instanceof UnreadablePhotoError ? "Cette photo ne peut pas être lue. Choisissez-en une autre." : (e as Error).message);
      } finally {
        setEnvoi((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="photos">
      <div className="photosTitre">
        <strong>{titre}</strong>
        {aide && <span className="fieldHint">{aide}</span>}
      </div>
      <ErrorBanner message={erreur} />
      <div className="photosGrille">
        {photos.map((p) => (
          <div key={p.id} className="photoCase">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(p.url)} alt={p.legende ?? titre} loading="lazy" />
            {!lectureSeule && (
              <button type="button" className="photoSuppr" aria-label="Supprimer la photo" onClick={() => void onSupprimer(p)}>
                <IconDelete size={16} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: envoi }, (_, i) => (
          <div key={`e${i}`} className="photoCase photoEnvoi">
            <div className="spinner" aria-label="Envoi en cours" />
          </div>
        ))}
        {!lectureSeule && (
          <button type="button" className="photoCase photoAjout" onClick={() => input.current?.click()}>
            <IconAddPhoto size={26} aria-hidden />
            <span>Ajouter</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void choisir(e.target.files)}
      />
    </div>
  );
}
