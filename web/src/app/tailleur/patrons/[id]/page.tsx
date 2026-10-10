"use client";

/**
 * Patron genere (B3.7) : affichage du SVG zoomable, impression A4 en tuiles
 * (impression navigateur), liste des pieces. Bandeau « Apercu » rappele en
 * tete. En cours de generation : le statut est interroge toutes les 2 s.
 */

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorPattern } from "@/lib/api/tailor";
import { Button, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconPrint } from "@/components/icons";
import { PatternBadge } from "../../_components";

export default function PatronDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pattern, setPattern] = useState<TailorPattern | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return null;
    const p = await TailorApi.pattern(id);
    setPattern(p);
    return p;
  }, [id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    load()
      .then((p) => {
        if (!alive || !p) return;
        if (p.status === "pending") {
          timer = setInterval(() => {
            void load().then((current) => {
              if (current && current.status !== "pending" && timer) clearInterval(timer);
            });
          }, 2000);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible."));
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!id || pattern?.status !== "ready") return;
    let revoke: string | null = null;
    let alive = true;
    TailorApi.patternSvgUrl(id)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        revoke = url;
        setSvgUrl(url);
      })
      .catch(() => alive && setError("Patron indisponible."));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id, pattern?.status]);

  async function remove() {
    if (!id || !window.confirm("Supprimer ce patron ?")) return;
    try {
      await TailorApi.deletePattern(id);
      router.replace("/tailleur/patrons");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  if (!pattern) {
    return (
      <>
        <PageHeader title="Patron" back />
        {error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}
      </>
    );
  }

  return (
    <div className="tPage">
      <PageHeader title={`Patron — ${pattern.garment_type}`} back />
      <ErrorBanner message={error} />
      <p>
        <span className="tPreviewBadge">Aperçu — la génération à partir de l&apos;image s&apos;améliore bientôt</span>{" "}
        <PatternBadge status={pattern.status} />
      </p>

      {pattern.status === "pending" && (
        <Spinner label="Génération en cours… Le patron s'affichera ici." />
      )}
      {pattern.status === "failed" && (
        <p className="muted">{pattern.error_message || "La génération a échoué."}</p>
      )}

      {pattern.status === "ready" && (
        <>
          <div className="tZoomRow no-print">
            <Button variant="secondary" onClick={() => setZoom((z) => Math.max(50, z - 25))} aria-label="Réduire">−</Button>
            <span className="tRowSub">{zoom} %</span>
            <Button variant="secondary" onClick={() => setZoom((z) => Math.min(300, z + 25))} aria-label="Agrandir">+</Button>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => window.print()}>
              <IconPrint size={18} aria-hidden /> Imprimer (A4)
            </Button>
          </div>
          <div className="tSvgFrame">
            {svgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgUrl} alt={`Patron ${pattern.garment_type}`} style={{ width: `${zoom}%` }} />
            ) : (
              <Spinner label="Chargement du patron…" />
            )}
          </div>
          {pattern.pieces && pattern.pieces.length > 0 && (
            <section aria-label="Pièces du patron">
              <h2 style={{ fontSize: 18 }}>Pièces ({pattern.pieces.length})</h2>
              <ul>
                {pattern.pieces.map((piece) => (
                  <li key={piece}>{piece}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="no-print">
            <Button variant="ghost" onClick={remove}>Supprimer ce patron</Button>
          </div>
        </>
      )}
    </div>
  );
}
