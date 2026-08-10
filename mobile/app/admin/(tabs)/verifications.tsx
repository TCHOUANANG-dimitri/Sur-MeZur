import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { fileUrl } from "../../../src/api/client";
import { AdminApi } from "../../../src/api/endpoints";
import type { TailorProfile, VerificationDocument } from "../../../src/api/types";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState, Header, Spinner } from "../../../src/components/Misc";
import { Screen } from "../../../src/components/Screen";
import { useThemedStyles } from "../../../src/theme/ThemeProvider";
import { fonts, radii, type ThemeColors } from "../../../src/theme/tokens";

const DOC_LABEL: Record<VerificationDocument["type"], string> = {
  id_card: "Pièce d'identité",
  portfolio: "Portfolio",
  atelier_photo: "Photo de l'atelier",
};

export default function Verifications() {
  const styles = useThemedStyles(makeStyles);
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docs, setDocs] = useState<Record<string, VerificationDocument[]>>({});

  const load = useCallback(() => {
    AdminApi.pendingVerifications().then((list) => {
      setTailors(list);
      // Documents du dossier, récupérés en parallèle : l'admin doit pouvoir
      // voir la pièce d'identité, le portfolio et l'atelier avant de statuer.
      Promise.all(list.map((tl) => AdminApi.verificationDocuments(tl.id).catch(() => []))).then(
        (perTailor) => {
          const map: Record<string, VerificationDocument[]> = {};
          list.forEach((tl, i) => (map[tl.id] = perTailor[i]));
          setDocs(map);
        }
      );
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = async (id: string, status: "approved" | "rejected") => {
    await AdminApi.decideVerification(id, status);
    load();
  };

  if (!tailors) return <Spinner />;

  return (
    <Screen>
      <Header title="Vérifications" />
      <View style={{ padding: 18 }}>
        {tailors.length === 0 ? (
          <EmptyState text="Aucune vérification en attente." />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} style={{ marginBottom: 10 }}>
              <Text style={styles.name}>{tl.shop_name}</Text>
              <Text style={styles.meta}>
                {tl.tailor_type === "atelier" ? "Atelier" : "Individu"} · {tl.city}
              </Text>
              <Text style={styles.bio}>{tl.bio}</Text>

              {(docs[tl.id] ?? []).length > 0 && (
                <View style={styles.docs}>
                  {(docs[tl.id] ?? []).map((d) => (
                    <View key={d.id} style={styles.doc}>
                      <Image source={{ uri: fileUrl(d.file_url) }} style={styles.docThumb} resizeMode="cover" />
                      <Text style={styles.docLabel}>{DOC_LABEL[d.type] ?? d.type}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button variant="danger" onPress={() => decide(tl.id, "rejected")} style={{ flex: 1 }}>
                  Rejeter
                </Button>
                <Button onPress={() => decide(tl.id, "approved")} style={{ flex: 1 }}>
                  Approuver
                </Button>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    name: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.indigoText },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontFamily: fonts.body },
    bio: { fontSize: 12, marginTop: 8, color: colors.indigoText, fontFamily: fonts.body },
    docs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    doc: { width: 92, gap: 4 },
    docThumb: { height: 92, borderRadius: radii.card, backgroundColor: colors.backgroundAlt },
    docLabel: { fontSize: 10, color: colors.textSecondary, fontFamily: fonts.body, textAlign: "center" },
  });