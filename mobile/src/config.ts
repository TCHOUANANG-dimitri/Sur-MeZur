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

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${DEFAULT_HOST}:8000`;
