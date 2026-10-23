"use client";

/**
 * Patrons a partir d'une photo (B3.7) : liste et historique. La generation
 * cote serveur est une version « apercu », qui sera amelioree plus tard :
 * c'est rappele sur chaque ecran.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi, garmentLabel } from "@/lib/api/tailor";
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
        setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
        setPatterns([]);
      });
  }, []);

  async function remove(id: string) {
    if (!window.confirm(tr("Supprimer ce patron ?", "Delete this pattern?"))) return;
    try {
      await TailorApi.deletePattern(id);
      setPatterns((list) => list?.filter((p) => p.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  return (
    <div className="tPage">
      <PageHeader
        title={tr("Patrons", "Patterns")}
        action={
          <Link href="/tailleur/patrons/nouveau" className="btn btnSecondary">
            {tr("+ Nouveau", "+ New")}
          </Link>
        }
      />
      <ErrorBanner message={error} />
      {patterns === null ? (
        <Spinner />
      ) : patterns.length === 0 ? (
        <EmptyState
          icon={<IconTailor size={30} strokeWidth={1.6} />}
          title={tr("Aucun patron", "No patterns")}
          action={
            <Link href="/tailleur/patrons/nouveau">
              <Button>{tr("Créer un patron", "Create a pattern")}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="tList">
          {patterns.map((p) => (
            <li key={p.id} className="tRow">
              <Link href={`/tailleur/patrons/${p.id}`} className="tRowMain" style={{ textDecoration: "none", color: "inherit" }}>
                <span className="tRowTitle">{p.base_label ?? garmentLabel(p.garment_type)}</span>
                <br />
                <span className="tRowSub">{formatDateFR(p.created_at)}</span>
              </Link>
              <PatternBadge status={p.status} />
              <Button variant="ghost" onClick={() => void remove(p.id)} aria-label={tr("Supprimer", "Delete")}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
