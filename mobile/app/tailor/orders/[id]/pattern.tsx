import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { ApiError, fileUrl } from "../../../../src/api/client";
import { OrdersApi } from "../../../../src/api/endpoints";
import type { Pattern } from "../../../../src/api/types";
import { ErrorBanner, Header, Spinner } from "../../../../src/components/Misc";
import { Screen } from "../../../../src/components/Screen";
import { colors, radii } from "../../../../src/theme/tokens";

export default function PatternView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    OrdersApi.pattern(id)
      .then(setPattern)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [id]);

  return (
    <Screen scroll={false}>
      <Header title="Patron" showBack />
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {error ? <ErrorBanner message={error} /> : null}
        {!pattern ? (
          !error && <Spinner />
        ) : (
          <>
            <View style={styles.svgWrap}>
              {pattern.svg_url && <SvgUri width="100%" height={260} uri={fileUrl(pattern.svg_url) || ""} />}
            </View>
            <Text style={styles.sectionTitle}>Fiche technique</Text>
            <View style={styles.techSheet}>
              <Text style={styles.techSheetText}>{JSON.stringify(pattern.tech_sheet, null, 2)}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  svgWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    overflow: "hidden",
    marginBottom: 14,
    padding: 8,
  },
  sectionTitle: { fontWeight: "700", marginBottom: 8, color: colors.indigoText },
  techSheet: { backgroundColor: colors.backgroundAlt, padding: 12, borderRadius: radii.button },
  techSheetText: { fontSize: 11, color: colors.indigoText, fontFamily: "Courier" },
});
