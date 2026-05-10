/**
 * Per-device anonymous user credentials.
 *
 * On first launch we POST /api/auth/device to mint a fresh userId + bearer
 * token, then persist both to expo-secure-store. Every subsequent API request
 * attaches `Authorization: Bearer <token>`. The userId/token survive app
 * restarts but are device-local — uninstalling the app or clearing secure
 * storage produces a new identity.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const USER_ID_KEY = "txdistnav.userId";
const USER_TOKEN_KEY = "txdistnav.userToken";

export interface UserCredentials {
  userId: string;
  token: string;
}

let cached: UserCredentials | null = null;
let inFlight: Promise<UserCredentials> | null = null;

function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) return `https://${host}`;
  const extra = (Constants.expoConfig?.extra as { API_BASE_URL?: string } | undefined)?.API_BASE_URL;
  if (extra && extra !== "YOUR_DEPLOYED_REPLIT_URL_HERE") return extra;
  throw new Error("No API URL configured for userAuth");
}

async function readStored(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStored(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Best-effort; if storage fails the credentials live only in memory.
  }
}

async function issueFromServer(): Promise<UserCredentials> {
  const base = getApiBase();
  const url = new URL("/api/auth/device", base).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Failed to register device: ${res.status}`);
  }
  const data = (await res.json()) as Partial<UserCredentials>;
  if (!data.userId || !data.token) {
    throw new Error("Device registration response missing userId/token");
  }
  return { userId: data.userId, token: data.token };
}

/**
 * Returns the current device credentials, lazily creating them on first use.
 * Concurrent callers share the same in-flight promise so the server only sees
 * one /api/auth/device call per cold start.
 */
export async function getUserCredentials(): Promise<UserCredentials> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [userId, token] = await Promise.all([
        readStored(USER_ID_KEY),
        readStored(USER_TOKEN_KEY),
      ]);
      if (userId && token) {
        cached = { userId, token };
        return cached;
      }
      const fresh = await issueFromServer();
      await Promise.all([
        writeStored(USER_ID_KEY, fresh.userId),
        writeStored(USER_TOKEN_KEY, fresh.token),
      ]);
      cached = fresh;
      return cached;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Convenience for fetch headers. Resolves to {} if credentials cannot be obtained. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { token } = await getUserCredentials();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/**
 * Replace the stored credentials with admin-issued ones (e.g. to adopt the
 * legacy "default" data set). Exposed for a future settings/import UI.
 */
export async function importUserCredentials(creds: UserCredentials): Promise<void> {
  if (!creds.userId || !creds.token) throw new Error("Invalid credentials");
  await Promise.all([
    writeStored(USER_ID_KEY, creds.userId),
    writeStored(USER_TOKEN_KEY, creds.token),
  ]);
  cached = { ...creds };
}
