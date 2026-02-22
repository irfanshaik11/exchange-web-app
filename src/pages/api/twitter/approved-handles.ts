import type { NextApiRequest, NextApiResponse } from "next";

const WALLET_TRACKER_URL = process.env.NEXT_PUBLIC_WALLET_TRACKER_URL || "";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!WALLET_TRACKER_URL) {
    return res.status(503).json({
      handles: [],
      error: "Wallet tracker URL not configured",
    });
  }

  try {
    const url = `${WALLET_TRACKER_URL.replace(/\/$/, "")}/api/twitter/approved-handles`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "[api/twitter/approved-handles] Backend error:",
        response.status,
        text,
      );
      return res.status(502).json({ handles: [] });
    }

    const data = await response.json();
    const handles = Array.isArray(data?.handles) ? data.handles : [];
    return res.status(200).json({ handles });
  } catch (error) {
    console.error("[api/twitter/approved-handles] Fetch error:", error);
    return res.status(502).json({ handles: [] });
  }
}
