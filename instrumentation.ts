/**
 * Next.js server-boot hook.
 *
 * Runs the KOL leaderboard refresh in-process every 30 min so the Vision page
 * stays warm in environments without an external scheduler (local dev,
 * standalone deploys). Production k8s also runs the same refresh via the
 * `kol-leaderboard-refresh` CronJob — the two are idempotent (DELETE+INSERT
 * per timeframe in one transaction), so running both is safe; to suppress the
 * in-process scheduler set `DISABLE_KOL_INPROCESS_CRON=true`.
 *
 * Pipeline: kolscan.io → Postgres `KolLeaderboardRow` → `/api/kol-leaderboard`
 * → Vision page. The page never triggers a refresh — only this cron does.
 */

// 30 s to match the wallet-tracker-backend's kolscanPoller default. Locally
// this is the only writer (the backend poller isn't typically running on a
// dev machine); in staging/prod the deployment sets DISABLE_KOL_INPROCESS_CRON=true
// so the backend poller is the single writer and this scheduler is a no-op.
const REFRESH_INTERVAL_MS = 30 * 1_000;

export async function register(): Promise<void> {
  // Only run server-side, never in the Edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.DISABLE_KOL_INPROCESS_CRON === "true") {
    console.log("[kol-cron] in-process scheduler disabled via env");
    return;
  }

  // HMR + multiple worker processes can call register() more than once; the
  // flag on globalThis makes the schedule a singleton per Node process.
  const g = globalThis as typeof globalThis & {
    __kolCronStarted__?: boolean;
  };
  if (g.__kolCronStarted__) return;
  g.__kolCronStarted__ = true;

  // Lazy import so this module doesn't transitively pull `pg` into the Edge
  // bundle if a route happens to be Edge-runtime'd.
  const { refreshAllTimeframes } = await import("./src/utils/kolscanStore");

  const run = async (reason: "boot" | "interval") => {
    const start = Date.now();
    try {
      const result = await refreshAllTimeframes();
      console.log(
        `[kol-cron] ${reason} refresh ok in ${Date.now() - start}ms — ` +
          `daily=${result.daily} weekly=${result.weekly} monthly=${result.monthly}`,
      );
    } catch (err) {
      console.error(
        `[kol-cron] ${reason} refresh failed after ${Date.now() - start}ms:`,
        err instanceof Error ? err.message : err,
      );
    }
  };

  // Fire-and-forget the boot refresh so server startup isn't blocked by a
  // ~20 s kolscan paginate. Subsequent reads serve whatever the previous run
  // left in Postgres until this finishes.
  void run("boot");

  setInterval(() => void run("interval"), REFRESH_INTERVAL_MS).unref?.();
}
