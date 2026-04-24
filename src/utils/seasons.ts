/**
 * Leaderboard seasons — frontend mirror.
 *
 * Kept manually in sync with `exchange-backend/src/constants/seasons.ts`.
 * Backend is the source of truth; this file exists so the UI can render
 * season tabs with correct lock/active state without a round-trip.
 *
 * Four fixed, hardcoded windows. Changing the schedule requires a
 * backend+frontend deploy in lockstep.
 */

export type SeasonKey = "PRESEASON" | "SEASON1" | "SEASON2" | "SEASON3";

export interface Season {
  key: SeasonKey;
  /** Short tab label. */
  label: string;
  /** Inclusive start, UTC. */
  start: Date;
  /** Exclusive end, UTC. */
  end: Date;
}

/** Chronological schedule. */
export const SEASONS: readonly Season[] = [
  {
    key: "PRESEASON",
    label: "Preseason",
    start: new Date(Date.UTC(2026, 3, 15)), // Apr 15
    end: new Date(Date.UTC(2026, 3, 30)), // Apr 30
  },
  {
    key: "SEASON1",
    label: "Season 1",
    start: new Date(Date.UTC(2026, 3, 30)),
    end: new Date(Date.UTC(2026, 5, 30)),
  },
  {
    key: "SEASON2",
    label: "Season 2",
    start: new Date(Date.UTC(2026, 5, 30)),
    end: new Date(Date.UTC(2026, 7, 31)),
  },
  {
    key: "SEASON3",
    label: "Season 3",
    start: new Date(Date.UTC(2026, 7, 31)),
    end: new Date(Date.UTC(2026, 9, 31)),
  },
] as const;

export function getSeason(key: SeasonKey): Season {
  const season = SEASONS.find((s) => s.key === key);
  if (!season) throw new Error(`Unknown season key: ${key}`);
  return season;
}

/** Currently-active season, or null if `now` is outside every window. */
export function getCurrentSeason(now: Date = new Date()): Season | null {
  return SEASONS.find((s) => s.start <= now && now < s.end) ?? null;
}

export function isSeasonActive(
  key: SeasonKey,
  now: Date = new Date(),
): boolean {
  const s = getSeason(key);
  return s.start <= now && now < s.end;
}

export function isSeasonLocked(
  key: SeasonKey,
  now: Date = new Date(),
): boolean {
  return now < getSeason(key).start;
}

export function isSeasonEnded(key: SeasonKey, now: Date = new Date()): boolean {
  return now >= getSeason(key).end;
}
