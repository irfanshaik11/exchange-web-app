/**
 * Twitter Tracking Utilities
 * Provides functions to track Twitter accounts and fetch their tweets
 */

import { env } from "../env";

// Get wallet tracker backend URL
const getWalletTrackerUrl = () => {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";
  }
  return env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";
};

const WALLET_TRACKER_API_URL = getWalletTrackerUrl();

// Default timeout for tracker HTTP calls. We never want the "Adding..." spinner
// to wait on an upstream X API rate-limit retry — the backend can be told to
// wait minutes on 429, and the user shouldn't.
const TRACKER_HTTP_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = TRACKER_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Request timed out — try again in a moment");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const resolveWsUrl = () => {
  const envWs = process.env.NEXT_PUBLIC_WALLET_TRACKER_WS_URL;
  if (!envWs) return "";
  if (envWs.startsWith("http://")) return envWs.replace(/^http:\/\//, "ws://");
  if (envWs.startsWith("https://"))
    return envWs.replace(/^https:\/\//, "wss://");
  return envWs;
};
const WALLET_TRACKER_WS_URL = resolveWsUrl();

// One-shot startup audit: NEXT_PUBLIC_* env vars are inlined at build time on
// Vercel, so a missed env var produces a *silent* stub WebSocket and silent
// same-origin HTTP fetches. Warn loudly in the browser so a misconfigured
// production deploy can't quietly ship without real-time updates / tracker
// API connectivity. SSR skipped to keep build logs quiet.
if (typeof window !== "undefined") {
  if (!WALLET_TRACKER_WS_URL) {
    console.warn(
      "[twitterTracking] NEXT_PUBLIC_WALLET_TRACKER_WS_URL is not set. " +
        "Real-time X tracker updates are disabled — createTwitterTrackerWebSocket() " +
        "will return a no-op stub. Set the env var and rebuild to re-enable.",
    );
  }
  if (!WALLET_TRACKER_API_URL) {
    console.warn(
      "[twitterTracking] NEXT_PUBLIC_WALLET_TRACKER_URL is not set. " +
        "Tracker HTTP calls will hit same-origin paths and likely 404. " +
        "Set the env var and rebuild.",
    );
  }
}

// Database model - minimal storage
export interface TwitterAccountDb {
  id: string;
  username: string;
  createdAt: string;
  ownerId?: string | null;
}

// Full model with fetched Twitter data
export interface TwitterAccount {
  id: string;
  username: string;
  name: string;
  twitterId?: string;
  profileImageUrl?: string;
  description?: string;
  followers?: number;
  createdAt: string;
  ownerId?: string | null;
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorProfileImage?: string;
  createdAt: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  url?: string;
  images?: string[];
}

/**
 * Add a Twitter account to track.
 *
 * No client-side Twitter pre-flight: the backend validates against the
 * approved-handles list (the source of truth for who can be tracked), and
 * the poller hydrates profile data asynchronously. The previous pre-flight
 * call to /api/twitter/user-info caused the "Adding..." spinner to hang
 * forever whenever the upstream X API was rate-limited.
 */
export async function addTrackedTwitterAccount(
  username: string,
  authToken: string,
): Promise<TwitterAccountDb> {
  try {
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    if (!normalized) throw new Error("Username is required");

    const response = await fetchWithTimeout(
      `${WALLET_TRACKER_API_URL}/api/twitter`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ username: normalized }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || "Failed to add Twitter account";
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.twitterAccount;
  } catch (error: any) {
    console.error("Error adding Twitter account:", error);
    throw error;
  }
}

/**
 * Remove a tracked Twitter account
 * SECURITY FIX: Now requires authentication token - ownerId parameter is ignored by backend
 */
export async function removeTrackedTwitterAccount(
  username: string,
  authToken: string,
): Promise<void> {
  try {
    const url = `${WALLET_TRACKER_API_URL}/api/twitter/${encodeURIComponent(username)}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${authToken}`,
    };

    const response = await fetchWithTimeout(url, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error || "Failed to remove Twitter account";
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error("Error removing Twitter account:", error);
    throw error;
  }
}

/**
 * Get all tracked Twitter accounts (from database)
 * SECURITY FIX: Now requires authentication token - ownerId parameter is ignored by backend
 */
/**
 * Fetch the list of approved (trackable) Twitter handles.
 * Uses same-origin API route to avoid CORS; the route proxies to the wallet tracker backend.
 */
export async function getApprovedTwitterHandles(): Promise<string[]> {
  try {
    const url =
      typeof window !== "undefined"
        ? "/api/twitter/approved-handles"
        : `${WALLET_TRACKER_API_URL}/api/twitter/approved-handles`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.handles) ? data.handles : [];
  } catch (error) {
    console.error("Error fetching approved Twitter handles:", error);
    return [];
  }
}

export async function getTrackedTwitterAccountsDb(
  authToken: string,
  options: { fresh?: boolean } = {},
): Promise<TwitterAccountDb[]> {
  try {
    // Backend sets `Cache-Control: max-age=30` for normal refresh paths,
    // which means an immediate refetch after a destructive action (add /
    // remove) hits the browser cache and returns stale data. `fresh: true`
    // bypasses both the HTTP cache (`cache: 'no-store'`) and any intermediate
    // CDN by appending a cache-buster query param.
    const cacheBust = options.fresh ? `?_=${Date.now()}` : "";
    const url = `${WALLET_TRACKER_API_URL}/api/twitter${cacheBust}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${authToken}`,
    };

    const response = await fetchWithTimeout(url, {
      headers,
      cache: options.fresh ? "no-store" : "default",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Failed to fetch Twitter accounts:", errorData);
      return [];
    }

    const accounts = await response.json();
    return accounts;
  } catch (error) {
    console.error("Error getting tracked Twitter accounts:", error);
    return [];
  }
}

/**
 * Get all tracked Twitter accounts.
 *
 * The backend GET /api/twitter response already includes cached profile
 * fields (name, profileImageUrl, followers, etc.) read from Redis in a
 * single round trip. Rows whose cache hasn't warmed yet come back with
 * bare fields — the WS will deliver enriched data as the poller fills
 * them in. No per-row /user-info fan-out from the client, which is what
 * was timing out at 15s.
 */
export async function getTrackedTwitterAccounts(
  authToken: string,
  options: { fresh?: boolean } = {},
): Promise<TwitterAccount[]> {
  const rows = await getTrackedTwitterAccountsDb(authToken, options);
  return rows.map((row: any) => ({
    id: row.id,
    username: row.username,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    name: row.name || row.username,
    twitterId: row.twitterId,
    profileImageUrl: row.profileImageUrl,
    description: row.description,
    followers: typeof row.followers === "number" ? row.followers : undefined,
  }));
}

/**
 * Get Twitter user info by username
 */
export async function getTwitterUserInfo(
  username: string,
): Promise<TwitterAccount | null> {
  try {
    const response = await fetchWithTimeout(
      `${WALLET_TRACKER_API_URL}/api/twitter/user-info?username=${encodeURIComponent(username)}&_=${Date.now()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error || error.message || "Failed to fetch Twitter user info",
      );
    }

    const data = await response.json();
    // Backend returns { ok: true, ...userInfo }, so we need to extract the user info
    if (data.ok) {
      const { ok, ...userInfo } = data;
      return userInfo;
    }
    return data;
  } catch (error: any) {
    console.error("Error fetching Twitter user info:", error);
    throw error;
  }
}

/**
 * Get tweets from tracked accounts.
 *
 * The backend `/api/twitter/feed` route is authenticated, so `authToken` is
 * required. Returns `[]` on any error so callers shouldn't crash the page
 * when the feed isn't reachable yet, but we log loudly when the token is
 * empty — that's the only failure mode the type system can't catch.
 *
 * Argument order: (usernames, authToken, maxResults). `authToken` was
 * deliberately moved ahead of the defaulted `maxResults` so a future
 * caller that forgets it gets a compile-time error instead of a silent
 * empty feed.
 */
export async function getTwitterFeed(
  usernames: string[],
  authToken: string,
  maxResults: number = 20,
): Promise<Tweet[]> {
  try {
    if (usernames.length === 0) return [];
    if (!authToken) {
      console.warn(
        "[twitterTracking] getTwitterFeed called without an authToken — " +
          "/api/twitter/feed is authenticated. Returning empty feed.",
      );
      return [];
    }

    const response = await fetchWithTimeout(
      `${WALLET_TRACKER_API_URL}/api/twitter/feed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ usernames, maxResults }),
      },
    );

    if (!response.ok) {
      // Don't throw — surface as empty feed; the WS will hydrate it as new
      // tweets arrive and a transient 401/5xx shouldn't crash the page.
      console.warn(
        "[twitterTracking] feed fetch failed:",
        response.status,
        response.statusText,
      );
      return [];
    }

    const data = await response.json();
    return data.tweets || [];
  } catch (error: any) {
    console.error("Error fetching Twitter feed:", error);
    return [];
  }
}

/**
 * Get tweets from a specific user
 */
export async function getUserTweets(
  username: string,
  maxResults: number = 20,
): Promise<Tweet[]> {
  try {
    // 35s timeout — backend cold-start does up to two upstream attempts
    // (each ~14s through the 5.5s pacer) plus a short cache-poll fallback.
    // `cache: no-store` + cache-bust query so a View-retry click always
    // reaches the backend instead of hitting a cached empty response.
    const cacheBust = `&_=${Date.now()}`;
    const response = await fetchWithTimeout(
      `${WALLET_TRACKER_API_URL}/api/twitter/user-tweets?username=${encodeURIComponent(username)}&maxResults=${maxResults}${cacheBust}`,
      { cache: "no-store" },
      35_000,
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error || error.message || "Failed to fetch user tweets",
      );
    }

    const data = await response.json();
    // Backend returns { ok: true, tweets: [...] }
    return data.tweets || [];
  } catch (error: any) {
    console.error("Error fetching user tweets:", error);
    return [];
  }
}

// ===== Real-time Twitter WebSocket =====
//
// Subscribes to per-username "tw:new:*" pub/sub rooms on the wallet-tracker
// WS endpoint. The poller worker publishes a NormalizedTweet each time it
// observes a fresh tweet for one of the tracked accounts.

export interface TwitterTrackerWebSocket {
  subscribe: (usernames: string[]) => void;
  unsubscribe: (usernames: string[]) => void;
  close: () => void;
}

const normalizeHandle = (u: string) =>
  u.trim().replace(/^@/, "").toLowerCase();

/**
 * Map a raw NormalizedTweet from the backend WS to the frontend Tweet shape.
 * Kept lenient — the backend currently sends exactly the shape we want, but
 * we strip unknown fields so a backend addition can't blow up the UI.
 */
function mapWsTweet(raw: any): Tweet | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "");
  if (!id) return null;
  return {
    id,
    text: String(raw.text || ""),
    authorId: String(raw.authorId || ""),
    authorUsername: String(raw.authorUsername || ""),
    authorName: String(raw.authorName || raw.authorUsername || ""),
    authorProfileImage: raw.authorProfileImage,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    likeCount: Number(raw.likeCount ?? 0),
    retweetCount: Number(raw.retweetCount ?? 0),
    replyCount: Number(raw.replyCount ?? 0),
    url: raw.url,
    images: Array.isArray(raw.images) ? raw.images : [],
  };
}

export function createTwitterTrackerWebSocket(
  onTweet: (tweet: Tweet) => void,
  onConnect?: () => void,
  onDisconnect?: () => void,
): TwitterTrackerWebSocket {
  if (typeof window === "undefined" || !WALLET_TRACKER_WS_URL) {
    return { subscribe: () => {}, unsubscribe: () => {}, close: () => {} };
  }

  const wsUrl = `${WALLET_TRACKER_WS_URL}/ws`;
  let ws: WebSocket | null = null;
  const pendingSubscriptions = new Set<string>();
  let closedByUser = false;
  let backoff = 1000;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let lastPingAt = Date.now();

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error("[TwitterTracker WS] failed to open:", err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      backoff = 1000;
      lastPingAt = Date.now();
      onConnect?.();
      if (pendingSubscriptions.size > 0) {
        ws?.send(
          JSON.stringify({
            method: "subscribeTwitter",
            usernames: [...pendingSubscriptions],
          }),
        );
      }
      heartbeatInterval = setInterval(() => {
        if (Date.now() - lastPingAt > 45_000) {
          console.warn("[TwitterTracker WS] heartbeat stale, reconnecting");
          ws?.close();
        }
      }, 15_000);
    };

    ws.onmessage = (event) => {
      // Any inbound frame proves the socket is alive — bump the heartbeat
      // unconditionally. Browsers handle native ping/pong control frames
      // (RFC 6455) transparently and never surface them to onmessage, so
      // gating this on a specific JSON `method: "ping"` payload would silently
      // break the moment the backend (or any proxy in front of it) switched
      // to control-frame keepalive — clients would close on the 45s timeout
      // and reconnect forever.
      lastPingAt = Date.now();
      try {
        const data = JSON.parse(event.data);
        if (data.method === "ping") {
          ws?.send(JSON.stringify({ method: "pong" }));
          return;
        }
        if (data.type === "subscribedTwitter") return;
        if (data.type === "tweet" && data.tweet) {
          const t = mapWsTweet(data.tweet);
          if (t) onTweet(t);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      onDisconnect?.();
      if (!closedByUser) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire next; reconnection handled there.
    };
  };

  const scheduleReconnect = () => {
    if (closedByUser) return;
    const wait = Math.min(backoff, 15_000);
    backoff = Math.min(backoff * 2, 15_000);
    setTimeout(() => {
      if (!closedByUser) connect();
    }, wait);
  };

  connect();

  const subscribe = (usernames: string[]) => {
    const normalized = usernames.map(normalizeHandle).filter(Boolean);
    for (const u of normalized) pendingSubscriptions.add(u);
    if (ws && ws.readyState === WebSocket.OPEN && normalized.length > 0) {
      ws.send(
        JSON.stringify({ method: "subscribeTwitter", usernames: normalized }),
      );
    }
  };

  const unsubscribe = (usernames: string[]) => {
    const normalized = usernames.map(normalizeHandle).filter(Boolean);
    for (const u of normalized) pendingSubscriptions.delete(u);
    if (ws && ws.readyState === WebSocket.OPEN && normalized.length > 0) {
      ws.send(
        JSON.stringify({ method: "unsubscribeTwitter", usernames: normalized }),
      );
    }
  };

  const close = () => {
    closedByUser = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    try { ws?.close(); } catch { /* noop */ }
  };

  return { subscribe, unsubscribe, close };
}
