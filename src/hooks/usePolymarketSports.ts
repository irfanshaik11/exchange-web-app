// src/hooks/usePolymarketSports.ts
// React hook for Polymarket Sports Channel — live game scores and status.

import { useState, useEffect } from 'react';
import PolymarketSportsService from '../services/polymarketSportsService';
import type { SportResult } from '../services/polymarketSportsService';

export type { SportResult };

/**
 * Subscribe to real-time sports results via Polymarket Sports Channel.
 * No subscription message needed — receives all active events on connect.
 *
 * @param leagueFilter - Optional: only receive events for this league (e.g. "nba", "nhl", "mlb")
 * @param enabled - Whether to subscribe
 * @param maxEvents - Max events to keep in buffer (default 100)
 * @returns Latest scores per game + event buffer + connection status
 */
export function usePolymarketSports(
  leagueFilter?: string,
  enabled = true,
  maxEvents = 100,
): { events: SportResult[]; scores: Map<number, SportResult>; isConnected: boolean } {
  const [events, setEvents] = useState<SportResult[]>([]);
  // scores: deduplicated latest state per gameId
  const [scores, setScores] = useState<Map<number, SportResult>>(() => new Map());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    setEvents([]);
    setScores(new Map());

    const service = PolymarketSportsService.getInstance();

    const unsub = service.subscribe((result) => {
      // Add to event buffer (most recent first)
      setEvents(prev => {
        const next = [result, ...prev];
        return next.length > maxEvents ? next.slice(0, maxEvents) : next;
      });

      // Update latest score per game
      setScores(prev => {
        const next = new Map(prev);
        next.set(result.gameId, result);
        return next;
      });
    }, leagueFilter);

    // Poll connection status
    const statusInterval = setInterval(() => {
      setIsConnected(service.isConnected);
    }, 2000);

    return () => {
      unsub();
      clearInterval(statusInterval);
    };
  }, [leagueFilter, enabled, maxEvents]);

  return { events, scores, isConnected };
}

/**
 * Get the latest score for a specific game.
 */
export function usePolymarketGameScore(
  gameId: number,
  enabled = true,
): SportResult | null {
  const [score, setScore] = useState<SportResult | null>(null);

  useEffect(() => {
    if (!enabled || !gameId) return;

    const service = PolymarketSportsService.getInstance();

    const unsub = service.subscribe((result) => {
      if (result.gameId === gameId) {
        setScore(result);
      }
    });

    return unsub;
  }, [gameId, enabled]);

  return score;
}
