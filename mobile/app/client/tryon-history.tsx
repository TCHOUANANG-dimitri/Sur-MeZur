import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AvatarsApi, CatalogApi, MeasurementsApi, TryonApi } from "../../src/api/endpoints";
import type { Avatar, Fabric, GarmentModel, Measurement, TryonSession } from "../../src/api/types";
import { Button } from "../../src/components/Button";
import { EmptyState, Header, Spinner } from "../../src/components/Misc";
import { Screen } from "../../src/components/Screen";
import { Viewer3D } from "../../src/components/Viewer3D";
import { colors, fonts, radii } from "../../src/theme/tokens";

export default function TryonHistory() {
  const router = useRouter();
  const [sessions, setSessions] = useState<TryonSession[] | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [selected, setSelected] = useState<TryonSession | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    TryonApi.list().then(setSessions);
    CatalogApi.models().then(setModels);
    CatalogApi.fabrics().then(setFabrics);
  }, []);

  const selectSession = async (session: TryonSession) => {
    setSelected(session);
    setLoadingDetail(true);
    try {
      const avatar = await AvatarsApi.get(session.avatar_id);
      setSelectedAvatar(avatar);
      const list = await MeasurementsApi.list();
      setSelectedMeasurement(list.find((m) => m.id === avatar.measurement_id) || null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const goToOrder = () => {
    if (!selected || !selectedAvatar) return;
    router.push({
      pathname: "/client/orders/new",
      params: {
        avatarId: selected.avatar_id,
        modelId: selected.garment_model_id || "",
        measurementId: selectedAvatar.measurement_id,
        fabricId: selected.fabric_id || "",
        accessories: selected.accessory_ids.join(","),
      },
    });
  };

  if (!sessions) return <Spinner />;

  if (selected) {
    const model = models.find((m) => m.id === selected.garment_model_id);
    const fabric = fabrics.find((f) => f.id === selected.fabric_id);
    return (
      <Screen>
        <Header title={model?.name || "Essayage"} showBack />
        <View style={{ padding: 18 }}>
          {loadingDetail || !selectedAvatar ? (
            <Spinner />
          ) : (
            <>
              <Viewer3D
                skinToneHex={selectedAvatar.skin_tone_hex}
                garmentColorHex={fabric?.color_hex}
                measurements={selectedMeasurement?.data}
                height={340}
              />
              <Text style={styles.detailText}>
                {model?.name} {fabric ? `· ${fabric.name}` : ""}
              </Text>
              <Button fullWidth onPress={goToOrder} style={{ marginTop: 16 }}>
                Passer commande
              </Button>
              <Button variant="secondary" fullWidth onPress={() => setSelected(null)} style={{ marginTop: 8 }}>
                Retour à la liste
              </Button>
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Mes essayages" showBack />
      <View style={{ padding: 18 }}>
        {sessions.length === 0 ? (
          <EmptyState text="Vous n'avez pas encore finalisé d'essayage." />
        ) : (
          <View style={styles.grid}>
            {sessions.map((s) => {
              const model = models.find((m) => m.id === s.garment_model_id);
              const fabric = fabrics.find((f) => f.id === s.fabric_id);
              return (
                <TouchableOpacity key={s.id} style={styles.item} onPress={() => selectSession(s)}>
                  <LinearGradient
                    colors={[fabric?.color_hex || model?.thumbnail_color || colors.violetPrimary, colors.indigoText]}
                    style={styles.thumb}
                  />
                  <Text style={styles.name}>{model?.name || "Modèle"}</Text>
                  {fabric && <Text style={styles.sub}>{fabric.name}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { width: "47%" },
  thumb: { height: 140, borderRadius: radii.card },
  name: { fontSize: 12, fontFamily: fonts.bodySemiBold, marginTop: 8, color: colors.indigoText },
  sub: { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.body },
  detailText: { marginTop: 14, fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.indigoText, textAlign: "center" },
});
