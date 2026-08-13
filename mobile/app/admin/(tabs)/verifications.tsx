import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { fileUrl } from "../../../src/api/client";
import { AdminApi } from "../../../src/api/endpoints";
import type { TailorProfile, VerificationDocument, VerificationStatus } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { VerificationBadge } from "../../../src/components/Badges";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

type FilterKey = VerificationStatus | "all";

export default function Verifications() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docs, setDocs] = useState<Record<string, VerificationDocument[]>>({});

  const DOC_LABEL: Record<VerificationDocument["type"], string> = {
    id_card: t("admin.verificationsPage.identity"),
    self_photo: t("admin.verificationsPage.selfPhoto"),
    atelier_photo: t("admin.verificationsPage.workshopPhoto"),
  };

  const load = useCallback((f: FilterKey) => {
    AdminApi.verifications(f === "all" ? undefined : f).then((list) => {
      setTailors(list);
      Promise.all(list.map((tl) => AdminApi.verificationDocuments(tl.id).catch(() => []))).then(
        (perTailor) => {
          const map: Record<string, VerificationDocument[]> = {};
          list.forEach((tl, i) => (map[tl.id] = perTailor[i]));
          setDocs(map);
        }
      );
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  const decide = async (id: string, status: "approved" | "rejected") => {
    await AdminApi.decideVerification(id, status);
    load(filter);
  };

  return (
    <Screen scroll={false}>
      <Header title={t("admin.verificationsPage.title")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(["pending", "approved", "rejected", "all"] as FilterKey[]).map((f) => (
          <Chip
            key={f}
            label={t(`admin.verificationsPage.filter.${f}`)}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      <View style={{ padding: 18, paddingTop: 10 }}>
        {!tailors ? (
          <Spinner />
        ) : tailors.length === 0 ? (
          <EmptyState text={t("common.noVerifications")} />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.name}>{tl.shop_name}</Text>
                <VerificationBadge status={tl.verification_status} />
              </View>
              <Text style={styles.meta}>
                {tl.tailor_type === "atelier" ? t("admin.verificationsPage.workshop") : t("admin.verificationsPage.individual")} · {tl.city}
              </Text>
              <Text style={styles.bio}>{tl.bio}</Text>

              {(docs[tl.id] ?? []).length > 0 && (
                <View style={styles.docs}>
                  {(docs[tl.id] ?? []).map((d) => (
                    <View key={d.id} style={styles.doc}>
                      <Image source={{ uri: fileUrl(d.file_url) }} style={styles.docThumb} resizeMode="cover" />
                      <Text style={styles.docLabel}>{DOC_LABEL[d.type] ?? d.type}</Text>
                    </View>
                  ))}
                </View>
              )}

              {tl.verification_status === "pending" && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button variant="danger" onPress={() => decide(tl.id, "rejected")} style={{ flex: 1 }}>
                    {t("admin.verificationsPage.reject")}
                  </Button>
                  <Button onPress={() => decide(tl.id, "approved")} style={{ flex: 1 }}>
                    {t("admin.verificationsPage.approve")}
                  </Button>
                </View>
              )}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 12 },
    name: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
    bio: { fontSize: 12, marginTop: 8, color: colors.indigoText, fontFamily: fonts.body },
    docs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    doc: { width: 92, gap: 4 },
    docThumb: { height: 92, borderRadius: radii.card, backgroundColor: colors.backgroundAlt },
    docLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center" },
  });
