"use client";

// Diagnostic d'une analyse (9.2) : photos si consentement, message renvoye,
// mesure produite.

import Link from "next/link";
import { useParams } from "next/navigation";
import { Measure, type SessionDiagnostic } from "@/lib/api/admin";
import { AuthImage, ErrorState, Loading, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { formatDateTime, measureLabel } from "@/components/admin/format";

const STATUS = {
  processing: { label: "En cours", tone: "pending" as const },
  ready: { label: "Réussie", tone: "success" as const },
  failed: { label: "Échouée", tone: "error" as const },
};

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const diag = useLoad<SessionDiagnostic>(() => Measure.session(id), [id]);

  if (diag.error) {
    return (
      <div className="adPage">
        <PageHead title="Analyse" back={{ href: "/admin/mesure", label: "Mesure" }} />
        <ErrorState error={diag.error} onRetry={diag.reload} />
      </div>
    );
  }
  if (!diag.data) return <div className="adPage"><Loading /></div>;
  const d = diag.data;

  return (
    <div className="adPage">
      <PageHead
        title={`Analyse du ${formatDateTime(d.created_at)}`}
        sub={<StatusBadge map={STATUS} value={d.status} />}
        back={{ href: "/admin/mesure", label: "Mesure" }}
      />
      <div className="adGrid2">
        <Panel title="Déroulement">
          <dl>
            <div className="adKv"><dt>Support</dt><dd>{d.platform === "web" ? "Site web" : "Application"}</dd></div>
            <div className="adKv"><dt>Durée</dt><dd>{d.duration_s == null ? "—" : `${d.duration_s} s`}</dd></div>
            <div className="adKv"><dt>Taille / poids / sexe</dt><dd>{d.height_cm ?? "—"} cm · {d.weight_kg ?? "—"} kg · {d.gender ?? "—"}</dd></div>
            <div className="adKv"><dt>Compte</dt><dd>{d.user ? <Link href={`/admin/utilisateurs/${d.user.id}`}>{d.user.full_name}{d.user.is_guest ? " (invité)" : ""}</Link> : "—"}</dd></div>
            <div className="adKv"><dt>Message renvoyé</dt><dd>{d.error_message ?? "—"}</dd></div>
          </dl>
        </Panel>
        <Panel title="Photos">
          {!d.photo_consent ? (
            <p className="adHint">Pas de consentement : les photos ne sont pas montrées, même à l&apos;équipe.</p>
          ) : (
            <div className="adDocGrid">
              {d.front_photo_url && <figure className="adDoc"><AuthImage src={d.front_photo_url} alt="Photo de face" /><figcaption>Face</figcaption></figure>}
              {d.side_photo_url && <figure className="adDoc"><AuthImage src={d.side_photo_url} alt="Photo de profil" /><figcaption>Profil</figcaption></figure>}
              {!d.front_photo_url && !d.side_photo_url && <p className="adHint">Photos supprimées ou indisponibles.</p>}
            </div>
          )}
        </Panel>
      </div>
      {d.measurement && (
        <Panel title="Mesure produite">
          <dl className="adMeasureGrid">
            {Object.entries(d.measurement.data).map(([k, v]) => (
              <div className="adKv" key={k}><dt>{measureLabel(k)}</dt><dd>{v} cm</dd></div>
            ))}
          </dl>
        </Panel>
      )}
    </div>
  );
}
