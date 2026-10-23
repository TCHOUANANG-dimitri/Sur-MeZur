"use client";

/**
 * Fiche de mesures partagee (lecture seule, sans compte).
 *
 * Lien genere par le tailleur (`POST /api/tailor/clients/{id}/share`), qui
 * expire. En simulation locale (`NEXT_PUBLIC_TAILOR_MOCK=1`), le contenu est
 * relu depuis le stockage local du navigateur du tailleur.
 */

import { locale, tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { IconMeasure } from "@/components/icons";

interface SharedFiche {
  client: { name: string } | null;
  measurement: { data: Record<string, number>; height_cm: number } | null;
  expires_at: string;
}

export default function FichePartagee() {
  const { token } = useParams<{ token: string }>();
  const [fiche, setFiche] = useState<SharedFiche | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/fiches/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      // L'API renvoie `full_name` et l'historique `measurements` (le plus
      // recent en premier) ; la page affiche la derniere mesure.
      .then((data: Record<string, unknown> & Partial<SharedFiche>) => {
        if (data.client !== undefined) return setFiche(data as SharedFiche);
        const latest = Array.isArray(data.measurements) ? data.measurements[0] : null;
        setFiche({
          client: typeof data.full_name === "string" ? { name: data.full_name } : null,
          measurement: latest ? { data: latest.data ?? {}, height_cm: latest.height_cm ?? 0 } : null,
          expires_at: String(data.expires_at ?? ""),
        });
      })
      .catch(() => {
        // Repli simulation locale : le lien a ete cree dans ce navigateur.
        try {
          const raw = localStorage.getItem("smz_tailor_mock_shares_v1");
          const shares = raw ? (JSON.parse(raw) as Record<string, SharedFiche>) : {};
          const found = shares[token];
          if (found) {
            if (new Date(found.expires_at).getTime() < Date.now()) {
              setError(tr("Lien expiré. Demandez-en un nouveau.", "Link expired. Ask for a new one."));
              setFiche(null);
            } else {
              setFiche(found);
            }
            return;
          }
        } catch {
          /* ignore */
        }
        setError(tr("Lien invalide ou expiré.", "Invalid or expired link."));
        setFiche(null);
      });
  }, [token]);

  if (fiche === undefined) return <Spinner />;

  if (fiche === null || !fiche.measurement) {
    return (
      <main className="containerNarrow section">
        <ErrorBanner message={error} />
        <EmptyState
          icon={<IconMeasure size={30} strokeWidth={1.6} />}
          title={tr("Fiche indisponible", "Sheet unavailable")}
          action={
            <Link href="/" className="btn btnSecondary">
              {tr("Retour à l'accueil", "Back to home")}
            </Link>
          }
        />
      </main>
    );
  }

  const editee = new Date().toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="container section">
      <article className="fiche" aria-label={tr("Fiche de mesures", "Measurement sheet")}>
        <header className="ficheHeader">
          <div>
            <span className="ficheBrand">Sur-MeZur</span>
            <h1 className="ficheTitle">
              {tr("Fiche de mesures", "Measurement sheet")}{fiche.client ? ` — ${fiche.client.name}` : ""}
            </h1>
          </div>
          <div className="ficheMeta">
            <div>{tr(`Éditée le ${editee}`, `Issued ${editee}`)}</div>
            <div>{tr("Taille", "Height")} : {fiche.measurement.height_cm} cm</div>
          </div>
        </header>
        {presentableGroups(fiche.measurement.data).map((group) => (
          <section key={group.id}>
            <h2 className="measureGroupTitle">{group.title}</h2>
            <div className="measureList">
              {group.items.map(({ key, info, value }) => (
                <div key={key} className="measureItem">
                  <div className="measureItemHead">
                    <span className="measureName">{info.label}</span>
                    <span className="measureValue">{formatCm(value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <footer className="ficheFooter">
          {tr("Lien en lecture seule, expire le", "Read-only link, expires")}{" "}
          {new Date(fiche.expires_at).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" })}.
        </footer>
      </article>
      <p className="no-print" style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/" className="authLink">{tr("Découvrir Sur-MeZur", "Discover Sur-MeZur")}</Link>
      </p>
    </main>
  );
}
