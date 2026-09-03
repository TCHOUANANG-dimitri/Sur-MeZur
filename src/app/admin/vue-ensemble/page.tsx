"use client";

// Vue d'ensemble de l'admin : compteurs de la plateforme, activite financiere
// et repartition des commandes par statut. Source : `AdminApi.stats()`.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminApi, type AdminStats } from "@/lib/api/endpoints";
import { Badge, Card, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { formatFcfa } from "@/components/admin/format";

const STATUS_LABEL: Record<string, string> = {
  new: "Nouvelle",
  in_progress: "En cours",
  ready_for_pickup: "Prête à retirer",
  finished_delivered: "Terminée et livrée",
  finished_not_delivered: "Terminée non livrée",
};

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    AdminApi.stats()
      .then((s) => active && setStats(s))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  if (!stats && !error) return <Spinner label="Chargement des statistiques…" />;

  const maxStatus = Math.max(1, ...Object.values(stats?.orders_by_status ?? {}));
  const entries = Object.entries(stats?.orders_by_status ?? {});

  return (
    <div className="container">
      <PageHeader title="Vue d'ensemble" />
      <div className="section">
        <ErrorBanner message={error} />

        {stats && (stats.tailors_pending > 0 || stats.open_disputes > 0) && (
          <Card className="adminStack" style={{ marginBottom: 14 }}>
            <div className="rowLabel">À traiter</div>
            {stats.tailors_pending > 0 && (
              <Link href="/admin/verifications" className="muted">
                {stats.tailors_pending} vérification(s) en attente
              </Link>
            )}
            {stats.open_disputes > 0 && (
              <Link href="/admin/litiges" className="muted">
                {stats.open_disputes} litige(s) ouvert(s)
              </Link>
            )}
          </Card>
        )}

        {stats && (
          <>
            <div className="statGrid" style={{ marginBottom: 16 }}>
              <StatTile label="Clients" value={stats.clients} icon="👤" />
              <StatTile
                label="Tailleurs"
                value={stats.tailors}
                icon="✂️"
                hint={`${stats.tailors_pending} en attente`}
              />
              <StatTile label="Commandes" value={stats.orders_total} icon="📦" />
              <StatTile label="Comptes suspendus" value={stats.suspended} icon="🚫" />
            </div>

            <Card className="adminStack" style={{ marginBottom: 16 }}>
              <div className="rowLabel">Activité financière</div>
              <div className="moneyRow">
                <div className="moneyItem">
                  <span className="moneyValue">{formatFcfa(stats.gmv)}</span>
                  <span className="moneyLabel">Volume livré</span>
                </div>
                <div className="moneyItem">
                  <span className="moneyValue">{formatFcfa(stats.commission_earned)}</span>
                  <span className="moneyLabel">Commission plateforme</span>
                </div>
              </div>
            </Card>

            {entries.length > 0 && (
              <Card className="adminStack" style={{ marginBottom: 16 }}>
                <div className="rowLabel">Commandes par statut</div>
                {entries.map(([key, count]) => (
                  <div key={key} className="barRow">
                    <span className="barLabel">{STATUS_LABEL[key] || key}</span>
                    <div className="barTrack">
                      <div className="barFill" style={{ width: `${(count / maxStatus) * 100}%` }} />
                    </div>
                    <span className="barCount">{count}</span>
                  </div>
                ))}
              </Card>
            )}

            <Card className="adminStack">
              <div className="rowLabel">Modération</div>
              <div className="statusInline">
                <Badge tone={stats.pending_reviews > 0 ? "pending" : "neutral"}>
                  {stats.pending_reviews} avis en attente
                </Badge>
                <Link href="/admin/avis">Modérer</Link>
              </div>
              <Link href="/admin/commandes">Toutes les commandes</Link>
            </Card>
          </>
        )}

        {!stats && error && <Card>Impossible de charger les statistiques.</Card>}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number;
  icon: string;
  hint?: string;
}) {
  return (
    <Card variant="elevated" className="statCard">
      <span className="statIcon" aria-hidden>
        {icon}
      </span>
      <span className="statValue">{value}</span>
      <span className="statLabel">{label}</span>
      {hint && <span className="statHint">{hint}</span>}
    </Card>
  );
}
