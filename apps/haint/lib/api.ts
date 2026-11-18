/**
 * Thin API client for backend/api.
 *
 * - Attaches the access token as `Authorization: Bearer` on every request.
 * - On a 401, refreshes once via POST /auth/refresh and retries — but ONLY
 *   when there was an access token to begin with. If there was no token, the
 *   request is unauthenticated and a 401 means wrong credentials, not an
 *   expired session; attempting a refresh here would cause a wrong-password
 *   error to surface as "session expired."
 * - Never talks to Bachs or any payment provider directly.
 */

import * as SecureStore from "expo-secure-store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const ACCESS_KEY = "hn_access_token";
const REFRESH_KEY = "hn_refresh_token";

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

/** Attempt a silent refresh. Returns the new access token, or null on failure. */
async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return null;
    }
    const data = await res.json();
    await saveTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  hadToken = false,
  retry = true
): Promise<T> {
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && (accessToken != null)) {
    // Only attempt refresh when we sent a token — not on credential failures
    const newToken = await tryRefresh();
    if (newToken) {
      return request<T>(path, options, true, false);
    }
    throw new ApiError(401, "Session expired — please log in again.");
  }

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* empty */ }
    const message =
      body != null && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
