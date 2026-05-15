/**
 * KOL Leaderboard React Hook
 *
 * Wraps the KOL leaderboard API with React Query for caching and
 * automatic refetching.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getKolLeaderboard,
  type KolTimeframe,
  type KolLeaderboardResponse,
} from "~/utils/kolApi";

export function useKolLeaderboard(
  timeframe: KolTimeframe,
  options: { limit?: number; offset?: number } = {},
) {
  return useQuery<KolLeaderboardResponse>({
    queryKey: ["kol-leaderboard", timeframe, options.limit, options.offset],
    queryFn: () => getKolLeaderboard(timeframe, options),
    staleTime: 60_000, // 1 minute
    placeholderData: keepPreviousData,
  });
}
