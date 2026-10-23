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
import { PatternBadge } from "../../_components";

const LIBELLES_GARMENT: Record<string, string> = {
  jupe: "Jupe", robe: "Robe", kaba: "Kaba", haut: "Haut / blouse", tunique: "Tunique homme",
  pantalon: "Pantalon", chemise: "Chemise", boubou: "Boubou", agbada: "Agbada",
};

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

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

  const nomVetement = pattern.base_label ?? LIBELLES_GARMENT[pattern.garment_type] ?? pattern.garment_type;

  return (
    <div className="tPage">
      <PageHeader title={`Patron — ${nomVetement}`} back />
      <ErrorBanner message={error} />
      <p>
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
          <div className="tSvgFrame">
            {svgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgUrl} alt={`Patron ${nomVetement}`} />
            ) : (
              <Spinner label="Chargement du patron…" />
            )}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Aperçu à l&apos;écran : pour couper, utilisez les PDF. Pincez l&apos;image pour l&apos;agrandir.
          </p>
          {pattern.pieces && pattern.pieces.length > 0 && (
            <section aria-label="Pièces du patron">
              <h2 style={{ fontSize: 18 }}>Pièces ({pattern.pieces.length})</h2>
              <ul>
                {(pattern.piecesDetail ?? []).map((piece) => (
                  <li key={piece.nom}>
                    <strong>{piece.nom}</strong>
                    {piece.consigne ? ` — ${piece.consigne}` : piece.quantite > 1 ? ` — couper ${piece.quantite}` : ""}
                    {piece.largeur_cm > 0 && ` — ${cm(piece.largeur_cm)} × ${cm(piece.hauteur_cm)} (fini)`}
                  </li>
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
          <div>
            <Button variant="ghost" onClick={remove}>Supprimer ce patron</Button>
          </div>
        </>
      )}
    </div>
  );
}
