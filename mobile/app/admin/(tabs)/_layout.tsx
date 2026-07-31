import { Tabs } from "expo-router";
import { BadgeCheck, Percent, Scale, Star } from "lucide-react-native";
import React from "react";
import { colors, fonts } from "../../../src/theme/tokens";

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violetPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="verifications"
        options={{ title: "Vérifications", tabBarIcon: ({ color, size }) => <BadgeCheck color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: "Litiges", tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="reviews"
        options={{ title: "Avis", tabBarIcon: ({ color, size }) => <Star color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="commission"
        options={{ title: "Commission", tabBarIcon: ({ color, size }) => <Percent color={color} size={size} /> }}
      />
    </Tabs>
  );
}
