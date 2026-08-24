import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AvatarsApi, MeasurementsApi, UsersApi } from "../../api/endpoints";
import type { Avatar, ClientProfile, Measurement } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { StatusChip } from "../../components/Chip";
import { colors, radii } from "../../theme/tokens";

const SKIN_TONES = ["#C68863", "#8D5524", "#FFDBAC", "#F1C27D", "#E0AC69", "#503335"];

export default function UseExistingMeasurements() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const modelId = params.get("modelId") || "";
  const tailorId = params.get("tailorId") || "";

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [skinTone, setSkinTone] = useState("#C68863");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    MeasurementsApi.list().then(setMeasurements).catch(() => {});
    UsersApi.myClientProfile().then((p) => {
      setProfile(p);
      if (p.skin_tone_hex) setSkinTone(p.skin_tone_hex);
    }).catch(() => {});
  }, []);

  const handleCreateAvatar = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const avatar: Avatar = await AvatarsApi.create({
        measurement_id: selected,
        skin_tone_hex: skinTone,
      });
      const qs = new URLSearchParams({ avatarId: avatar.id });
      if (modelId) qs.set("modelId", modelId);
      if (tailorId) qs.set("tailorId", tailorId);
      navigate(`/client/tryon?${qs.toString()}`);
    } catch {
      setError("Erreur lors de la création de l'avatar. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title={t("measurement.pickExisting")} onBack />
      <div style={{ padding: 18 }}>
        {measurements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
              {t("measurement.noExisting")}
            </p>
            <Button onClick={() => navigate("/client/measurements")}>
              {t("measurement.intro.title")}
            </Button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: "0 0 14px" }}>
              {t("measurement.pickExisting.subtitle")}
            </p>

            {measurements.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelected(m.id)}
                style={{
                  padding: 14,
                  borderRadius: radii.card,
                  border: selected === m.id ? `2px solid ${colors.violetPrimary}` : `1px solid ${colors.border}`,
                  background: colors.white,
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.indigoText }}>
                      {t("measurement.height")}: {m.height_cm} cm
                    </p>
                    {m.weight_kg && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary }}>
                        {t("measurement.weight")}: {m.weight_kg} kg
                      </p>
                    )}
                  </div>
                  <StatusChip
                    status="neutral"
                    label={t(`measurement.source.${m.source}`)}
                  />
                </div>
                {m.confidence && (
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: colors.textSecondary }}>
                    {t("measurement.confidence")}: {Math.round(
                      Object.values(m.confidence).reduce((a, b) => a + b, 0) / Object.values(m.confidence).length * 100
                    )}%
                  </p>
                )}
              </div>
            ))}

            <div style={{ marginTop: 16, marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>{t("avatar.skinTone")}</p>
              <div style={{ display: "flex", gap: 8 }}>
                {SKIN_TONES.map((hex) => (
                  <div
                    key={hex}
                    onClick={() => setSkinTone(hex)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: hex,
                      border: skinTone === hex ? `3px solid ${colors.violetPrimary}` : `1px solid ${colors.border}`,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 13, color: colors.error, textAlign: "center", margin: "12px 0" }}>{error}</p>
            )}

            <Button
              fullWidth
              onClick={handleCreateAvatar}
              disabled={!selected || busy}
              style={{ marginTop: 10 }}
            >
              {busy ? t("common.loading") : t("tryon.useMeasurement")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
