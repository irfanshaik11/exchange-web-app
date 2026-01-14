import { env } from "../env";
import { useEffect, useRef, useCallback, useState } from "react";

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
 * Hook to connect to referral WebSocket for real-time updates
 */
export function useReferralWebSocket(
  userId: number | null,
  onNewReferral?: (message: ReferralWebSocketMessage) => void,
  onStatsUpdate?: (stats: ReferralsResponse) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!userId || typeof window === 'undefined') return;

    // Build WebSocket URL from backend URL
    const backendUrl = resolveBackendUrl();
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = backendUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/ws/referrals?userId=${userId}`;

    console.log('[Referral WS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Referral WS] Connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message: ReferralWebSocketMessage = JSON.parse(event.data);
          console.log('[Referral WS] Message:', message.type);

          if (message.type === 'new_referral' && onNewReferral) {
            onNewReferral(message);
          }

          if (message.type === 'referral_stats' && onStatsUpdate && message.data) {
            onStatsUpdate({
              referrals: message.data.referrals || [],
              totalVolume: message.data.totalVolume || 0,
              totalReferrals: message.data.totalReferrals || 0,
            });
          }
        } catch (error) {
          console.error('[Referral WS] Parse error:', error);
        }
      };

      ws.onclose = () => {
        console.log('[Referral WS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('[Referral WS] Error:', error);
      };
    } catch (error) {
      console.error('[Referral WS] Connection error:', error);
    }
  }, [userId, onNewReferral, onStatsUpdate]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected };
}
