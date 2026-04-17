/**
 * Expo Push Notification sender.
 * Sends server-driven push notifications to all registered device tokens
 * using the Expo Push API (https://exp.host/--/api/v2/push/send).
 *
 * No extra SDK required — uses plain fetch.
 * Expo tokens look like: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 */
import { db } from "../db";
import { pushTokens } from "@shared/schema";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo max per request (single-user: loop always runs once)

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function sendChunk(messages: ExpoPushMessage[]): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error(`[ExpoPush] HTTP ${res.status}:`, await res.text());
      return;
    }

    const json = (await res.json()) as { data: ExpoPushTicket[] };
    const errors = json.data?.filter((t) => t.status === "error") ?? [];
    if (errors.length > 0) {
      console.warn(`[ExpoPush] ${errors.length} ticket error(s):`, errors);
    }
  } catch (err) {
    console.error("[ExpoPush] Send failed:", err);
  }
}

/**
 * Send a push notification to all registered device tokens.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function sendPushToAll(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  let tokens: string[];
  try {
    const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
    tokens = rows.map((r) => r.token);
  } catch (err) {
    console.error("[ExpoPush] Failed to fetch tokens:", err);
    return;
  }

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    data,
  }));

  // Send in chunks of CHUNK_SIZE
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    await sendChunk(messages.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[ExpoPush] Sent to ${tokens.length} token(s): "${title}"`);
}
