import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CatalogApi, OrdersApi, TailorsApi } from "../../api/endpoints";
import type { Accessory, Fabric, GarmentModel, TailorProfile } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header, Field, inputStyle, Spinner, ErrorBanner } from "../../components/Misc";
import { ApiError } from "../../api/client";
import { colors } from "../../theme/tokens";

export default function OrderCreate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const modelId = params.get("modelId") || "";
  const measurementId = params.get("measurementId") || "";
  const fabricId = params.get("fabricId") || "";
  const accessoryIds = (params.get("accessories") || "").split(",").filter(Boolean);

  const [tailorId, setTailorId] = useState(params.get("tailorId") || "");
  const [tailors, setTailors] = useState<TailorProfile[]>([]);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [amount, setAmount] = useState(0);
  const [reception, setReception] = useState<"pickup" | "delivery">("pickup");
  const [desiredDate, setDesiredDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modelId) CatalogApi.model(modelId).then((m) => { setModel(m); setAmount(m.base_price || 20000); });
    if (fabricId) CatalogApi.fabrics().then((list) => setFabric(list.find((f) => f.id === fabricId) || null));
    CatalogApi.accessories().then(setAccessories);
    if (!tailorId) TailorsApi.search({ sort: "rating" }).then(setTailors);
  }, [modelId, fabricId, tailorId]);

  const selectedAccessories = accessories.filter((a) => accessoryIds.includes(a.id));
  const accessoriesTotal = selectedAccessories.reduce((s, a) => s + a.price, 0);

  const submit = async () => {
    setError("");
    if (!tailorId || !modelId || !measurementId || amount <= 0) {
      setError("Choisissez un tailleur et un prix.");
      return;
    }
    setBusy(true);
    try {
      const order = await OrdersApi.create({
        tailor_id: tailorId,
        type: "custom",
        garment_model_id: modelId,
        fabric_id: fabricId || undefined,
        measurement_id: measurementId,
        accessories: selectedAccessories.map((a) => ({ accessory_id: a.id, price: a.price })),
        reception_mode: reception,
        desired_date: desiredDate || undefined,
        first_offer_amount: amount,
        delay_days: 10,
      });
      navigate(`/client/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!tailorId && tailors.length === 0) return <Spinner />;

  return (
    <div>
      <Header title="Nouvelle commande" onBack />
      <div style={{ padding: 18 }}>
        {error && <ErrorBanner message={error} />}

        {!tailorId ? (
          <>
            <h4>Choisir un tailleur</h4>
            {tailors.map((tl) => (
              <Card key={tl.id} onClick={() => setTailorId(tl.id)} style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>{tl.shop_name}</strong>
                <p style={{ fontSize: 11, color: colors.textSecondary, margin: "2px 0 0" }}>{tl.city}</p>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 16 }}>
              {model && <p style={{ margin: "0 0 4px", fontSize: 13 }}><strong>{model.name}</strong></p>}
              {fabric && <p style={{ margin: "0 0 4px", fontSize: 12, color: colors.textSecondary }}>Tissu: {fabric.name}</p>}
              {selectedAccessories.length > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>
                  Accessoires: {selectedAccessories.map((a) => a.name).join(", ")} (+{formatFcfa(accessoriesTotal)})
                </p>
              )}
            </Card>

            <Field label={t("order.priceOffer")}>
              <input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
            </Field>

            <Field label={t("order.receptionMode")}>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant={reception === "pickup" ? "primary" : "secondary"} onClick={() => setReception("pickup")} style={{ flex: 1 }}>
                  {t("order.pickup")}
                </Button>
                <Button variant={reception === "delivery" ? "primary" : "secondary"} onClick={() => setReception("delivery")} style={{ flex: 1 }}>
                  {t("order.delivery")}
                </Button>
              </div>
            </Field>

            <Field label={t("order.desiredDate")}>
              <input type="date" style={inputStyle} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
            </Field>

            <Button fullWidth disabled={busy} onClick={submit}>
              {t("order.sendToTailor")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
