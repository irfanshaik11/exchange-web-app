import type { NextApiRequest, NextApiResponse } from "next";

// FE timeframe → Geckoterminal OHLCV endpoint shape. Aggregates picked so
// each sparkline gets ~24-30 candles spanning the displayed window —
// dense enough for spike detail, light enough to render fast.
const TIMEFRAME_TO_GT: Record<
  string,
  { period: "minute" | "hour" | "day"; aggregate: number; limit: number }
> = {
  "5m": { period: "minute", aggregate: 1, limit: 30 },
  "1h": { period: "minute", aggregate: 5, limit: 24 },
  "6h": { period: "minute", aggregate: 15, limit: 24 },
  "24h": { period: "hour", aggregate: 1, limit: 24 },
};

const GT_BASE = "https://api.geckoterminal.com/api/v2/networks/solana/pools";

interface GeckoOhlcvResponse {
  data?: { attributes?: { ohlcv_list?: number[][] } };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pair = String(req.query.pair_address || "");
  const timeframe = String(req.query.timeframe || "24h");

  // Solana pair addresses are base58, 32-44 chars. Reject anything else
  // before fanning out to an external API — keeps the proxy from being
  // a generic SSRF amplifier.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair)) {
    return res.status(400).json({ error: "invalid pair_address" });
  }

  const tf = TIMEFRAME_TO_GT[timeframe] ?? TIMEFRAME_TO_GT["24h"];
  const url =
    `${GT_BASE}/${encodeURIComponent(pair)}/ohlcv/${tf.period}` +
    `?aggregate=${tf.aggregate}&limit=${tf.limit}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (!upstream.ok) {
      // Geckoterminal returns 404 for pools it doesn't know yet, 429 for
      // rate limits. Either way the FE just falls back to the synth curve.
      return res
        .status(200)
        .json({ success: false, reason: `upstream ${upstream.status}` });
    }

    const json = (await upstream.json()) as GeckoOhlcvResponse;
    const rows = json.data?.attributes?.ohlcv_list ?? [];

    // Geckoterminal payload row: [unix_ts, open, high, low, close, volume]
    // Newest-first; reverse so MiniSparkline's chronological render works.
    const items = rows
      .map((row) => ({
        unix_time: row[0],
        o: row[1],
        h: row[2],
        l: row[3],
        c: row[4],
        v_usd: row[5],
      }))
      .reverse();

    // Cache aggressively at the edge — 110 sparklines × N users would burst
    // through Geckoterminal's 30/min/IP limit without this.
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
    );
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return res.status(200).json({
      success: false,
      reason: err instanceof Error ? err.message : "fetch_failed",
    });
  }
}
