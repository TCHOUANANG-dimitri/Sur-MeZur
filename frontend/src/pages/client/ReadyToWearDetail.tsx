import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CatalogApi, MeasurementsApi } from "../../api/endpoints";
import type { Measurement, ReadyToWear } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function ReadyToWearDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [item, setItem] = useState<ReadyToWear | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [result, setResult] = useState<{ match: boolean; message: string; deltas: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    CatalogApi.readyToWearItem(id).then(setItem);
    MeasurementsApi.list().then(setMeasurements).catch(() => {});
  }, [id]);

  const compare = async () => {
    if (measurements.length === 0) return;
    setBusy(true);
    try {
      const res = await CatalogApi.compare(measurements[0].id, id);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  if (!item) return <Spinner />;

  return (
    <div>
      <Header title={item.name} onBack />
      <div style={{ height: 220, background: colors.backgroundAlt }} />
      <div style={{ padding: 18 }}>
        <h3 style={{ fontFamily: "'Playfair Display', serif", margin: "0 0 6px" }}>{item.name}</h3>
        <p style={{ fontSize: 13, color: colors.textSecondary }}>{item.description}</p>
        <p style={{ fontWeight: 700, color: colors.violetPrimary, fontSize: 18 }}>{formatFcfa(item.price)}</p>

        <Button fullWidth disabled={busy || measurements.length === 0} onClick={compare} style={{ marginTop: 10 }}>
          Comparer à mes mesures
        </Button>

        {measurements.length === 0 && (
          <p style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
            Prenez vos mesures pour utiliser le comparateur.
          </p>
        )}

        {result && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: radii.card,
              background: result.match ? "#DCFCE7" : "#FEF3C7",
              fontSize: 13,
            }}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
