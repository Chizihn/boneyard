/**
 * Thin API client for backend/api.
 *
 * - Attaches the access token as `Authorization: Bearer` on every request.
 * - On a 401, refreshes once via POST /auth/refresh, retries the original
 *   request with the new access token, then gives up if it 401s again.
 * - Never talks to Bachs or any payment provider directly — that all
 *   happens server-side.
 */

import * as SecureStore from "expo-secure-store";
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Dynamically resolves the base API URL for development and production.
 * Automatically extracts your computer's current Wi-Fi LAN IP from Expo
 * so you never have to manually hardcode local IP addresses when switching Wi-Fi networks.
 */
export const getIPAddressUrl = (): string => {
  const hostUri = Constants.expoConfig?.hostUri || Constants.hostUri;

  if (hostUri) {
    const lanIp = hostUri.split(':')[0];
    if (lanIp && lanIp !== 'localhost' && lanIp !== '127.0.0.1') {
      return `http://${lanIp}:4000`;
    }
  }

  // Fallback when hostUri is unavailable or resolves to localhost
  // backend/api has no "/v1" prefix (no app.setGlobalPrefix in main.ts) —
  // routes are mounted at the root, e.g. POST /auth/signup.
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:4000' // Android emulator loopback to host machine
    : 'http://localhost:4000';
};


export const BASE_URL = getIPAddressUrl();
// export const BASE_URL = "https://plotarmore-api.onrender.com"
// export const BASE_URL = "https://subtle-cuddly-colt.ngrok-free.app"
// const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const ACCESS_KEY = "hw_access_token";
const REFRESH_KEY = "hw_refresh_token";

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
  retry = true
): Promise<T> {
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Only attempt the refresh dance for a 401 on a call that actually had
  // an access token attached — that's "session expired." A 401 on a call
  // with no token (login/signup) is just "wrong credentials" and should
  // surface the backend's real message, not a confusing refresh attempt.
  if (res.status === 401 && retry && accessToken) {
    const newToken = await tryRefresh();
    if (newToken) {
      return request<T>(path, options, false);
    }
    throw new ApiError(401, "Session expired — please log in again.");
  }

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* empty */ }
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined }),
};
