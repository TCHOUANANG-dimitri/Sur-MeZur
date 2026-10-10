"use client";

/**
 * Patrons a partir d'une photo (B3.7) : liste et historique. La generation
 * cote serveur est une version « apercu », qui sera amelioree plus tard :
 * c'est rappele sur chaque ecran.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorPattern } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconTailor } from "@/components/icons";
import { PatternBadge, formatDateFR } from "../_components";

export default function Patrons() {
  const [patterns, setPatterns] = useState<TailorPattern[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    TailorApi.patterns()
      .then(setPatterns)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Chargement impossible.");
        setPatterns([]);
      });
  }, []);

  async function remove(id: string) {
    if (!window.confirm("Supprimer ce patron ?")) return;
    try {
      await TailorApi.deletePattern(id);
      setPatterns((list) => list?.filter((p) => p.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  return (
    <div className="tPage">
      <PageHeader
        title="Patrons"
        action={
          <Link href="/tailleur/patrons/nouveau" className="btn btnSecondary">
            + Nouveau
          </Link>
        }
      />
      <ErrorBanner message={error} />
      <p><span className="tPreviewBadge">Aperçu — la génération à partir de l&apos;image s&apos;améliore bientôt</span></p>
      {patterns === null ? (
        <Spinner label="Chargement…" />
      ) : patterns.length === 0 ? (
        <EmptyState
          icon={<IconTailor size={30} strokeWidth={1.6} />}
          title="Aucun patron"
          body="Photographiez un modèle : recevez les pièces du patron."
          action={
            <Link href="/tailleur/patrons/nouveau">
              <Button>Créer un patron</Button>
            </Link>
          }
        />
      ) : (
        <ul className="tList">
          {patterns.map((p) => (
            <li key={p.id} className="tRow">
              <Link href={`/tailleur/patrons/${p.id}`} className="tRowMain" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="tRowTitle">{p.garment_type}</span>
                <br />
                <span className="tRowSub">{formatDateFR(p.created_at)}</span>
              </Link>
              <PatternBadge status={p.status} />
              <Button variant="ghost" onClick={() => void remove(p.id)} aria-label={`Supprimer le patron ${p.garment_type}`}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
