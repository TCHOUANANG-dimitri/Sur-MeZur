import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

const ACCESS_KEY = "sm_access_token";
const REFRESH_KEY = "sm_refresh_token";

let cachedAccess: string | null | undefined;
let cachedRefresh: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedAccess !== undefined) return cachedAccess;
  cachedAccess = await AsyncStorage.getItem(ACCESS_KEY);
  return cachedAccess;
}

export async function getRefreshToken(): Promise<string | null> {
  if (cachedRefresh !== undefined) return cachedRefresh;
  cachedRefresh = await AsyncStorage.getItem(REFRESH_KEY);
  return cachedRefresh;
}

/**
 * Access tokens live 60 min while refresh tokens live 30 days, so the refresh
 * token must be persisted too — storing only the access token is what made
 * sessions die after an hour with no way back.
 */
export async function setTokens(access: string | null, refresh?: string | null) {
  cachedAccess = access;
  if (access) await AsyncStorage.setItem(ACCESS_KEY, access);
  else await AsyncStorage.removeItem(ACCESS_KEY);

  if (refresh !== undefined) {
    cachedRefresh = refresh;
    if (refresh) await AsyncStorage.setItem(REFRESH_KEY, refresh);
    else await AsyncStorage.removeItem(REFRESH_KEY);
  }
}

/** Back-compat helper: clearing the access token also clears the refresh one. */
export async function setToken(token: string | null) {
  await setTokens(token, token ? undefined : null);
}

export class ApiError extends Error {
  status: number;
  /** Détail technique d'origine : conservé pour le journal, jamais affiché.
   *  `message` porte, lui, un texte destiné à l'utilisateur. */
  technicalDetail?: string;
  constructor(status: number, message: string, technicalDetail?: string) {
    super(message);
    this.status = status;
    this.technicalDetail = technicalDetail;
  }
}

/** Traduction des messages d'erreur.
 *
 *  Ce module n'est pas un composant et ne peut pas utiliser le hook de langue.
 *  `I18nProvider` enregistre ici sa fonction de traduction, ce qui évite de
 *  figer les messages d'erreur en français alors que le reste de l'interface
 *  suit la langue choisie. Sans traducteur enregistré, on retombe sur la clé,
 *  ce qui reste visible en développement plutôt que silencieux. */
type Translator = (key: string) => string;
let translate: Translator = (key) => key;
export function setErrorTranslator(fn: Translator) {
  translate = fn;
}

/**
 * Message destiné à l'utilisateur pour une réponse d'erreur du serveur.
 *
 * Le `detail` du serveur n'est réutilisé que si c'est une CHAÎNE et que le
 * statut est une erreur client (4xx) : ces messages-là sont écrits à
 * l'intention du client (consignes de reprise de photo, « aucun compte avec ce
 * numéro »…). Tout le reste est remplacé :
 *
 *   - un 5xx signale une panne serveur, que l'utilisateur ne peut pas corriger
 *     et dont le détail ne lui apprendrait rien ;
 *   - une erreur de validation FastAPI renvoie un `detail` qui est un TABLEAU
 *     d'objets — affiché tel quel, l'utilisateur lisait « [object Object] ».
 */
function userFacingMessage(status: number, detail: unknown): string {
  if (status >= 400 && status < 500 && typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (status === 404) return translate("error.notFound");
  if (status === 409) return translate("error.conflict");
  if (status >= 400 && status < 500) return translate("error.request");
  return translate("error.server");
}

/**
 * Message affichable pour n'importe quelle exception.
 *
 * À utiliser partout où une erreur atterrit à l'écran, plutôt que
 * `String(e)` : une exception qui n'est pas une `ApiError` (bug JavaScript,
 * réponse malformée) livrerait sinon une trace technique au client. Les
 * `ApiError` portent déjà, elles, un message écrit pour lui.
 */
export function userMessage(e: unknown): string {
  // `ApiError` porte par contrat un message destiné au client. Un écran qui
  // veut afficher un texte qu'il maîtrise doit donc lever une `ApiError`, pas
  // une `Error` nue — voir l'écran de prise de mesures, qui relaie ainsi la
  // consigne de reprise rédigée par le serveur.
  if (e instanceof ApiError) return e.message;
  console.warn("[app] erreur non-API", e);
  return translate("error.unexpected");
}

/** Lets AuthContext drop the user back to the login screen when the session is
 *  truly unrecoverable, instead of every screen throwing on its own. */
type AuthFailureHandler = () => void;
let onAuthFailure: AuthFailureHandler | null = null;
export function setAuthFailureHandler(fn: AuthFailureHandler | null) {
  onAuthFailure = fn;
}

/** Without these, an unreachable backend leaves `fetch` pending forever and the
 *  caller spins with no error to show. Uploads get a longer budget. */
const REQUEST_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 60000;

// Single-flight: several screens fire requests in parallel, and they would all
// hit 401 at the same moment. Without sharing one refresh, each would spend the
// refresh token separately and race.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      // Deliberately a bare fetch: going through `request` would recurse back
      // into this same 401 handling.
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { access_token: string; refresh_token: string };
      await setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
  isRetry = false
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string>) };

  const isFormData = rest.body instanceof FormData;
  if (!isFormData && rest.body) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = await getToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutMs = isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      ...rest,
      headers: finalHeaders,
      signal: controller.signal,
    });
  } catch (e) {
    // L'adresse du serveur et l'état du backend ne regardent pas l'utilisateur :
    // il ne peut agir que sur sa propre connexion. L'URL reste dans
    // `technicalDetail`, pour le journal.
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(
      0,
      translate(aborted ? "error.timeout" : "error.offline"),
      `${aborted ? "timeout" : "network"} ${Math.round(timeoutMs / 1000)}s ${API_BASE_URL}${path}`
    );
  } finally {
    clearTimeout(timer);
  }

  // Expired access token: renew once, transparently, then replay the call.
  if (res.status === 401 && auth && !isRetry && !path.startsWith("/auth/")) {
    const renewed = await refreshAccessToken();
    if (renewed) return request<T>(path, options, true);
    await setTokens(null, null);
    onAuthFailure?.();
    throw new ApiError(401, translate("error.sessionExpired"));
  }

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json())?.detail;
    } catch {
      /* réponse non JSON : on s'en tient au statut */
    }
    if (res.status >= 500) {
      console.warn(`[api] ${res.status} ${path}`, detail ?? res.statusText);
    }
    throw new ApiError(
      res.status,
      userFacingMessage(res.status, detail),
      typeof detail === "string" ? detail : JSON.stringify(detail ?? res.statusText)
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      auth: opts?.auth,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function fileUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

/**
 * URL absolue du maillage glTF d'un avatar, ou `null` s'il n'y en a pas.
 *
 * `gltf_url` prend deux formes selon l'issue de la génération : un chemin
 * `/uploads/avatars/....glb` quand Blender a produit un vrai maillage, ou
 * `mock-asset://avatar/<id>` quand la chaîne s'est repliée sur le mock
 * (Blender absent, délai dépassé). Le second n'est pas une adresse : le passer
 * à `fileUrl` fabriquerait `https://hoteMock-asset://...`, que le chargeur
 * glTF tenterait puis échouerait à récupérer. On renvoie `null`, ce que le
 * visualiseur interprète comme « affiche le corps procédural ».
 */
export function avatarMeshUrl(gltfUrl: string | null | undefined): string | null {
  if (!gltfUrl || gltfUrl.startsWith("mock-asset://")) return null;
  return fileUrl(gltfUrl) ?? null;
}
