import { CameraView, useCameraPermissions } from "expo-camera";
import { X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Line, Path } from "react-native-svg";

import { useI18n } from "../i18n/I18nProvider";
import { Button } from "./Button";

export type CaptureTarget = "front" | "side";

const COUNTDOWN_SECONDS = 5;
const SILHOUETTE_HEIGHT_RATIO = 0.78;

const CONSIGNES: Record<CaptureTarget, string[]> = {
  front: ["capture.fit", "capture.distance", "capture.front.arms", "capture.front.legs", "capture.front.face"],
  side: ["capture.fit", "capture.distance", "capture.side.hands", "capture.side.profile", "capture.side.back"],
};

function SilhouetteFace({ color }: { color: string }) {
  const CORPS =
    "M50 8 C57 8 62 14 62 22 C62 28 60 32 57 35 L57 41" +
    " C68 44 76 49 80 57 L96 108 L86 113 L72 78 L70 96" +
    " C70 112 71 124 72 136 L70 158 C70 176 68 196 66 214" +
    " L64 248 L52 248 L52 214 L50 168 L48 214 L48 248 L36 248" +
    " L34 214 C32 196 30 176 30 158 L28 136 C29 124 30 112 30 96" +
    " L28 78 L14 113 L4 108 L20 57 C24 49 32 44 43 41 L43 35" +
    " C40 32 38 28 38 22 C38 14 43 8 50 8 Z";
  return (
    <Svg viewBox="0 0 100 260" width="100%" height="100%">
      <Path d={CORPS} stroke={color} strokeWidth={2.4} fill={color} fillOpacity={0.12}
            strokeLinejoin="round" />
      <Line x1="26" y1="88" x2="74" y2="88" stroke={color} strokeWidth={1}
            strokeDasharray="4 4" opacity={0.5} />
      <Line x1="27" y1="122" x2="73" y2="122" stroke={color} strokeWidth={1}
            strokeDasharray="4 4" opacity={0.5} />
    </Svg>
  );
}

function SilhouetteProfil({ color }: { color: string }) {
  const CORPS =
    "M56 8 C64 8 69 14 69 22 C69 27 67 31 64 34 L64 40" +
    " C72 43 78 49 79 58 L80 78 C80 96 78 110 76 124" +
    " L74 140 C74 152 73 160 72 168 L70 214 L68 248 L56 248" +
    " L57 214 L56 172 L50 172 L49 214 L48 248 L36 248 L38 214" +
    " L40 168 C39 160 38 152 38 140 L36 124 C34 110 33 96 34 78" +
    " L36 58 C38 48 44 42 52 40 L52 34 C49 31 47 27 47 22" +
    " C47 14 49 8 56 8 Z";
  const BRAS =
    "M64 44 C74 40 82 30 80 20 C79 15 74 12 70 14";
  return (
    <Svg viewBox="0 0 100 260" width="100%" height="100%">
      <Path d={CORPS} stroke={color} strokeWidth={2.4} fill={color} fillOpacity={0.12}
            strokeLinejoin="round" />
      <Path d={BRAS} stroke={color} strokeWidth={2.4} fill="none"
            strokeLinecap="round" opacity={0.9} />
      <Line x1="32" y1="88" x2="82" y2="88" stroke={color} strokeWidth={1}
            strokeDasharray="4 4" opacity={0.5} />
      <Line x1="33" y1="122" x2="79" y2="122" stroke={color} strokeWidth={1}
            strokeDasharray="4 4" opacity={0.5} />
    </Svg>
  );
}

/** Couleurs de la silhouette selon la phase de capture. Ce composant ne fait
 *  aucune détection réelle (pas de pose/visage analysé en direct) — le vert
 *  signale seulement que le compte à rebours est lancé, pas une pose validée
 *  par vision. Un ancien commentaire disait « vert = visage détecté », ce qui
 *  était faux et donnait une fausse impression de vérification en direct. */
const COLORS = {
  idle: "#FFFFFF",     // Blanc : en attente
  active: "#7CF5A0",   // Vert : compte à rebours en cours
};

export function GuidedCapture({
  visible,
  target,
  onCancel,
  onCaptured,
}: {
  visible: boolean;
  target: CaptureTarget;
  onCancel: () => void;
  onCaptured: (file: { uri: string; name: string; type: string }) => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (!visible) {
      setCountdown(null);
      setBusy(false);
    }
  }, [visible]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void shoot();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const shoot = async () => {
    setCountdown(null);
    const cam = cameraRef.current;
    if (!cam) return;
    setBusy(true);
    try {
      const photo = await cam.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (photo?.uri) {
        onCaptured({
          uri: photo.uri,
          name: `${target}-${Date.now()}.jpg`,
          type: "image/jpeg",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const silhouetteHeight = height * SILHOUETTE_HEIGHT_RATIO;
  const enCours = countdown !== null;
  const silhouetteColor = enCours ? COLORS.active : COLORS.idle;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        {!permission?.granted ? (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {t("capture.permission")}
            </Text>
            <Button onPress={requestPermission}>{t("capture.allow")}</Button>
            <TouchableOpacity onPress={onCancel} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
            />

            <View pointerEvents="none" style={styles.overlay}>
              <View style={{ height: silhouetteHeight, aspectRatio: 100 / 260 }}>
                {target === "front" ? (
                  <SilhouetteFace color={silhouetteColor} />
                ) : (
                  <SilhouetteProfil color={silhouetteColor} />
                )}
              </View>
            </View>

            <View pointerEvents="none" style={styles.consignes}>
              <Text style={styles.titre}>
                {t(target === "front" ? "capture.front.title" : "capture.side.title")}
              </Text>
              {CONSIGNES[target].map((c) => (
                <Text key={c} style={styles.consigne}>
                  • {t(c)}
                </Text>
              ))}
              <Text style={styles.consigne}>• {t("capture.inside")}</Text>
            </View>

            {enCours ? (
              <View pointerEvents="none" style={styles.compteur}>
                <Text style={styles.compteurTexte}>
                  {countdown}
                </Text>
                <Text style={styles.compteurAide}>{t("capture.getReady")}</Text>
              </View>
            ) : null}

            <View style={styles.barre}>
              <TouchableOpacity onPress={onCancel} style={styles.fermer} accessibilityLabel={t("common.close")}>
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Button
                  onPress={() => setCountdown(enCours ? null : COUNTDOWN_SECONDS)}
                >
                  {enCours ? t("capture.cancelCountdown") : t("capture.start").replace("{s}", String(COUNTDOWN_SECONDS))}
                </Button>
              )}
              <View style={styles.fermer} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  consignes: { position: "absolute", top: 48, left: 20, right: 20 },
  titre: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  consigne: { color: "#FFFFFF", fontSize: 13, opacity: 0.9, lineHeight: 19 },
  compteur: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  compteurTexte: { color: "#7CF5A0", fontSize: 96, fontWeight: "800" },
  compteurAide: { color: "#FFFFFF", fontSize: 15 },
  barre: {
    position: "absolute",
    bottom: 36,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fermer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  permissionText: { color: "#FFFFFF", fontSize: 15, textAlign: "center" },
  cancelLink: { padding: 10 },
  cancelLinkText: { color: "#FFFFFF", opacity: 0.8 },
});
