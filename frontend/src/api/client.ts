const ACCESS_KEY = "sm_access_token";
const REFRESH_KEY = "sm_refresh_token";

let cachedAccess: string | null = null;
let cachedRefresh: string | null = null;

export function getToken(): string | null {
  if (cachedAccess !== null) return cachedAccess;
  cachedAccess = localStorage.getItem(ACCESS_KEY);
  return cachedAccess;
}

export function getRefreshToken(): string | null {
  if (cachedRefresh !== null) return cachedRefresh;
  cachedRefresh = localStorage.getItem(REFRESH_KEY);
  return cachedRefresh;
}

export function setTokens(access: string | null, refresh?: string | null) {
  cachedAccess = access;
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
        headers: { "Content-Type": "application/json" },
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

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
  isRetry = false
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

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
      return request<T>(path, options, true);
    }
    setTokens(null, null);
    clearRefreshTimer();
    onAuthFailureCallback?.();
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

export function startAuthTimer() {
  const token = getToken();
  if (token) scheduleRefresh(token);
}

export function stopAuthTimer() {
  clearRefreshTimer();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
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
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};
