import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";

/**
 * Gets the base URL for the Express API server
 * In development: uses EXPO_PUBLIC_DOMAIN (Replit dev server)
 * In production builds: uses extra.API_BASE_URL from app.json
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) {
    return `https://${host}`;
  }

  const extraApiUrl = Constants.expoConfig?.extra?.API_BASE_URL;
  if (extraApiUrl && extraApiUrl !== "YOUR_DEPLOYED_REPLIT_URL_HERE") {
    return extraApiUrl;
  }

  throw new Error(
    "No API URL configured. Set EXPO_PUBLIC_API_BASE_URL or update app.json extra.API_BASE_URL"
  );
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    // Honour React Query's own cancellation signal too
    signal?.addEventListener("abort", () => controller.abort());

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
    },
  },
});
