"use client";

/**
 * Patron genere (B3.7) : affichage du SVG zoomable, impression A4 en tuiles
 * (impression navigateur), liste des pieces. En cours de generation : le
 * statut est interroge toutes les 2 s.
 *
 * Moteur GarmentCode : trois PDF a telecharger (fiche de tracage cotee,
 * patron 1:1 en pages A4, patron 1:1 pleine page), consigne de coupe par
 * piece, controles et remarques. Moteur apercu : bandeau « Apercu ».
 */

const PDFS: { type: string; label: string; aide: string }[] = [
  { type: "tracage", label: "Fiche de traçage", aide: "une page par pièce : cotes et points à reporter à la craie" },
  { type: "a4", label: "Patron A4 à assembler", aide: "taille réelle, à imprimer à 100 % et à coller" },
  { type: "plein", label: "Patron pleine taille", aide: "une seule grande page, pour un traceur ou une imprimerie" },
];

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
  const [telechargement, setTelechargement] = useState("");

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

  async function telecharger(type: string) {
    if (!id) return;
    setTelechargement(type);
    try {
      await TailorApi.downloadPatternPdf(id, type);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Téléchargement impossible.");
    } finally {
      setTelechargement("");
    }
  }

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
      <PageHeader title={`Patron — ${pattern.base_label ?? pattern.garment_type}`} back />
      <ErrorBanner message={error} />
      <p>
        {pattern.engine !== "garmentcode-v1" && (
          <><span className="tPreviewBadge">Aperçu — patron indicatif</span>{" "}</>
        )}
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
          {pattern.pdf_types && pattern.pdf_types.length > 0 && (
            <section aria-label="Télécharger le patron" className="no-print" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {PDFS.filter((d) => pattern.pdf_types?.includes(d.type)).map((d) => (
                <div key={d.type}>
                  <Button variant={d.type === "tracage" ? "primary" : "secondary"} block
                          onClick={() => telecharger(d.type)} disabled={telechargement === d.type}>
                    {telechargement === d.type ? "Téléchargement…" : `${d.label} (PDF)`}
                  </Button>
                  <span className="muted" style={{ fontSize: 13 }}>{d.aide}</span>
                </div>
              ))}
            </section>
          )}
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
                  <li key={piece}>{piece}{pattern.consignes?.[piece] ? ` — ${pattern.consignes[piece]}` : ""}</li>
                ))}
              </ul>
            </section>
          )}
          {pattern.controles && pattern.controles.some((c) => c.statut === "a_verifier" || c.statut === "echec") && (
            <section aria-label="Points à vérifier">
              <h2 style={{ fontSize: 18 }}>À vérifier</h2>
              <ul>
                {pattern.controles.filter((c) => c.statut === "a_verifier" || c.statut === "echec").map((c) => (
                  <li key={c.controle}>{c.controle} : {c.detail}</li>
                ))}
              </ul>
            </section>
          )}
          {((pattern.remarques?.length ?? 0) > 0 || pattern.controles?.some((c) => c.statut === "info")) && (
            <section aria-label="À savoir">
              <h2 style={{ fontSize: 18 }}>À savoir</h2>
              <ul>
                {pattern.controles?.filter((c) => c.statut === "info").map((c) => (
                  <li key={c.controle}>{c.controle} : {c.detail}</li>
                ))}
                {pattern.remarques?.map((r) => <li key={r}>{r}</li>)}
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
