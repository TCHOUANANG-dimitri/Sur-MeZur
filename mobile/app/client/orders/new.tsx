import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { CatalogApi, OrdersApi, TailorsApi } from "../../../src/api/endpoints";
import type { Accessory, Fabric, GarmentModel, TailorProfile } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { ErrorBanner, Field, Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

export default function OrderCreate() {
  const params = useLocalSearchParams<{
    modelId?: string;
    measurementId?: string;
    fabricId?: string;
    accessories?: string;
    tailorId?: string;
  }>();
  const router = useRouter();
  const { t } = useI18n();

  const modelId = params.modelId || "";
  const measurementId = params.measurementId || "";
  const fabricId = params.fabricId || "";
  const accessoryIds = (params.accessories || "").split(",").filter(Boolean);

  const [tailorId, setTailorId] = useState(params.tailorId || "");
  const [tailors, setTailors] = useState<TailorProfile[]>([]);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [amount, setAmount] = useState("");
  const [reception, setReception] = useState<"pickup" | "delivery">("pickup");
  const [desiredDate, setDesiredDate] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modelId) CatalogApi.model(modelId).then(setModel);
    if (fabricId) CatalogApi.fabrics().then((list) => setFabric(list.find((f) => f.id === fabricId) || null));
    CatalogApi.accessories().then(setAccessories);
    if (!tailorId) TailorsApi.search({ sort: "rating" }).then(setTailors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, fabricId]);

  const selectedAccessories = accessories.filter((a) => accessoryIds.includes(a.id));

  const submit = async () => {
    setError("");
    const amountNum = parseFloat(amount) || 0;
    if (!tailorId || !modelId || !measurementId || amountNum <= 0) {
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
        client_notes: clientNotes || undefined,
        reception_mode: reception,
        desired_date: desiredDate || undefined,
        first_offer_amount: amountNum,
        delay_days: 10,
      });
      router.replace(`/client/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!tailorId && tailors.length === 0) return <Spinner />;

  return (
    <Screen>
      <Header title="Nouvelle commande" showBack />
      <View style={{ padding: 18 }}>
        {error ? <ErrorBanner message={error} /> : null}

        {!tailorId ? (
          <>
            <Text style={styles.sectionTitle}>Choisir un tailleur</Text>
            {tailors.map((tl) => (
              <Card key={tl.id} onPress={() => setTailorId(tl.id)} style={{ marginBottom: 8 }}>
                <Text style={styles.tailorName}>{tl.shop_name}</Text>
                <Text style={styles.tailorCity}>{tl.city}</Text>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 16 }}>
              {model && <Text style={styles.modelName}>{model.name}</Text>}
              {fabric && <Text style={styles.detail}>Tissu: {fabric.name}</Text>}
              {selectedAccessories.length > 0 && (
                <Text style={styles.detail}>Accessoires: {selectedAccessories.map((a) => a.name).join(", ")}</Text>
              )}
            </Card>

            <Field label={t("order.priceOffer")}>
              <Input keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="Votre offre en FCFA" />
            </Field>

            <Field label={t("order.receptionMode")}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant={reception === "pickup" ? "primary" : "secondary"} onPress={() => setReception("pickup")} style={{ flex: 1 }}>
                  {t("order.pickup")}
                </Button>
                <Button variant={reception === "delivery" ? "primary" : "secondary"} onPress={() => setReception("delivery")} style={{ flex: 1 }}>
                  {t("order.delivery")}
                </Button>
              </View>
            </Field>

            <Field label={`${t("order.desiredDate")} (AAAA-MM-JJ)`}>
              <Input value={desiredDate} onChangeText={setDesiredDate} placeholder="2026-09-01" />
            </Field>

            <Field label="Précisions sur le vêtement souhaité">
              <Input
                value={clientNotes}
                onChangeText={setClientNotes}
                placeholder="Ex: manches longues, col rond, broderie sur la poche…"
                multiline
                style={{ minHeight: 80, textAlignVertical: "top" }}
              />
            </Field>

            <Button fullWidth loading={busy} onPress={submit}>
              {t("order.sendToTailor")}
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.indigoText, marginBottom: 10 },
  tailorName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  tailorCity: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.body },
  modelName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  detail: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
});
