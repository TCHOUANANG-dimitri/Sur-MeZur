import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

const TOKEN_KEY = "sm_access_token";
let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
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
  options: RequestInit & { auth?: boolean } = {}
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

  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...rest, headers: finalHeaders });
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
