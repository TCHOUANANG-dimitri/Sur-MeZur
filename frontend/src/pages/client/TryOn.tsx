import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AvatarsApi, CatalogApi, MeasurementsApi, TryonApi } from "../../api/endpoints";
import type { Accessory, Avatar, Fabric, GarmentModel, Measurement } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { BottomSheet } from "../../components/BottomSheet";
import { Header, Spinner } from "../../components/Misc";
import { Viewer3D } from "../../components/Viewer3D";
import { colors, radii, shadow } from "../../theme/tokens";

export default function TryOn() {
  const [params] = useSearchParams();
  const avatarId = params.get("avatarId");
  const navigate = useNavigate();
  const { t } = useI18n();

  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [modelId, setModelId] = useState(params.get("modelId") || "");
  const [fabricId, setFabricId] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);

  useEffect(() => {
    CatalogApi.models().then(setModels);
    CatalogApi.fabrics().then((list) => {
      setFabrics(list);
      if (list[0]) setFabricId(list[0].id);
    });
    CatalogApi.accessories().then(setAccessories);
    if (avatarId) {
      AvatarsApi.get(avatarId).then(async (av) => {
        setAvatar(av);
        const list = await MeasurementsApi.list();
        setMeasurement(list.find((m) => m.id === av.measurement_id) || null);
      });
    }
  }, [avatarId]);

  const selectedModel = models.find((m) => m.id === modelId);
  const selectedFabric = fabrics.find((f) => f.id === fabricId);
  const accessoriesTotal = selectedAcc.reduce((sum, id) => sum + (accessories.find((a) => a.id === id)?.price || 0), 0);

  const finalize = async () => {
    if (!avatar || !modelId) return;
    setFinalizing(true);
    try {
      let session = await TryonApi.create({
        avatar_id: avatar.id,
        garment_model_id: modelId,
        fabric_id: fabricId || undefined,
        accessory_ids: selectedAcc,
      });
      for (let i = 0; i < 10 && session.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 800));
        session = await TryonApi.get(session.id);
      }
      setFinalized(true);
    } finally {
      setFinalizing(false);
    }
  };

  const goToOrder = () => {
    if (!avatar || !modelId) return;
    const qs = new URLSearchParams({
      avatarId: avatar.id,
      modelId,
      measurementId: avatar.measurement_id,
      fabricId: fabricId || "",
      accessories: selectedAcc.join(","),
    });
    const tailorId = params.get("tailorId");
    if (tailorId) qs.set("tailorId", tailorId);
    navigate(`/client/orders/new?${qs.toString()}`);
  };

  if (!avatarId) {
    const qs = new URLSearchParams();
    if (modelId) qs.set("modelId", modelId);
    const tailorParam = params.get("tailorId");
    if (tailorParam) qs.set("tailorId", tailorParam);

    return (
      <div>
        <Header title={t("tryon.title")} />
        <div style={{ padding: 24, textAlign: "center" }}>
          <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
            {t("tryon.noAvatar")}
          </p>
          <Button onClick={() => navigate("/client/measurements")} style={{ marginBottom: 10 }}>
            {t("tryon.takeMeasurements")}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate(`/client/tryon/pick-measurement?${qs.toString()}`)}
          >
            {t("tryon.useExisting")}
          </Button>
        </div>
      </div>
    );
  }

  if (!avatar) return <Spinner />;

  return (
    <div>
      <Header title={t("tryon.title")} onBack />
      <div style={{ padding: 18, paddingBottom: 140 }}>
        <Viewer3D
          glbUrl={avatar?.status === "ready" ? avatar.gltf_url : null}
          skinToneHex={avatar.skin_tone_hex}
          garmentColorHex={selectedFabric?.color_hex}
          measurements={measurement?.data}
          height={320}
        />

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>{t("tryon.selectModel")}</p>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {models.map((m) => (
              <div
                key={m.id}
                onClick={() => setModelId(m.id)}
                style={{
                  minWidth: 64,
                  height: 64,
                  borderRadius: radii.button,
                  background: `linear-gradient(160deg, ${m.thumbnail_color}, ${colors.indigoText})`,
                  border: modelId === m.id ? `3px solid ${colors.violetPrimary}` : "3px solid transparent",
                  cursor: "pointer",
                }}
                title={m.name}
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>{t("tryon.selectFabric")}</p>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {fabrics.map((f) => (
              <div
                key={f.id}
                onClick={() => setFabricId(f.id)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: f.color_hex,
                  border: fabricId === f.id ? `3px solid ${colors.violetPrimary}` : `1px solid ${colors.border}`,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                title={f.name}
              />
            ))}
          </div>
        </div>

        <Button variant="secondary" fullWidth onClick={() => setSheetOpen(true)} style={{ marginTop: 16 }}>
          {t("tryon.addAccessory")} {selectedAcc.length > 0 && `(${selectedAcc.length})`}
        </Button>

        <Button fullWidth onClick={finalize} disabled={!modelId || finalizing} style={{ marginTop: 10 }}>
          {finalizing ? t("common.loading") : t("tryon.finalize")}
        </Button>
      </div>

      {finalized && selectedModel && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: colors.white,
            borderTop: `1px solid ${colors.border}`,
            boxShadow: shadow,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 12 }}>
            <span>{selectedModel.name} · {selectedFabric?.name}</span>
            <strong>{formatFcfa((selectedModel.base_price || 0) + accessoriesTotal)}</strong>
          </div>
          <Button fullWidth onClick={goToOrder}>
            {t("order.placeOrder")}
          </Button>
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("tryon.addAccessory")}>
        {accessories.map((a) => (
          <label key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedAcc.includes(a.id)}
                onChange={(e) =>
                  setSelectedAcc((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                }
                style={{ marginRight: 8 }}
              />
              {a.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{formatFcfa(a.price)}</span>
          </label>
        ))}
      </BottomSheet>
    </div>
  );
}
