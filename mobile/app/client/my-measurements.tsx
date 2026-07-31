import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { MeasurementsApi } from "../../src/api/endpoints";
import type { Measurement } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { MeasurementRow } from "../../src/components/DomainCards";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { colors, fonts } from "../../src/theme/tokens";

export default function MyMeasurements() {
  const router = useRouter();
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);

  useEffect(() => {
    MeasurementsApi.list().then(setMeasurements);
  }, []);

  if (!measurements) return <Spinner />;

  const latest = measurements[0];

  return (
    <Screen>
      <Header title="Mes mesures" showBack />
      <View style={{ padding: 18 }}>
        {!latest ? (
          <EmptyState
            text="Vous n'avez pas encore pris vos mesures."
            cta={<Button onPress={() => router.push("/client/measurements")}>Prendre mes mesures</Button>}
          />
        ) : (
          <>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.body, marginBottom: 10 }}>
              Version {latest.version} · source : {latest.source === "ai" ? "IA" : latest.source === "manual" ? "manuelle" : "mixte"}
            </Text>
            {Object.entries(latest.data)
              .filter(([k]) => k !== "height_total")
              .map(([key, value]) => (
                <MeasurementRow key={key} measureKey={key} value={value} />
              ))}
            <Button fullWidth onPress={() => router.push("/client/measurements")} style={{ marginTop: 20 }}>
              Mettre à jour mes mesures
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}
