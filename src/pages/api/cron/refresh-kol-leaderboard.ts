/**
 * Cron endpoint: refreshes the kol_leaderboard table from kolscan.io.
 *
 * Suitable for a 30-min schedule (k8s CronJob, Vercel Cron, etc.). The read
 * endpoint also self-refreshes when rows are >30 min stale, so this cron is
 * primarily a keep-warm during zero-traffic windows.
 *
 * Auth: if CRON_SECRET is set the request must include it via either
 *   `Authorization: Bearer <secret>` (Vercel's convention) or
 *   `x-cron-secret: <secret>` (k8s curl convention).
 * If unset, the endpoint is open (fine for dev / private clusters).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { refreshAllTimeframes } from "~/utils/kolscanStore";

export const config = {
  maxDuration: 120,
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization;
  if (auth === `Bearer ${secret}`) return true;
  const headerSecret = req.headers["x-cron-secret"];
  if (typeof headerSecret === "string" && headerSecret === secret) return true;
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await refreshAllTimeframes();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[refresh-kol-leaderboard] failed:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
