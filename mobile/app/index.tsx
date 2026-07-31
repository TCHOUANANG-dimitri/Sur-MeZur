import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useAuth } from "../src/state/AuthContext";
import { colors } from "../src/theme/tokens";

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      if (user) {
        const dest =
          user.role === "client" ? "/client/(tabs)/home" : user.role === "tailor" ? "/tailor/(tabs)/dashboard" : "/admin/(tabs)/verifications";
        router.replace(dest as never);
      } else {
        // App defaults to French (I18nProvider); language is changed from
        // Profile/settings, not forced at first launch.
        router.replace("/onboarding");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [loading, user, router]);

  return (
    <View style={styles.wrap}>
      <Image source={require("../assets/logo-full.jpeg")} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  logo: {
    width: "70%",
    height: 220,
  },
});
