import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { MeasurementsApi } from "../../src/api/endpoints";
import type { Measurement } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { MeasurementRow } from "../../src/components/DomainCards";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { useI18n } from "../../src/i18n/I18nProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { fonts } from "../../src/theme/tokens";

export default function MyMeasurements() {
  const { colors } = useTheme();
  const { t } = useI18n();
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
              {t("measurement.version")} {latest.version} · {t("measurement.source")} :{" "}
              {t(`measurement.source.${latest.source}`)}
            </Text>
            {Object.entries(latest.data)
              .map(([key, value]) => (
                <MeasurementRow key={key} measureKey={key} value={value} />
              ))}
            <Button
              fullWidth
              onPress={() => router.push({ pathname: "/client/avatar", params: { measurementId: latest.id } })}
              style={{ marginTop: 20 }}
            >
              Créer mon avatar avec ces mesures
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onPress={() => router.push("/client/measurements")}
              style={{ marginTop: 8 }}
            >
              Mettre à jour mes mesures
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}
