/**
 * KOL Leaderboard React Hook
 *
 * Wraps the KOL leaderboard API with React Query for caching and
 * automatic refetching.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getKolLeaderboard,
  type KolLeaderboardResult,
  type KolTimeframe,
} from "~/utils/kolApi";

export function useKolLeaderboard(
  timeframe: KolTimeframe,
  options: { limit?: number; offset?: number } = {},
) {
  return useQuery<KolLeaderboardResult>({
    queryKey: ["kol-leaderboard", timeframe, options.limit, options.offset],
    queryFn: () => getKolLeaderboard(timeframe, options),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}
