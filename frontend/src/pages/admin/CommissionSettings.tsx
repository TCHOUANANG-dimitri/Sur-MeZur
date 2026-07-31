import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import { formatFcfa } from "../../i18n/I18nProvider";
import { Card } from "../../components/Card";
import { Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

interface Tier {
  id: string;
  min_price: number;
  max_price: number | null;
  rate: number;
}

export default function CommissionSettings() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);

  useEffect(() => {
    AdminApi.commissionTiers().then(setTiers);
  }, []);

  if (!tiers) return <Spinner />;

  return (
    <div>
      <Header title="Barème de commission" />
      <div style={{ padding: 18 }}>
        <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14 }}>
          Barème par tranches (CDC §10.1) — taux décroissant, prélevé sur le tailleur.
        </p>
        {tiers.map((t) => (
          <Card key={t.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13 }}>
                {formatFcfa(t.min_price)} — {t.max_price ? formatFcfa(t.max_price) : "∞"}
              </span>
              <strong style={{ color: colors.violetPrimary }}>{(t.rate * 100).toFixed(0)}%</strong>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
