import { Tabs } from "expo-router";
import { LayoutDashboard, Package, Scissors, User, Wallet } from "lucide-react-native";
import React from "react";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme } from "../../../src/theme/ThemeProvider";
import { fonts } from "../../../src/theme/tokens";

export default function TailorTabsLayout() {
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
        name="dashboard"
        options={{ title: t("nav.dashboard"), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t("nav.orders"), tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="ready-to-wear"
        options={{ title: t("nav.readyToWear"), tabBarIcon: ({ color, size }) => <Scissors color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="finances"
        options={{ title: t("nav.finances"), tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t("nav.profile"), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
