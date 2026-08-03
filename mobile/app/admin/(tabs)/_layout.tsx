import { Tabs } from "expo-router";
import { BadgeCheck, LayoutDashboard, Percent, Scale, Users } from "lucide-react-native";
import React from "react";
import { useTheme } from "../../../src/theme/ThemeProvider";
import { fonts } from "../../../src/theme/tokens";

export default function AdminTabsLayout() {
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
        options={{ title: "Vue d'ensemble", tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="users"
        options={{ title: "Utilisateurs", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="verifications"
        options={{ title: "Vérifications", tabBarIcon: ({ color, size }) => <BadgeCheck color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: "Litiges", tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="commission"
        options={{ title: "Commission", tabBarIcon: ({ color, size }) => <Percent color={color} size={size} /> }}
      />
    </Tabs>
  );
}
