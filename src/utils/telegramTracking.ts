/**
 * Telegram channel tracking – wallet tracker backend API.
 * Uses NEXT_PUBLIC_WALLET_TRACKER_URL for all requests.
 */

import { env } from "../env";

const getWalletTrackerUrl = () => {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";
  }
  return env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";
};

const WALLET_TRACKER_API_URL = getWalletTrackerUrl();

export interface TelegramChannelDb {
  id: string;
  username: string;
  createdAt: string;
  ownerId?: string | null;
}

export interface TelegramChannelInfo {
  ok?: boolean;
  username: string;
  title?: string;
  link: string;
  id?: string;
}

export interface TelegramMessageEntity {
  offset: number;
  length: number;
  type: string;
  url?: string;
  language?: string;
}

export interface TelegramChannelMessage {
  id: number;
  text: string;
  date: number;
  channelUsername: string;
  entities?: TelegramMessageEntity[];
}

/**
 * Get list of approved (trackable) channel usernames from the backend.
 */
export async function getApprovedTelegramChannels(): Promise<string[]> {
  try {
    const url = `${WALLET_TRACKER_API_URL}/api/telegram/approved-channels`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.channels) ? data.channels : [];
  } catch (error) {
    console.error("Error fetching approved Telegram channels:", error);
    return [];
  }
}

/**
 * Get tracked Telegram channels for the current user (requires auth).
 * Backend returns { ok: true, channels: TelegramChannel[] }.
 */
export async function getTrackedTelegramChannels(
  authToken: string,
): Promise<TelegramChannelDb[]> {
  try {
    const url = `${WALLET_TRACKER_API_URL}/api/telegram`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch channels");
    }
    const data = await response.json();
    if (data?.channels && Array.isArray(data.channels)) return data.channels;
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error("Error getting tracked Telegram channels:", error);
    throw error;
  }
}

/**
 * Add a Telegram channel to the user's track list (requires auth).
 */
export async function addTrackedTelegramChannel(
  username: string,
  authToken: string,
): Promise<{ telegramChannel: TelegramChannelDb }> {
  const clean = username.trim().replace(/^@/, "");
  const response = await fetch(`${WALLET_TRACKER_API_URL}/api/telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ username: clean }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to add channel");
  }
  return response.json();
}

/**
 * Remove a tracked Telegram channel (requires auth).
 */
export async function removeTrackedTelegramChannel(
  username: string,
  authToken: string,
): Promise<void> {
  const clean = username.trim().replace(/^@/, "");
  const url = `${WALLET_TRACKER_API_URL}/api/telegram/${encodeURIComponent(clean)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to remove channel");
  }
}

/**
 * Get channel info by username (title, link). No auth required.
 */
export async function getTelegramChannelInfo(
  username: string,
): Promise<TelegramChannelInfo | null> {
  try {
    const clean = username.trim().replace(/^@/, "");
    const url = `${WALLET_TRACKER_API_URL}/api/telegram/channel-info?username=${encodeURIComponent(clean)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok ? data : null;
  } catch (error) {
    console.error("Error fetching Telegram channel info:", error);
    return null;
  }
}

export interface TelegramFeedResponse {
  messages: TelegramChannelMessage[];
  hint?: string;
}

/**
 * Get latest messages from all tracked Telegram channels (requires auth).
 * Backend requires Telegram MTProto client to be configured.
 *
 * Pass `force` to bypass the backend's Redis cache (e.g. manual refresh button).
 */
export async function getTelegramChannelFeed(
  authToken: string,
  limit: number = 10,
  force: boolean = false,
): Promise<TelegramFeedResponse> {
  const params = new URLSearchParams({
    limit: String(Math.max(1, Math.min(limit, 20))),
    _: String(Date.now()),
  });
  if (force) params.set("force", "1");
  const url = `${WALLET_TRACKER_API_URL}/api/telegram/feed?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch channel messages");
  }
  const data = await response.json();
  return {
    messages: Array.isArray(data?.messages) ? data.messages : [],
    hint: data?.hint,
  };
}
