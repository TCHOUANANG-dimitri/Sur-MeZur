import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CatalogApi, NotificationsApi, TailorsApi } from "../../../src/api/endpoints";
import type { GarmentCategory, GarmentModel, Notification, TailorProfile } from "../../../src/api/types";
import { NotifBell, VerifiedBadge } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { Stars } from "../../../src/components/Stars";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useAuth } from "../../../src/state/AuthContext";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, gradientColors, radii, type ThemeColors } from "../../../src/theme/tokens";

const CATEGORIES: { key: GarmentCategory; label: string }[] = [
  { key: "top", label: "Hauts" },
  { key: "bottom", label: "Bas" },
  { key: "dress", label: "Robes" },
  { key: "traditional", label: "Traditionnel" },
  { key: "other", label: "Autres" },
];

export default function Home() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [popular, setPopular] = useState<GarmentModel[] | null>(null);
  const [byCategory, setByCategory] = useState<Record<string, GarmentModel[]>>({});
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);

  useEffect(() => {
    CatalogApi.models({ sort: "popular", limit: 10 }).then(setPopular);
    CATEGORIES.forEach(({ key }) => {
      CatalogApi.models({ category: key, limit: 10 }).then((list) =>
        setByCategory((prev) => ({ ...prev, [key]: list }))
      );
    });
    TailorsApi.search({ sort: "rating" }).then(setTailors);
    NotificationsApi.list().then(setNotifs).catch(() => {});
  }, []);

  const ModelSection = ({ title, models, category }: { title: string; models: GarmentModel[] | undefined; category?: string }) => {
    if (models && models.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <TouchableOpacity
            style={styles.seeMore}
            onPress={() => router.push({ pathname: "/client/models", params: category ? { category } : {} })}
          >
            <Text style={styles.seeMoreText}>Voir plus</Text>
            <ChevronRight size={14} color={colors.violetPrimary} />
          </TouchableOpacity>
        </View>
        {!models ? (
          <Spinner />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 18 }}>
            {models.map((m) => (
              <TouchableOpacity key={m.id} style={{ width: 140 }} onPress={() => router.push(`/client/models/${m.id}`)}>
                <LinearGradient colors={[m.thumbnail_color, colors.indigoText]} style={styles.modelThumb} />
                <Text style={styles.modelName}>{m.name}</Text>
                <Text style={styles.modelCategory}>{m.category}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.greeting}>
            {t("home.greeting")}, {user?.full_name.split(" ")[0]}
          </Text>
          <Text style={styles.brand}>Sur-MeZur</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setLang(lang === "fr" ? "en" : "fr")} style={styles.langBtn}>
            <Text style={styles.langBtnText}>{lang.toUpperCase()}</Text>
          </TouchableOpacity>
          <NotifBell
            count={notifs.filter((n) => !n.read_at).length}
            onPress={() => router.push("/client/notifications")}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.searchBar} onPress={() => router.push("/client/(tabs)/search")}>
        <Text style={styles.searchPlaceholder}>Rechercher un modèle, un tailleur…</Text>
      </TouchableOpacity>

      <ModelSection title={t("home.popularModels")} models={popular ?? undefined} />
      {CATEGORIES.map(({ key, label }) => (
        <ModelSection key={key} title={label} models={byCategory[key]} category={key} />
      ))}

      <View style={[styles.section, { paddingHorizontal: 18 }]}>
        <Text style={styles.sectionTitle}>{t("home.tailorsNearYou")}</Text>
        {!tailors ? (
          <Spinner />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} onPress={() => router.push(`/client/tailors/${tl.id}`)} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <LinearGradient colors={gradientColors} style={styles.tailorAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.tailorName}>{tl.shop_name}</Text>
                    {tl.verification_status === "approved" && <VerifiedBadge />}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <Stars value={tl.rating_avg} />
                    <Text style={styles.tailorMeta}>
                      ({tl.completed_orders_count}) · {tl.city}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
      <View style={{ height: 24 }} />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  greeting: { fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body },
  brand: { fontFamily: fonts.display, fontSize: 20, color: colors.indigoText, marginTop: 2 },
  langBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  langBtnText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.indigoText },
  searchBar: {
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundAlt,
  },
  searchPlaceholder: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body },
  section: { marginTop: 18 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.indigoText },
  seeMore: { flexDirection: "row", alignItems: "center" },
  seeMoreText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.violetPrimary },
  modelThumb: { height: 160, borderRadius: radii.card },
  modelName: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 8, color: colors.indigoText },
  modelCategory: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  tailorAvatar: { width: 48, height: 48, borderRadius: 12 },
  tailorName: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
  tailorMeta: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
});
