const isDev = process.env.NODE_ENV !== 'production';

import { env } from "../env";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useRobustWebSocket } from "./useRobustWebSocket";

// Resolve backend URL (exchange-backend)
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

const BACKEND_URL = resolveBackendUrl();

export interface ReferralRecord {
  referralCode: string;
}

export interface ReferredUser {
  id: number;
  name: string;
  email: string;
  joinedAt: string;
  totalVolume: number;
}

export interface ReferralsResponse {
  referrals: ReferredUser[];
  totalVolume: number;
  totalReferrals: number;
}

function buildErrorMessage(
  status: number,
  statusText: string,
  payload: any,
  fallback: string,
) {
  if (payload) {
    if (typeof payload === "string" && payload.trim().length > 0) {
      return payload;
    }
    if (typeof payload === "object") {
      return payload.error || payload.message || fallback;
    }
  }
  return statusText ? `HTTP ${status} ${statusText}` : fallback;
}

/**
 * Fetch the current user's referral code (if they have one)
 */
export async function fetchReferralCodeForUser(
  authToken: string,
): Promise<ReferralRecord | null> {
  const url = `${BACKEND_URL}/api/users/referral-code`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.status === 404 || response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to fetch referral code",
      );
      throw new Error(message);
    }

    const payload = await response.json();

    if (!payload?.referralCode) {
      return null;
    }

    return { referralCode: payload.referralCode };
  } catch (error) {
    console.error("Error fetching referral code:", error);
    throw error;
  }
}

/**
 * Fetch the list of users referred by the current user, including their trading volume
 */
export async function fetchReferrals(
  authToken: string,
): Promise<ReferralsResponse> {
  const url = `${BACKEND_URL}/api/users/referrals`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to fetch referrals",
      );
      throw new Error(message);
    }

    const payload = await response.json();

    return {
      referrals: payload.referrals || [],
      totalVolume: payload.totalVolume || 0,
      totalReferrals: payload.totalReferrals || 0,
    };
  } catch (error) {
    console.error("Error fetching referrals:", error);
    throw error;
  }
}

/**
 * WebSocket message types for referral updates
 */
export interface ReferralWebSocketMessage {
  type: 'connected' | 'new_referral' | 'referral_stats';
  data?: {
    newUserId?: number;
    newUserName?: string;
    message?: string;
    totalReferrals?: number;
    totalVolume?: number;
    referrals?: ReferredUser[];
  };
  timestamp?: number;
}

/**
 * Hook to connect to referral WebSocket for real-time updates.
 *
 * Thin shim over useRobustWebSocket — all lifecycle handling (backoff,
 * visibility, bfcache, ping/pong, callback stability) lives there. Public
 * signature preserved so existing consumers (e.g. /rewards page) are
 * unaffected.
 */
export function useReferralWebSocket(
  userId: number | null,
  onNewReferral?: (message: ReferralWebSocketMessage) => void,
  onStatsUpdate?: (stats: ReferralsResponse) => void,
  onReconnect?: () => void,
) {
  const url = useMemo(() => {
    if (!userId || typeof window === "undefined") return null;
    const backendUrl = resolveBackendUrl();
    const wsProtocol = backendUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = backendUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${wsHost}/ws/referrals?userId=${userId}`;
  }, [userId]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      const message = raw as ReferralWebSocketMessage;
      if (!message || typeof message !== "object" || !("type" in message)) return;

      if (message.type === "new_referral" && onNewReferral) {
        onNewReferral(message);
      }

      if (message.type === "referral_stats" && onStatsUpdate && message.data) {
        onStatsUpdate({
          referrals: message.data.referrals || [],
          totalVolume: message.data.totalVolume || 0,
          totalReferrals: message.data.totalReferrals || 0,
        });
      }
    },
    [onNewReferral, onStatsUpdate],
  );

  const { isConnected } = useRobustWebSocket({
    url,
    enabled: !!userId,
    onMessage: handleMessage,
    onReconnect,
    logTag: "Referral WS",
  });

  return { isConnected };
}
