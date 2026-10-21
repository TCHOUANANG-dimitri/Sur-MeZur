import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Backend base URL. Unlike the web app (which could proxy `/api` through
 * Vite), a native app talks to an absolute host. On a physical device
 * (Expo Go), `localhost`/`10.0.2.2` never reach the dev machine, so we
 * derive the LAN IP the phone already used to load the JS bundle from Expo's
 * dev-server host (`Constants.expoConfig.hostUri`, e.g. "192.168.1.42:8081")
 * and reuse that IP on the backend's port. This makes it work out of the box
 * for Expo Go / dev-client without any manual configuration.
 *
 * Falls back to the emulator/simulator defaults when that's unavailable
 * (e.g. `expo start --web`), and can always be overridden explicitly:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.42:8000 npx expo start
 */
function getDevServerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    // Older/alternate manifest shapes some Expo Go versions still populate.
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0]?.trim();
  return host || null;
}

const devHost = getDevServerHost();
const DEFAULT_HOST = devHost || Platform.select({ android: "10.0.2.2", default: "localhost" });

/**
 * Adresse du backend de production. Sert de SECOURS en build release quand
 * `EXPO_PUBLIC_API_URL` n'a pas été injecté au bundling (variable absente de
 * l'environnement de build, bundle produit hors du profil EAS, prebuild
 * manuel...).
 *
 * Sans ce secours, le repli était `http://10.0.2.2:8000` — l'adresse de
 * l'ÉMULATEUR Android, qui ne correspond à rien sur un téléphone réel. Chaque
 * requête échouait alors instantanément (pas un timeout : une erreur réseau
 * immédiate), et l'application affichait "Connexion impossible. Vérifiez votre
 * connexion Internet." alors que le téléphone ET le serveur fonctionnaient
 * parfaitement — panne observée en production, impossible à diagnostiquer
 * depuis l'écran puisque le message accuse la connexion de l'utilisateur.
 *
 * En développement (`__DEV__`), on garde le repli LAN/émulateur : c'est là
 * qu'il est utile, et pointer vers la production depuis un poste de dev
 * masquerait un backend local non démarré.
 */
const PRODUCTION_API_URL = "http://api.gitingeniering.com";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? `http://${DEFAULT_HOST}:8000` : PRODUCTION_API_URL);
