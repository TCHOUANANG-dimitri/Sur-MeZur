import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AvatarsApi, MeasurementsApi } from "../../api/endpoints";
import type { Avatar as AvatarT, Measurement } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Spinner } from "../../components/Misc";
import { Viewer3D } from "../../components/Viewer3D";
import { colors } from "../../theme/tokens";

const SKIN_TONES = ["#F2D0B4", "#E8B584", "#C68863", "#9C6644", "#6B4226", "#3E2723"];

export default function AvatarPage() {
  const [params] = useSearchParams();
  const measurementId = params.get("measurementId");
  const modelId = params.get("modelId");
  const tailorId = params.get("tailorId");
  const navigate = useNavigate();
  const { t } = useI18n();

  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [skinTone, setSkinTone] = useState(SKIN_TONES[2]);
  const [avatar, setAvatar] = useState<AvatarT | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    MeasurementsApi.list().then((list) => {
      const found = measurementId ? list.find((m) => m.id === measurementId) : list[0];
      setMeasurement(found || null);
    });
  }, [measurementId]);

  const generate = async () => {
    if (!measurement) return;
    setLoading(true);
    try {
      let av = await AvatarsApi.create({ measurement_id: measurement.id, skin_tone_hex: skinTone });
      for (let i = 0; i < 10 && av.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 800));
        av = await AvatarsApi.get(av.id);
      }
      setAvatar(av);
    } finally {
      setLoading(false);
    }
  };

  if (!measurement) return <Spinner />;

  const tryonQs = new URLSearchParams();
  if (avatar) tryonQs.set("avatarId", avatar.id);
  if (modelId) tryonQs.set("modelId", modelId);
  if (tailorId) tryonQs.set("tailorId", tailorId);

  return (
    <div>
      <Header title={t("avatar.title")} onBack />
      <div style={{ padding: 18 }}>
        <Viewer3D
          glbUrl={avatar?.status === "ready" ? avatar.gltf_url : null}
          skinToneHex={skinTone}
          measurements={measurement.data}
          height={300}
        />

        <p style={{ fontSize: 12, fontWeight: 600, margin: "16px 0 8px" }}>{t("avatar.skinTone")}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {SKIN_TONES.map((c) => (
            <button
              key={c}
              onClick={() => setSkinTone(c)}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: c,
                border: skinTone === c ? `3px solid ${colors.violetPrimary}` : `1px solid ${colors.border}`,
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {!avatar || avatar.status !== "ready" ? (
          <Button fullWidth disabled={loading} onClick={generate}>
            {loading ? t("common.loading") : t("avatar.title")}
          </Button>
        ) : (
          <Button fullWidth onClick={() => navigate(`/client/tryon?${tryonQs.toString()}`)}>
            {t("avatar.dressButton")}
          </Button>
        )}
      </div>
    </div>
  );
}
