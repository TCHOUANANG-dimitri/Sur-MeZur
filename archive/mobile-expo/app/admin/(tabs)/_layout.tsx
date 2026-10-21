import { Tabs } from "expo-router";
import { BadgeCheck, LayoutDashboard, Percent, Scale, Shirt, Users } from "lucide-react-native";
import React from "react";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme } from "../../../src/theme/ThemeProvider";
import { fonts } from "../../../src/theme/tokens";

export default function AdminTabsLayout() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violetPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{ title: t("nav.overview"), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="users"
        options={{ title: t("nav.users"), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: "Catalogue", tabBarIcon: ({ color, size }) => <Shirt color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="verifications"
        options={{ title: t("admin.verifications"), tabBarIcon: ({ color, size }) => <BadgeCheck color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: t("admin.disputes"), tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="commission"
        options={{ title: t("admin.commission"), tabBarIcon: ({ color, size }) => <Percent color={color} size={size} /> }}
      />
    </Tabs>
  );
}
