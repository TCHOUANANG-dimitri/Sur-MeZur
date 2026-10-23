"use client";

/**
 * Patron genere (B3.7) : le patron assemble (a la largeur de l'ecran ; le
 * pincement du navigateur suffit pour zoomer), trois PDF a telecharger
 * (fiche de tracage cotee, patron 1:1 en pages A4, patron 1:1 pleine page),
 * liste des pieces, controles et remarques. En cours de generation : le
 * statut est interroge toutes les 2 s.
 *
 * Pour couper, ce sont les PDF (la fiche de tracage d'abord) : le dessin a
 * l'ecran n'est qu'un apercu. Plus d'impression navigateur : elle ne donnait
 * que les mesures, ou des pages blanches.
 */

const PDFS: { type: string; label: [string, string]; aide: [string, string] }[] = [
  { type: "tracage", label: ["Fiche de traçage", "Tracing sheet"], aide: ["une page par pièce, avec les cotes", "one page per piece, with measurements"] },
  { type: "a4", label: ["Patron A4 à assembler", "A4 pattern to assemble"], aide: ["taille réelle, imprimer à 100 %", "full size, print at 100%"] },
  { type: "plein", label: ["Patron pleine taille", "Full-size pattern"], aide: ["une grande page (traceur, imprimerie)", "one large page (plotter, print shop)"] },
];

import { langue, tr } from "@/lib/i18n";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TailorApi, garmentLabel } from "@/lib/api/tailor";
import type { TailorPattern } from "@/lib/api/tailor";
import { Button, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { PatternBadge } from "../../_components";

const cm = (v: number) => {
  const s = v.toFixed(1);
  return `${langue() === "en" ? s : s.replace(".", ",")} cm`;
};

export default function PatronDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pattern, setPattern] = useState<TailorPattern | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
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
      .catch((e) => alive && setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load.")));
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
      .catch(() => alive && setError(tr("Patron indisponible.", "Pattern unavailable.")));
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
      setError(e instanceof Error ? e.message : tr("Téléchargement impossible.", "Could not download."));
    } finally {
      setTelechargement("");
    }
  }

  async function remove() {
    if (!id || !window.confirm(tr("Supprimer ce patron ?", "Delete this pattern?"))) return;
    try {
      await TailorApi.deletePattern(id);
      router.replace("/tailleur/patrons");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  if (!pattern) {
    return (
      <>
        <PageHeader title={tr("Patron", "Pattern")} back />
        {error ? <ErrorBanner message={error} /> : <Spinner />}
      </>
    );
  }

  const nomVetement = pattern.base_label ?? garmentLabel(pattern.garment_type);

  return (
    <div className="tPage">
      <PageHeader title={`${tr("Patron", "Pattern")} — ${nomVetement}`} back />
      <ErrorBanner message={error} />
      <p>
        <PatternBadge status={pattern.status} />
      </p>

      {pattern.status === "pending" && (
        <Spinner label={tr("Génération en cours…", "Generating…")} />
      )}
      {pattern.status === "failed" && (
        <p className="muted">{pattern.error_message || tr("La génération a échoué.", "Generation failed.")}</p>
      )}

      {pattern.status === "ready" && (
        <>
          {pattern.pdf_types && pattern.pdf_types.length > 0 && (
            <section aria-label={tr("Télécharger le patron", "Download the pattern")} className="no-print" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {PDFS.filter((d) => pattern.pdf_types?.includes(d.type)).map((d) => (
                <div key={d.type}>
                  <Button variant={d.type === "tracage" ? "primary" : "secondary"} block
                          onClick={() => telecharger(d.type)} disabled={telechargement === d.type}>
                    {telechargement === d.type ? tr("Téléchargement…", "Downloading…") : `${tr(...d.label)} (PDF)`}
                  </Button>
                  <span className="muted" style={{ fontSize: 13 }}>{tr(...d.aide)}</span>
                </div>
              ))}
            </section>
          )}
          <div className="tSvgFrame">
            {svgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgUrl} alt={`Patron ${nomVetement}`} />
            ) : (
              <Spinner />
            )}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {tr("Aperçu : pour couper, utilisez les PDF.", "Preview: use the PDFs to cut.")}
          </p>
          {pattern.pieces && pattern.pieces.length > 0 && (
            <section aria-label={tr("Pièces du patron", "Pattern pieces")}>
              <h2 style={{ fontSize: 18 }}>{tr("Pièces", "Pieces")} ({pattern.pieces.length})</h2>
              <ul>
                {(pattern.piecesDetail ?? []).map((piece) => (
                  <li key={piece.nom}>
                    <strong>{piece.nom}</strong>
                    {piece.consigne ? ` — ${piece.consigne}` : piece.quantite > 1 ? ` — ${tr("couper", "cut")} ${piece.quantite}` : ""}
                    {piece.largeur_cm > 0 && ` — ${cm(piece.largeur_cm)} × ${cm(piece.hauteur_cm)}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pattern.controles && pattern.controles.some((c) => c.statut === "a_verifier" || c.statut === "echec") && (
            <section aria-label={tr("À vérifier", "To check")}>
              <h2 style={{ fontSize: 18 }}>{tr("À vérifier", "To check")}</h2>
              <ul>
                {pattern.controles.filter((c) => c.statut === "a_verifier" || c.statut === "echec").map((c) => (
                  <li key={c.controle}>{c.controle} : {c.detail}</li>
                ))}
              </ul>
            </section>
          )}
          {((pattern.remarques?.length ?? 0) > 0 || pattern.controles?.some((c) => c.statut === "info")) && (
            <section aria-label={tr("À savoir", "Notes")}>
              <h2 style={{ fontSize: 18 }}>{tr("À savoir", "Notes")}</h2>
              <ul>
                {pattern.controles?.filter((c) => c.statut === "info").map((c) => (
                  <li key={c.controle}>{c.controle} : {c.detail}</li>
                ))}
                {pattern.remarques?.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </section>
          )}
          <div>
            <Button variant="ghost" onClick={remove}>{tr("Supprimer ce patron", "Delete pattern")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
