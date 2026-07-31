import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { CatalogApi, TailorsApi } from "../../../src/api/endpoints";
import type { ReadyToWear as RTW, TailorProfile } from "../../../src/api/types";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState, ErrorBanner, Field, Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { formatFcfa, useI18n } from "../../../src/i18n/I18nProvider";
import { colors, fonts } from "../../../src/theme/tokens";

export default function ReadyToWear() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [items, setItems] = useState<RTW[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await TailorsApi.me();
    setProfile(p);
    if (p) setItems(await CatalogApi.readyToWear(p.id));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    setError("");
    const priceNum = parseFloat(price) || 0;
    if (!name || priceNum <= 0) {
      setError("Nom et prix requis.");
      return;
    }
    setBusy(true);
    try {
      await CatalogApi.createReadyToWear({
        name,
        description,
        price: priceNum,
        item_measurements: {},
        measurement_method: "standard",
        in_stock: true,
      });
      setSheetOpen(false);
      setName("");
      setDescription("");
      setPrice("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!items) return <Spinner />;

  return (
    <Screen>
      <Header
        title={t("nav.readyToWear")}
        right={
          <Button onPress={() => setSheetOpen(true)} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
            +
          </Button>
        }
      />
      <View style={{ padding: 18 }}>
        {items.length === 0 ? (
          <EmptyState text="Aucun article publié." cta={<Button onPress={() => setSheetOpen(true)}>{t("tailor.readyToWear.add")}</Button>} />
        ) : (
          <View style={styles.grid}>
            {items.map((it) => (
              <Card key={it.id} style={styles.gridItem}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemPrice}>{formatFcfa(it.price)}</Text>
              </Card>
            ))}
          </View>
        )}
      </View>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t("tailor.readyToWear.add")}>
        {error ? <ErrorBanner message={error} /> : null}
        <Field label="Nom">
          <Input value={name} onChangeText={setName} />
        </Field>
        <Field label="Description">
          <Input value={description} onChangeText={setDescription} multiline style={{ minHeight: 60, textAlignVertical: "top" }} />
        </Field>
        <Field label="Prix (FCFA)">
          <Input keyboardType="numeric" value={price} onChangeText={setPrice} />
        </Field>
        <Button fullWidth loading={busy} onPress={submit}>
          {t("common.save")}
        </Button>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "47%" },
  itemName: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 4 },
  itemPrice: { fontSize: 12, color: colors.violetPrimary, fontFamily: fonts.bodyBold },
});
