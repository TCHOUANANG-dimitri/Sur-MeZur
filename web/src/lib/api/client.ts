const ACCESS_KEY = "sm_access_token";
const REFRESH_KEY = "sm_refresh_token";

let cachedAccess: string | null = null;
let cachedRefresh: string | null = null;

// Garde SSR : Next.js execute ce module aussi cote serveur lors du rendu
// initial, ou `localStorage` n'existe pas. Sans ce test, toute page
// important le client d'API planterait au build.
const hasStorage = () => typeof window !== "undefined";

export function getToken(): string | null {
  if (cachedAccess !== null) return cachedAccess;
  if (!hasStorage()) return null;
  cachedAccess = localStorage.getItem(ACCESS_KEY);
  return cachedAccess;
}

export function getRefreshToken(): string | null {
  if (cachedRefresh !== null) return cachedRefresh;
  if (!hasStorage()) return null;
  cachedRefresh = localStorage.getItem(REFRESH_KEY);
  return cachedRefresh;
}

export function setTokens(access: string | null, refresh?: string | null) {
  cachedAccess = access;
  if (!hasStorage()) return;
  if (access) localStorage.setItem(ACCESS_KEY, access);
  else localStorage.removeItem(ACCESS_KEY);

  if (refresh !== undefined) {
    cachedRefresh = refresh;
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getTokenExpiryMs(token: string): number | null {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return payload.exp * 1000;
}

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onAuthFailureCallback: (() => void) | null = null;

export function setOnAuthFailure(cb: (() => void) | null) {
  onAuthFailureCallback = cb;
}

function scheduleRefresh(token: string) {
  clearRefreshTimer();
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return;
  const delay = Math.max(expiryMs - Date.now() - REFRESH_THRESHOLD_MS, 0);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken();
  }, delay);
}

function clearRefreshTimer() {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SMZ-Platform": "web" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
      };
      setTokens(data.access_token, data.refresh_token);
      scheduleRefresh(data.access_token);
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Options propres au client d'API. `background` marque une requete de
 *  rafraichissement automatique (compteurs du menu admin) : le serveur ne la
 *  compte ni comme activite de l'utilisateur, ni pour garder une session
 *  administrateur ouverte. */
type RequestOptions = RequestInit & { auth?: boolean; background?: boolean };

async function request<T>(
  path: string,
  options: RequestOptions = {},
  isRetry = false
): Promise<T> {
  const res = await rawRequest(path, options, isRetry);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Message d'erreur lisible a partir d'une reponse FastAPI. */
async function errorMessage(res: Response): Promise<string> {
  let message = res.statusText;
  try {
    const data = await res.json();
    const detail = data.detail;
    // FastAPI renvoie `detail` sous trois formes selon le type d'erreur :
    //  - une chaine (ex. HTTPException) : on l'affiche telle quelle ;
    //  - un tableau de { loc, msg, type } (validation 422) : on extrait les
    //    `msg` en les joignant, sinon le tableau brut est rendu en
    //    `[object Object]` par React ;
    //  - tout autre objet : on ne l'affiche pas tel quel.
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      const msgs = detail
        .map((e) => (e && typeof e.msg === "string" ? e.msg : null))
        .filter((m): m is string => Boolean(m));
      if (msgs.length) message = msgs.join(". ");
    } else if (detail && typeof detail === "object" && typeof detail.msg === "string") {
      message = detail.msg;
    }
    if (res.status === 503 && data.maintenance && typeof window !== "undefined") {
      // 13.8 : le site est en maintenance ; la coquille affiche le message.
      window.dispatchEvent(new CustomEvent("smz:maintenance", { detail: message }));
    }
  } catch {
    /* ignore */
  }
  return message;
}

async function rawRequest(
  path: string,
  options: RequestOptions = {},
  isRetry = false
): Promise<Response> {
  const { auth = true, background = false, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    // Le serveur distingue le site de l'application mobile (statistiques
    // par support, journal des analyses).
    "X-SMZ-Platform": "web",
    ...(headers as Record<string, string>),
  };
  if (background) finalHeaders["X-SMZ-Background"] = "1";

  const isFormData = rest.body instanceof FormData;
  if (!isFormData && rest.body) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401 && auth && !isRetry && !path.startsWith("/auth/")) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      return rawRequest(path, options, true);
    }
    setTokens(null, null);
    clearRefreshTimer();
    onAuthFailureCallback?.();
    throw new ApiError(401, "Session expirée. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return res;
}

/** Telecharge un fichier produit par l'API (export CSV, donnees d'un
 *  utilisateur) avec le jeton de session, sans ouvrir d'onglet. */
export async function downloadFile(path: string, fallbackName = "export"): Promise<void> {
  const res = await rawRequest(path, { method: "GET" });
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function startAuthTimer() {
  const token = getToken();
  if (token) scheduleRefresh(token);
}

export function stopAuthTimer() {
  clearRefreshTimer();
}

export const api = {
  get: <T>(path: string, opts?: { background?: boolean }) =>
    request<T>(path, { method: "GET", background: opts?.background }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  post: <T>(
    path: string,
    body?: unknown,
    opts?: { auth?: boolean }
  ) =>
    request<T>(
      path,
      {
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
        auth: opts?.auth,
      }
    ),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};
