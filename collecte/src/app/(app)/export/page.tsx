"use client";

/**
 * Export de la campagne (administrateur). Les fichiers sont produits par le
 * serveur (backend/app/services/collecte_export.py) ; cette page ne fait que
 * choisir le filtre et le format, puis declencher le telechargement.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button, Chip, ErrorBanner, InfoBanner, PageHeader } from "@/components/ui";
import { IconArchive, IconInfo, IconJson, IconSheet } from "@/components/icons";
import { CollecteApi } from "@/lib/api/collecte";
import { friendlyError } from "@/lib/retry";

const FILTERS = [
  { id: "non_rejected", label: "Toutes sauf rejetées" },
  { id: "validated", label: "Validées seulement" },
  { id: "pending", label: "À relire" },
  { id: "all", label: "Toutes" },
];

interface ExportKind {
  id: string;
  title: string;
  body: string;
  query: string;
  file: string;
  Icon: React.ComponentType<{ size?: number }>;
}

const KINDS: ExportKind[] = [
  {
    id: "zip",
    title: "Archive complète (ZIP)",
    body: "sujets.json au format du banc d'essai, tableaux CSV, et toutes les photos nommées par code (SMZ-0001_face.jpg…).",
    query: "format=zip&photos=true",
    file: "collecte-surmezur.zip",
    Icon: IconArchive,
  },
  {
    id: "zip-light",
    title: "Archive sans photos (ZIP)",
    body: "Les mêmes fichiers de données, sans les images : léger, pour un point rapide.",
    query: "format=zip&photos=false",
    file: "collecte-surmezur-donnees.zip",
    Icon: IconArchive,
  },
  {
    id: "excel",
    title: "Tableau pour Excel (CSV)",
    body: "Point-virgule et virgule décimale : s'ouvre d'un double-clic dans Excel en français.",
    query: "format=csv&excel=true",
    file: "collecte-surmezur-excel.csv",
    Icon: IconSheet,
  },
  {
    id: "csv",
    title: "Tableau standard (CSV)",
    body: "Virgule et point décimal, pour pandas, R ou un script.",
    query: "format=csv",
    file: "collecte-surmezur.csv",
    Icon: IconSheet,
  },
  {
    id: "json",
    title: "sujets.json (banc d'essai)",
    body: "Fiches complètes uniquement, au format de ml/bench/nouveaux_sujets_exemple.json.",
    query: "format=json",
    file: "sujets.json",
    Icon: IconJson,
  },
];

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Export() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState("non_rejected");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/tableau-de-bord");
  }, [loading, isAdmin, router]);

  async function run(kind: ExportKind) {
    setBusy(kind.id);
    setError("");
    try {
      const blob = await CollecteApi.exportFile(`${kind.query}&statut=${filter}`);
      const stamp = new Date().toISOString().slice(0, 10);
      saveBlob(blob, kind.file.replace(/(\.[a-z]+)$/, `-${stamp}$1`));
    } catch (e) {
      setError(friendlyError(e, "réessayez"));
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <>
      <PageHeader title="Export" />
      <div className="containerNarrow section stack">
        <div className="field">
          <span className="fieldLabel">Fiches à inclure</span>
          <div className="chipRow chipRowWrap">
            {FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>
        </div>

        <ErrorBanner message={error} />

        {KINDS.map((k) => (
          <section key={k.id} className="card exportCard">
            <span className="exportIcon">
              <k.Icon size={22} />
            </span>
            <div className="exportText">
              <strong>{k.title}</strong>
              <span className="muted small">{k.body}</span>
            </div>
            <Button className="btnSmall" onClick={() => void run(k)} disabled={busy !== null}>
              {busy === k.id ? "Préparation…" : "Télécharger"}
            </Button>
          </section>
        ))}

        <InfoBanner>
          <IconInfo size={16} aria-hidden /> Pour entraîner le modèle, le plus simple est de synchroniser la campagne sur
          le poste de travail : <code>python ml/scripts/telecharger_collecte.py</code> ne télécharge que les photos
          nouvelles ou modifiées et range tout dans <code>ml/data/collecte/</code>. Les noms des volontaires ne sont
          jamais exportés.
        </InfoBanner>
      </div>
    </>
  );
}
