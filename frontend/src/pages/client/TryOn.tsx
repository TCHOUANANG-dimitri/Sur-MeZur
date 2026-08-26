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

const SKIN_TONES = ["#F2D0B4", "#E8B584", "#C68863", "#9C6644", "#6B4226", "#3E2723"];

export default function TryOn() {
  const [params] = useSearchParams();
  const avatarId = params.get("avatarId");
  const navigate = useNavigate();
  const { t } = useI18n();

  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [skinTone, setSkinTone] = useState(SKIN_TONES[2]);
  const [creatingAvatar, setCreatingAvatar] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [avs, ms, cats] = await Promise.all([
          AvatarsApi.list(),
          MeasurementsApi.list(),
          Promise.all([CatalogApi.models(), CatalogApi.fabrics(), CatalogApi.accessories()]),
        ]);
        setAvatars(avs);
        setMeasurements(ms);
        setModels(cats[0]);
        setFabrics(cats[1]);
        if (cats[1][0]) setFabricId(cats[1][0].id);
        setAccessories(cats[2]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Si avatarId passé en URL, le charger directement
  useEffect(() => {
    if (avatarId) {
      AvatarsApi.get(avatarId).then(async (av) => {
        setSelectedAvatar(av);
        const list = await MeasurementsApi.list();
        setMeasurement(list.find((m) => m.id === av.measurement_id) || null);
      });
    }
  }, [avatarId]);

  // --- Étape 1 : Pas de mesure → aller en prendre ---
  if (!loading && measurements.length === 0) {
    return (
      <div>
        <Header title={t("tryon.title")} />
        <div style={{ padding: 24, textAlign: "center" }}>
          <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
            {t("tryon.noAvatar")}
          </p>
          <Button onClick={() => navigate("/client/measurements")}>
            {t("tryon.takeMeasurements")}
          </Button>
        </div>
      </div>
    );
  }

  // --- Étape 2 : Pas d'avatar mais mesures existantes → en créer un ---
  if (!loading && avatars.length === 0 && measurements.length > 0 && !selectedAvatar) {
    const firstMeasurement = measurements[0];
    return (
      <div>
        <Header title={t("tryon.title")} />
        <div style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
            Vous avez des mesures mais pas encore d'avatar. Créez-le pour essayer les modèles.
          </p>

          <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 8px" }}>{t("avatar.skinTone")}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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

          <Button
            fullWidth
            disabled={creatingAvatar}
            onClick={async () => {
              setCreatingAvatar(true);
              try {
                const av = await AvatarsApi.create({
                  measurement_id: firstMeasurement.id,
                  skin_tone_hex: skinTone,
                });
                setSelectedAvatar(av);
                setMeasurement(firstMeasurement);
              } catch {
                // erreurs gérées silencieusement
              } finally {
                setCreatingAvatar(false);
              }
            }}
          >
            {creatingAvatar ? t("common.loading") : "Créer mon avatar"}
          </Button>
        </div>
      </div>
    );
  }

  // --- Étape 3 : Avoir des avatars → en choisir un ou en créer un nouveau ---
  if (!loading && avatars.length > 0 && !selectedAvatar) {
    return (
      <div>
        <Header title={t("tryon.title")} />
        <div style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
            Sélectionnez un avatar pour essayer un modèle.
          </p>

          {avatars.map((av) => (
            <div
              key={av.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: radii.card,
                border: `1px solid ${colors.border}`,
                background: colors.white,
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <div
                onClick={() => {
                  setSelectedAvatar(av);
                  const m = measurements.find((ms) => ms.id === av.measurement_id);
                  if (m) setMeasurement(m);
                }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: av.skin_tone_hex,
                  flexShrink: 0,
                }}
              />
              <div
                style={{ flex: 1 }}
                onClick={() => {
                  setSelectedAvatar(av);
                  const m = measurements.find((ms) => ms.id === av.measurement_id);
                  if (m) setMeasurement(m);
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.indigoText }}>
                  {av.name || "Avatar"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textSecondary }}>
                  {av.status === "ready" ? "Prêt" : "En cours..."}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newName = window.prompt("Nom de l'avatar :", av.name || "");
                  if (newName !== null) {
                    AvatarsApi.patch(av.id, { name: newName || undefined }).then((updated) => {
                      setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                    });
                  }
                }}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  color: colors.textSecondary,
                  background: colors.white,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Renommer
              </button>
            </div>
          ))}

          <div style={{ marginTop: 12, marginBottom: 10 }}>
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

          <Button
            fullWidth
            variant="secondary"
            disabled={creatingAvatar}
            onClick={async () => {
              setCreatingAvatar(true);
              try {
                const av = await AvatarsApi.create({
                  measurement_id: measurements[0].id,
                  skin_tone_hex: skinTone,
                });
                setSelectedAvatar(av);
                setMeasurement(measurements[0]);
              } catch {
                // erreurs gérées silencieusement
              } finally {
                setCreatingAvatar(false);
              }
            }}
          >
            {creatingAvatar ? t("common.loading") : "Créer un nouvel avatar"}
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !selectedAvatar) return <Spinner />;

  const selectedModel = models.find((m) => m.id === modelId);
  const selectedFabric = fabrics.find((f) => f.id === fabricId);
  const accessoriesTotal = selectedAcc.reduce((sum, id) => sum + (accessories.find((a) => a.id === id)?.price || 0), 0);

  const finalize = async () => {
    if (!selectedAvatar || !modelId) return;
    setFinalizing(true);
    try {
      let session = await TryonApi.create({
        avatar_id: selectedAvatar.id,
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
    if (!selectedAvatar || !modelId) return;
    const qs = new URLSearchParams({
      avatarId: selectedAvatar.id,
      modelId,
      measurementId: selectedAvatar.measurement_id,
      fabricId: fabricId || "",
      accessories: selectedAcc.join(","),
    });
    const tailorId = params.get("tailorId");
    if (tailorId) qs.set("tailorId", tailorId);
    navigate(`/client/orders/new?${qs.toString()}`);
  };

  return (
    <div>
      <Header title={t("tryon.title")} onBack />
      <div style={{ padding: 18, paddingBottom: 140 }}>
        <Viewer3D
          glbUrl={selectedAvatar?.status === "ready" ? selectedAvatar.gltf_url : null}
          skinToneHex={selectedAvatar.skin_tone_hex}
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
