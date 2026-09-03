"use client";

// Paliers de commission de la plateforme : fourchette de prix et taux associe.

import { useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { formatFcfa } from "@/components/admin/format";

interface Tier {
  id: string;
  min_price: number;
  max_price: number | null;
  rate: number;
}

export default function AdminCommission() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    AdminApi.commissionTiers()
      .then(setTiers)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="container">
      <PageHeader title="Commission" />
      <div className="section">
        <ErrorBanner message={error} />
        <p className="adminIntro">
          Palier de commission appliqué selon le montant convenu de la commande.
        </p>

        {!tiers && !error ? (
          <Spinner label="Chargement des paliers…" />
        ) : !tiers || tiers.length === 0 ? (
          <EmptyState icon="％" title="Aucun palier" body="Aucun palier de commission configuré." />
        ) : (
          <div className="adminStack">
            {tiers.map((tier) => (
              <Card key={tier.id}>
                <div className="rowTop">
                  <div>
                    <div className="rowLabel">
                      {formatFcfa(tier.min_price)} — {tier.max_price != null ? formatFcfa(tier.max_price) : "∞"}
                    </div>
                  </div>
                  <span className="rowLabel" style={{ color: "var(--violet-primary)" }}>
                    {(tier.rate * 100).toFixed(0)}%
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}