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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(
      0,
      aborted
        ? `Le serveur n'a pas répondu après ${Math.round(timeoutMs / 1000)} s (${API_BASE_URL}).`
        : `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré et que le téléphone est sur le même réseau.`
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
    throw new ApiError(401, "Session expirée. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.detail || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
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
