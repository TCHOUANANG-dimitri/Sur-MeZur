import { useFocusEffect } from "expo-router";
import { Ban, CheckCircle2, Scissors, Search, ShieldCheck, User as UserIcon } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { userMessage } from "../../../src/api/client";
import { AdminApi } from "../../../src/api/endpoints";
import type { User } from "../../../src/api/types";
import { VerificationBadge } from "../../../src/components/Badges";
import { Card } from "../../../src/components/Card";
import { Chip } from "../../../src/components/Chip";
import { EmptyState, Header, Input, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useTheme, useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, type ThemeColors } from "../../../src/theme/tokens";
import { formatDate } from "../../../src/utils/dates";
import { useI18n } from "../../../src/i18n/I18nProvider";

type RoleFilter = "all" | "client" | "tailor" | "admin";

export default function AdminUsers() {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const ROLE_META: Record<string, { Icon: React.ComponentType<{ size?: number; color?: string }>; label: string }> = {
    client: { Icon: UserIcon, label: t("role.client") },
    tailor: { Icon: Scissors, label: t("role.tailor") },
    admin: { Icon: ShieldCheck, label: t("role.admin") },
  };

  const [users, setUsers] = useState<User[] | null>(null);
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    AdminApi.users({ role: role === "all" ? undefined : role, q: query || undefined })
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [role, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleActive = (u: User) => {
    const suspending = u.is_active;
    Alert.alert(
      suspending ? t("common.suspendAccount") : t("common.reactivateAccount"),
      suspending
        ? `${u.full_name} ${t("common.suspendConfirm")}`
        : `${u.full_name} ${t("common.reactivateConfirm")}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: suspending ? t("common.suspend") : t("common.reactivate"),
          style: suspending ? "destructive" : "default",
          onPress: async () => {
            setBusyId(u.id);
            try {
              const updated = await AdminApi.setUserActive(u.id, !u.is_active);
              setUsers((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
            } catch (e) {
              Alert.alert(t("common.impossibleAction"), userMessage(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen scroll={false}>
      <Header title={t("admin.users.title")} />

      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Search size={15} color={colors.textSecondary} />
          <Input
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            returnKeyType="search"
            placeholder={t("admin.users.searchPlaceholder")}
            style={styles.searchInput}
          />
        </View>
        <View style={styles.filterRow}>
          {(["all", "client", "tailor", "admin"] as RoleFilter[]).map((r) => (
            <Chip
              key={r}
              label={r === "all" ? t("admin.users.all") : ROLE_META[r].label + "s"}
              active={role === r}
              onPress={() => setRole(r)}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 8 }}>
        {!users ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState text={t("common.noUsers")} />
        ) : (
          users.map((u) => {
            const meta = ROLE_META[u.role] || ROLE_META.client;
            const Icon = meta.Icon;
            return (
              <Card key={u.id} style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={[styles.avatar, !u.is_active && styles.avatarOff]}>
                    <Icon size={16} color={u.is_active ? colors.violetPrimary : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {u.full_name}
                      </Text>
                      {u.role === "tailor" && u.verification_status && (
                        <VerificationBadge status={u.verification_status} />
                      )}
                    </View>
                    <Text style={styles.meta}>
                      {meta.label} · {u.phone}
                    </Text>
                    <Text style={styles.meta}>{t("common.registeredOn")} {formatDate(u.created_at, lang)}</Text>
                  </View>
                  <View style={[styles.statusPill, u.is_active ? styles.pillOn : styles.pillOff]}>
                    <Text style={[styles.pillText, { color: u.is_active ? colors.success : colors.error }]}>
                      {u.is_active ? t("common.active") : t("common.suspended")}
                    </Text>
                  </View>
                </View>

                {u.role !== "admin" && (
                  <TouchableOpacity
                    style={[styles.action, u.is_active ? styles.actionDanger : styles.actionOk]}
                    disabled={busyId === u.id}
                    onPress={() => toggleActive(u)}
                  >
                    {u.is_active ? (
                      <Ban size={14} color={colors.error} />
                    ) : (
                      <CheckCircle2 size={14} color={colors.success} />
                    )}
                    <Text style={[styles.actionText, { color: u.is_active ? colors.error : colors.success }]}>
                      {busyId === u.id ? "…" : u.is_active ? t("common.suspendAccount") : t("common.reactivateAccount")}
                    </Text>
                  </TouchableOpacity>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    controls: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },
    searchWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    searchInput: { flex: 1 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.violetTint,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarOff: { backgroundColor: colors.backgroundAlt },
    name: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    meta: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body, marginTop: 1 },
    statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    pillOn: { backgroundColor: colors.successBg },
    pillOff: { backgroundColor: colors.errorBg },
    pillText: { fontSize: 10, fontFamily: fonts.bodyBold },
    action: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      marginTop: 12,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    actionDanger: { borderColor: colors.error, backgroundColor: colors.errorBg },
    actionOk: { borderColor: colors.success, backgroundColor: colors.successBg },
    actionText: { fontSize: 12, fontFamily: fonts.bodySemiBold },
  });
