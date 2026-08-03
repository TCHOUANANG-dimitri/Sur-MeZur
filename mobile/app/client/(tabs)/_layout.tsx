import { Tabs } from "expo-router";
import { Home, Package, Search, Shirt, User } from "lucide-react-native";
import React from "react";
import { useI18n } from "../../../src/i18n/I18nProvider";
import { useTheme } from "../../../src/theme/ThemeProvider";
import { fonts } from "../../../src/theme/tokens";

export default function ClientTabsLayout() {
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
        name="home"
        options={{ title: t("nav.home"), tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t("nav.search"), tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="tryon"
        options={{ title: t("nav.tryon"), tabBarIcon: ({ color, size }) => <Shirt color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t("nav.orders"), tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t("nav.profile"), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
