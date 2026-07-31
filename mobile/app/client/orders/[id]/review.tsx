import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApiError } from "../../../../src/api/client";
import { OrdersApi } from "../../../../src/api/endpoints";
import { Button } from "../../../../src/components/Button";
import { ErrorBanner, Field, Header, Input } from "../../../../src/components/Misc";
import { Screen } from "../../../../src/components/Screen";
import { Stars } from "../../../../src/components/Stars";
import { useI18n } from "../../../../src/i18n/I18nProvider";

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await OrdersApi.review(id, { stars, comment });
      router.replace(`/client/orders/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t("review.title")} showBack />
      <View style={styles.wrap}>
        {error ? <ErrorBanner message={error} /> : null}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <Stars value={stars} size={32} interactive onChange={setStars} />
        </View>
        <Field label={t("review.comment")}>
          <Input value={comment} onChangeText={setComment} multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
        </Field>
        <Button fullWidth loading={busy} onPress={submit}>
          {t("common.confirm")}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24 },
});
