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

/** Backoff (ms) entre réessais sur coupure réseau transitoire — pas sur
 *  timeout : un timeout a déjà épuisé son budget d'attente, le retenter
 *  aussitôt ne ferait que tripler l'attente pour le même échec. */
const RETRY_BACKOFF_MS = [800, 2000];

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
  options: RequestInit & { auth?: boolean; retries?: number } = {},
  isRetry = false
): Promise<T> {
  const { auth = true, headers, retries = 0, ...rest } = options;
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
    // Micro-coupure pendant un upload de plusieurs Mo (fréquent sur réseau
    // mobile instable) : on réessaie plutôt que d'obliger à reprendre les
    // photos depuis le début. Pas sur timeout — celui-ci a déjà attendu tout
    // son budget, le retenter aussitôt ne ferait que tripler l'attente.
    if (!aborted && retries > 0) {
      const attempt = RETRY_BACKOFF_MS.length - retries;
      const wait = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      await new Promise((r) => setTimeout(r, wait));
      return request<T>(path, { ...options, retries: retries - 1 }, isRetry);
    }
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
  // retries: 2 par défaut — un upload multipart (photos) est la requête la
  // plus exposée aux micro-coupures réseau, et rejouer un enregistrement de
  // fichier déjà identifié par son id de ressource ne duplique rien côté
  // serveur (voir uploadPhotos, verification, ready-to-wear photos).
  postForm: <T>(path: string, form: FormData, retries = 2) =>
    request<T>(path, { method: "POST", body: form, retries }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function fileUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

/**
 * URL du maillage glTF d'un avatar, ou `null` s'il n'y en a pas.
 *
 * Pointe toujours vers `/avatars/{id}/glb`, jamais vers `gltf_url` tel quel :
 * ce champ n'est plus un chemin public depuis que les fichiers ont été
 * déplacés hors du dossier servi en statique (voir `avatar_output_dir` côté
 * backend) — c'est désormais la SEULE route qui sait les servir, et elle
 * vérifie la propriété. Elle exige un jeton d'authentification, que
 * `Viewer3D` attache via `authHeaders()` avant de charger le modèle.
 *
 * `gltf_url` vaut `mock-asset://avatar/<id>` quand la chaîne Blender a
 * échoué et que le service s'est replié sur le mock : dans ce cas il n'existe
 * aucun fichier réel à charger, et on renvoie `null` — ce que le visualiseur
 * interprète comme « affiche le corps procédural ».
 */
export function avatarMeshUrl(avatar: { id: string; gltf_url: string | null } | null | undefined): string | null {
  if (!avatar?.gltf_url || avatar.gltf_url.startsWith("mock-asset://")) return null;
  return `${API_BASE_URL}/api/avatars/${avatar.id}/glb`;
}

/** En-têtes d'authentification pour une requête hors du client `api.*` —
 *  nécessaire pour `GLTFLoader.load()`, qui fait sa propre requête réseau. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
