import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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

const CHECKLIST_ITEMS = [
  { key: "id_card", label: "Identité vérifiée", desc: "Nom, photo, cohérence avec le profil" },
  { key: "atelier_photo", label: "Atelier vérifié", desc: "Localisation, existence réelle" },
  { key: "portfolio", label: "Portfolio vérifié", desc: "Qualité des réalisations, cohérence" },
] as const;

export default function Verifications() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docs, setDocs] = useState<Record<string, VerificationDocument[]>>({});
  const [checkedByTailor, setCheckedByTailor] = useState<Record<string, boolean>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

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

  const allChecked = (id: string) => CHECKLIST_ITEMS.every((item) => checkedByTailor[`${id}:${item.key}`]);

  const approve = async (id: string) => {
    if (!allChecked(id) || processing) return;
    setProcessing(true);
    try {
      await AdminApi.decideVerification(id, "approved");
      load(filter);
    } finally {
      setProcessing(false);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim() || processing) return;
    setProcessing(true);
    try {
      await AdminApi.decideVerification(id, "rejected", rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      load(filter);
    } finally {
      setProcessing(false);
    }
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
              {tl.bio ? <Text style={styles.bio}>{tl.bio}</Text> : null}

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
                <>
                  {/* Vérification obligatoire */}
                  <View style={styles.checklist}>
                    <Text style={styles.checklistTitle}>Vérification obligatoire</Text>
                    {CHECKLIST_ITEMS.map((item) => {
                      const isChecked = !!checkedByTailor[`${tl.id}:${item.key}`];
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={styles.checkRow}
                          onPress={() => setCheckedByTailor((prev) => ({ ...prev, [`${tl.id}:${item.key}`]: !isChecked }))}
                        >
                          <View style={[styles.checkBox, isChecked && styles.checkBoxActive]}>
                            {isChecked && <Text style={styles.checkMark}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.checkLabel}>{item.label}</Text>
                            <Text style={styles.checkDesc}>{item.desc}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Rejet avec motif */}
                  {rejectingId === tl.id ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        placeholder="Motif du rejet (obligatoire)"
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        multiline
                        style={styles.rejectInput}
                      />
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Button variant="secondary" disabled={!rejectReason.trim() || processing} onPress={() => reject(tl.id)} style={{ flex: 1 }}>
                          Confirmer le rejet
                        </Button>
                        <Button variant="text" onPress={() => { setRejectingId(null); setRejectReason(""); }} style={{ flex: 1 }}>
                          Annuler
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                      <Button variant="danger" disabled={processing} onPress={() => setRejectingId(tl.id)} style={{ flex: 1 }}>
                        {t("admin.verificationsPage.reject")}
                      </Button>
                      <Button disabled={!allChecked(tl.id) || processing} onPress={() => approve(tl.id)} style={{ flex: 1 }}>
                        {t("admin.verificationsPage.approve")}
                      </Button>
                    </View>
                  )}
                </>
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
    filterRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 18, paddingTop: 12 },
    name: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
    bio: { fontSize: 12, marginTop: 8, color: colors.indigoText, fontFamily: fonts.body },
    docs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    doc: { width: 92, gap: 4 },
    docThumb: { height: 92, borderRadius: radii.card, backgroundColor: colors.backgroundAlt },
    docLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center" },
    checklist: { backgroundColor: colors.backgroundAlt, borderRadius: radii.card, padding: 12, marginTop: 12 },
    checklistTitle: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.indigoText, marginBottom: 6 },
    checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 },
    checkBox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    checkBoxActive: { backgroundColor: colors.violetPrimary, borderColor: colors.violetPrimary },
    checkMark: { color: "#fff", fontSize: 13, fontFamily: fonts.bodyBold },
    checkLabel: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    checkDesc: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
    rejectInput: {
      backgroundColor: colors.surface,
      borderColor: colors.error,
      borderWidth: 1,
      borderRadius: radii.card,
      padding: 10,
      minHeight: 70,
      textAlignVertical: "top",
      fontSize: 13,
      color: colors.indigoText,
    },
  });