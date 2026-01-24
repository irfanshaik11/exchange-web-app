/**
 * DIRECT WebSocket Hook - Zero Abstraction Layer
 *
 * This hook connects WebSocket DIRECTLY in the component.
 * No Worker, no Bridge, no BroadcastChannel - just:
 * WebSocket message → parse → setState → render
 *
 * This is the FASTEST possible path for real-time updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { env } from '~/env';
import { useRAFBatchedState } from './useRAFBatchedState';

export interface DirectToken {
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  price_usd?: number;
  market_cap_usd?: number;
  liquidity_usd?: number;
  volume_24h?: number;
  holder_count?: number;
  holders?: number;
  price_change_5m?: number;
  price_change_24h?: number;
  bonding_pct?: number;
  launchpad_protocol?: string;
  // Add more fields as needed
  [key: string]: any;
}

interface UseDirectPulseWebSocketOptions {
  channel: 'new' | 'final_stretch' | 'migrated';
  maxTokens?: number;
  enabled?: boolean;
}

interface UseDirectPulseWebSocketReturn {
  tokens: DirectToken[];
  connected: boolean;
  lastUpdate: number;
}

/**
 * Normalize token from WebSocket message - minimal processing for speed
 */
function normalizeToken(raw: any): DirectToken | null {
  if (!raw) return null;

  const mint = raw.mint || raw.address || raw.mint_address || raw.token_address;
  if (!mint) return null;

  // Return with minimal processing - speed over completeness
  return {
    mint,
    name: raw.name || raw.token_name || 'Unknown',
    symbol: raw.symbol || raw.token_symbol || '???',
    image: raw.image || raw.image_uri || raw.logo,
    price_usd: raw.price_usd || raw.price || 0,
    market_cap_usd: raw.market_cap_usd || raw.marketCap || raw.market_cap || 0,
    liquidity_usd: raw.liquidity_usd || raw.liquidity || 0,
    volume_24h: raw.volume_24h || raw.volume || 0,
    holder_count: raw.holder_count ?? raw.holders ?? 0,
    holders: raw.holder_count ?? raw.holders ?? 0,
    price_change_5m: raw.price_change_5m || raw.priceChange5m || 0,
    price_change_24h: raw.price_change_24h || 0,
    bonding_pct: raw.bonding_pct || raw.bondingCurveProgress || raw.bonding_curve_progress || 0,
    launchpad_protocol: raw.launchpad_protocol || raw.protocol || 'pumpfun',
    // Pass through other fields
    ...raw,
    // But override mint to ensure consistency
    mint_address: mint,
  };
}

export function useDirectPulseWebSocket(
  options: UseDirectPulseWebSocketOptions
): UseDirectPulseWebSocketReturn {
  const { channel, maxTokens = 200, enabled = true } = options;

  // Use RAF-batched state for tokens to batch updates to 60fps
  // This reduces renders from 500+/sec to max 60/sec (88% reduction)
  const [tokens, setTokens] = useRAFBatchedState<DirectToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Add token to list - DIRECTLY updates state
  const addToken = useCallback((token: DirectToken) => {
    if (!mountedRef.current) return;

    const now = Date.now();
    console.log(`[DirectWS] 🚀 Token received: ${token.symbol} at ${now}`);

    setTokens(prev => {
      // Remove existing if present, add to front
      const filtered = prev.filter(t => t.mint !== token.mint);
      return [token, ...filtered].slice(0, maxTokens);
    });
    setLastUpdate(now);
  }, [maxTokens]);

  // Update existing token (price update)
  const updateToken = useCallback((mint: string, updates: Partial<DirectToken>) => {
    if (!mountedRef.current) return;

    setTokens(prev => {
      const idx = prev.findIndex(t => t.mint === mint);
      if (idx === -1) return prev;

      const newTokens = [...prev];
      newTokens[idx] = { ...prev[idx], ...updates };
      return newTokens;
    });
  }, []);

  // Handle WebSocket message - DIRECT path
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const messages = event.data.split('\n').filter((msg: string) => msg.trim());

      for (const msgStr of messages) {
        const data = JSON.parse(msgStr);
        const msgType = data.type || data.event;

        switch (msgType) {
          case 'new_token':
          case 'newToken':
          case 'final_stretch_token':
          case 'finalStretch':
          case 'migrated_token':
          case 'migrated':
          case 'migration':
            if (data.data) {
              const tokenData = Array.isArray(data.data) ? data.data : [data.data];
              for (const t of tokenData) {
                const normalized = normalizeToken(t);
                if (normalized) {
                  addToken(normalized);
                }
              }
            }
            break;

          case 'price_update':
          case 'priceUpdate':
            const updates = data.data || data.updates || [data];
            const updatesArray = Array.isArray(updates) ? updates : [updates];
            for (const update of updatesArray) {
              const mint = update.mint || update.address || update.mint_address;
              if (mint) {
                updateToken(mint, {
                  price_usd: update.price_usd ?? update.price,
                  market_cap_usd: update.market_cap_usd ?? update.marketCap,
                  volume_24h: update.volume_24h ?? update.volume,
                  liquidity_usd: update.liquidity_usd ?? update.liquidity,
                  holder_count: update.holder_count ?? update.holders,
                  price_change_5m: update.price_change_5m ?? update.priceChange5m,
                  price_change_24h: update.price_change_24h,
                });
              }
            }
            break;

          case 'batch':
            if (Array.isArray(data.updates)) {
              for (const update of data.updates) {
                handleMessage({ data: JSON.stringify(update) } as MessageEvent);
              }
            }
            break;
        }
      }
    } catch (err) {
      console.error('[DirectWS] Parse error:', err);
    }
  }, [addToken, updateToken]);

  // Connect WebSocket
  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;

    const wsUrl = env.NEXT_PUBLIC_WEBSOCKET_URL;
    if (!wsUrl) {
      console.error('[DirectWS] No WebSocket URL configured');
      return;
    }

    const connect = () => {
      if (!mountedRef.current) return;

      const url = `${wsUrl}/v1/stream?channel=${channel}`;
      console.log(`[DirectWS] Connecting to ${channel}:`, url);

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[DirectWS] ✅ Connected: ${channel}`);
          if (mountedRef.current) {
            setConnected(true);
          }
        };

        ws.onclose = () => {
          console.log(`[DirectWS] Disconnected: ${channel}`);
          if (mountedRef.current) {
            setConnected(false);
            // Reconnect after 3 seconds
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error(`[DirectWS] Error on ${channel}:`, err);
        };

        ws.onmessage = handleMessage;

      } catch (err) {
        console.error(`[DirectWS] Connection error:`, err);
        // Retry after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [channel, enabled, handleMessage]);

  return { tokens, connected, lastUpdate };
}
