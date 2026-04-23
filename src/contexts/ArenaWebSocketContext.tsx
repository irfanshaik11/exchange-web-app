/**
 * ArenaWebSocketContext
 *
 * Provides a single-connection-per-SPA subscription to /ws/arena. Incoming
 * events (stats.updated, quest.progress, quest.completed, quest.claimed,
 * key_tweet.claimed) are merged directly into React Query caches so every
 * page that reads those caches (/airdrop-genesis, header chips, etc.) stays
 * in sync without polling.
 *
 * Mounted once in _app.tsx — SPA navigation does NOT tear down the socket.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { env } from "../env";
import { useUser } from "~/components/UserContext";
import { useRobustWebSocket } from "~/utils/useRobustWebSocket";
import type { ArenaStats, Quest, QuestsResponse, CreditsSummary, CashbackSummary } from "~/utils/arenaApi";

// Event envelope types (mirror backend src/utils/arenaWebSocket.ts exactly)
type ArenaEventType =
  | "arena.stats.updated"
  | "arena.quest.progress"
  | "arena.quest.completed"
  | "arena.quest.claimed"
  | "arena.key_tweet.claimed";

type ArenaEvent =
  | { type: "arena.stats.updated"; userId: number; data: { points: number; credits: number; cashback: number; rank: string }; ts: number }
  | {
      type: "arena.quest.progress";
      userId: number;
      data: {
        deltas: Array<{
          questId: number;
          // currentValue + targetValue added 2026-04-23: UI displays integer
          // `N/M` text from these fields; omitting them left the UI stale
          // until a full refetch even though the WS event arrived correctly.
          // Optional in type for back-compat with older backend builds.
          currentValue?: number;
          targetValue?: number;
          percentComplete: number;
          isCompleted: boolean;
        }>;
      };
      ts: number;
    }
  | { type: "arena.quest.completed"; userId: number; data: { questId: number }; ts: number }
  | { type: "arena.quest.claimed"; userId: number; data: { questId: number; goldAwarded: number }; ts: number }
  | { type: "arena.key_tweet.claimed"; userId: number; data: { keyTweetId: number; creditsAwarded: number }; ts: number };

// Public context value — connection metadata only. All data flows into React Query.
type ArenaWebSocketContextValue = {
  connected: boolean;
  reconnectAttempts: number;
  lastMessageAt: number | null;
};

const ArenaWebSocketContext = createContext<ArenaWebSocketContextValue>({
  connected: false,
  reconnectAttempts: 0,
  lastMessageAt: null,
});

export function useArenaWebSocket() {
  return useContext(ArenaWebSocketContext);
}

function resolveBackendUrl(): string {
  const envUrl = env.NEXT_PUBLIC_BACKEND_URL || "";
  if (typeof window === "undefined") {
    return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  }
  try {
    const url = new URL(envUrl || window.location.origin);
    if (window.location.protocol === "https:" && url.protocol === "http:") {
      url.protocol = "https:";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return window.location.origin;
  }
}

// Feature flag — NEXT_PUBLIC_* is inlined at build. Enabled unless explicitly set to 'false'.
const ARENA_WSS_ENABLED = process.env.NEXT_PUBLIC_ARENA_WSS_ENABLED !== "false";

if (typeof window !== "undefined") {
  // One-time boot-time log so the resolved value is visible in DevTools without reading source.
  // eslint-disable-next-line no-console
  console.info(`[Arena WS] feature flag NEXT_PUBLIC_ARENA_WSS_ENABLED = ${String(process.env.NEXT_PUBLIC_ARENA_WSS_ENABLED)} → enabled=${ARENA_WSS_ENABLED}`);
}

export function ArenaWebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  // user.id is a string in UserContext; cache keys use that form. The WS
  // handshake URL needs the numeric form the backend expects, matching how
  // /rewards calls useReferralWebSocket (see rewards.tsx:59).
  const userId = user?.id ?? null;
  const userIdNum = user?.id ? Number(user.id) : null;

  const url = useMemo(() => {
    if (!ARENA_WSS_ENABLED) return null;
    if (!userIdNum || Number.isNaN(userIdNum) || typeof window === "undefined") return null;
    const backendUrl = resolveBackendUrl();
    const wsProtocol = backendUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = backendUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${wsHost}/ws/arena?userId=${userIdNum}`;
  }, [userIdNum]);

  // Coalesce rapid-fire quest.progress events (high-volume trader edge case).
  // 100 ms trailing debounce: merge all progress deltas received within the
  // window, then apply as a single setQueriesData pass. Matches plan §2d.
  // Buffered quest-progress deltas. Now carries currentValue so the
  // `N/M` integer text in QuestCard updates live without a refetch.
  const progressBufferRef = useRef<
    Map<number, { percentComplete: number; isCompleted: boolean; currentValue?: number; targetValue?: number }>
  >(new Map());
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushProgressBuffer = useCallback(() => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const buf = progressBufferRef.current;
    if (buf.size === 0 || userId == null) return;

    const deltas = Array.from(buf.entries()).map(([questId, delta]) => ({ questId, ...delta }));
    buf.clear();

    queryClient.setQueriesData<QuestsResponse>(
      { queryKey: ["arena", "quests", userId] },
      (old) => {
        if (!old) return old;
        const applyDelta = (q: Quest): Quest => {
          const d = deltas.find((x) => x.questId === q.id);
          if (!d) return q;
          return {
            ...q,
            // currentValue + targetValue drive the "N/M" UI text. Prefer the
            // delta's value when present; fall back to the existing cache
            // value so older backend builds (pre-2026-04-23) still merge cleanly.
            currentValue: d.currentValue ?? q.currentValue,
            targetValue: d.targetValue ?? q.targetValue,
            percentComplete: d.percentComplete,
            isCompleted: d.isCompleted,
            completedAt: d.isCompleted && !q.completedAt ? new Date().toISOString() : q.completedAt,
          };
        };
        return {
          ...old,
          quests: old.quests.map(applyDelta),
          grouped: {
            daily: old.grouped.daily.map(applyDelta),
            seasonal: old.grouped.seasonal.map(applyDelta),
            referral: old.grouped.referral.map(applyDelta),
            special: old.grouped.special.map(applyDelta),
          },
        };
      },
    );
  }, [queryClient, userId]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== "object" || !("type" in raw)) return;
      const msg = raw as ArenaEvent;

      switch (msg.type) {
        case "arena.stats.updated": {
          if (userId == null) return;
          queryClient.setQueryData<ArenaStats>(["arena", "stats", userId], (old) =>
            old
              ? {
                  ...old,
                  goldAvailable: msg.data.points ?? old.goldAvailable,
                  goldEarned: msg.data.credits ?? old.goldEarned,
                  solCashbackAvailable: msg.data.cashback ?? old.solCashbackAvailable,
                  rank: (msg.data.rank as ArenaStats["rank"]) ?? old.rank,
                }
              : old,
          );
          // credits-summary + cashback use different shapes — invalidate rather than splice.
          queryClient.invalidateQueries({ queryKey: ["arena", "credits-summary", userId] });
          queryClient.invalidateQueries({ queryKey: ["arena", "cashback", userId] });
          return;
        }

        case "arena.quest.progress": {
          // Coalesce via 100 ms trailing debounce.
          const buf = progressBufferRef.current;
          for (const d of msg.data.deltas ?? []) {
            buf.set(d.questId, {
              percentComplete: d.percentComplete,
              isCompleted: d.isCompleted,
              currentValue: d.currentValue,
              targetValue: d.targetValue,
            });
          }
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          progressTimerRef.current = setTimeout(flushProgressBuffer, 100);
          return;
        }

        case "arena.quest.completed": {
          if (userId == null) return;
          const { questId } = msg.data;
          queryClient.setQueriesData<QuestsResponse>(
            { queryKey: ["arena", "quests", userId] },
            (old) => {
              if (!old) return old;
              const flip = (q: Quest): Quest =>
                q.id === questId
                  ? { ...q, isCompleted: true, completedAt: q.completedAt ?? new Date().toISOString() }
                  : q;
              return {
                ...old,
                quests: old.quests.map(flip),
                grouped: {
                  daily: old.grouped.daily.map(flip),
                  seasonal: old.grouped.seasonal.map(flip),
                  referral: old.grouped.referral.map(flip),
                  special: old.grouped.special.map(flip),
                },
              };
            },
          );
          return;
        }

        case "arena.quest.claimed": {
          if (userId == null) return;
          const { questId } = msg.data;
          queryClient.setQueriesData<QuestsResponse>(
            { queryKey: ["arena", "quests", userId] },
            (old) => {
              if (!old) return old;
              const flip = (q: Quest): Quest =>
                q.id === questId
                  ? { ...q, isClaimed: true, claimedAt: q.claimedAt ?? new Date().toISOString() }
                  : q;
              return {
                ...old,
                quests: old.quests.map(flip),
                grouped: {
                  daily: old.grouped.daily.map(flip),
                  seasonal: old.grouped.seasonal.map(flip),
                  referral: old.grouped.referral.map(flip),
                  special: old.grouped.special.map(flip),
                },
              };
            },
          );
          queryClient.invalidateQueries({ queryKey: ["arena", "gold-history", userId] });
          return;
        }

        case "arena.key_tweet.claimed": {
          if (userId == null) return;
          const { keyTweetId } = msg.data;
          queryClient.setQueryData<{ tweets: Array<Record<string, unknown>> }>(
            ["arena", "key-tweets", userId],
            (old) =>
              old
                ? {
                    ...old,
                    tweets: old.tweets.map((t: any) =>
                      t.id === keyTweetId || t.keyTweetId === keyTweetId
                        ? { ...t, isClaimed: true, claimedAt: t.claimedAt ?? new Date().toISOString() }
                        : t,
                    ),
                  }
                : old,
          );
          queryClient.invalidateQueries({ queryKey: ["arena", "gold-history", userId] });
          return;
        }

        default:
          return;
      }
    },
    [queryClient, userId, flushProgressBuffer],
  );

  // Reconnect reconciliation — refetch the WS-covered keys (canonical list per plan §2e).
  const handleReconnect = useCallback(() => {
    if (userId == null) return;
    queryClient.refetchQueries({ queryKey: ["arena", "stats", userId] });
    queryClient.refetchQueries({ queryKey: ["arena", "quests", userId] });
    queryClient.refetchQueries({ queryKey: ["arena", "key-tweets", userId] });
    queryClient.refetchQueries({ queryKey: ["arena", "credits-summary", userId] });
  }, [queryClient, userId]);

  const { isConnected, reconnectAttempts, lastMessageAt } = useRobustWebSocket({
    url,
    enabled: ARENA_WSS_ENABLED && !!userId,
    onMessage: handleMessage,
    onReconnect: handleReconnect,
    logTag: "Arena WS",
  });

  // Flush any buffered progress deltas on unmount — user navigates away or logs out.
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  // Dev-only debug surface.
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
    (window as any).__arenaWsDebug = { isConnected, reconnectAttempts, lastMessageAt };
  }, [isConnected, reconnectAttempts, lastMessageAt]);

  const value = useMemo<ArenaWebSocketContextValue>(
    () => ({ connected: isConnected, reconnectAttempts, lastMessageAt }),
    [isConnected, reconnectAttempts, lastMessageAt],
  );

  return <ArenaWebSocketContext.Provider value={value}>{children}</ArenaWebSocketContext.Provider>;
}
