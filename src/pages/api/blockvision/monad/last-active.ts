import type { NextApiRequest, NextApiResponse } from "next";

type BlockvisionTx = {
  timestamp?: number;
};

type BlockvisionResponse =
  | {
      code: number;
      reason?: string;
      message?: string;
      result?: {
        data?: BlockvisionTx[];
        nextPageCursor?: string;
      };
    }
  | any;

type WalletLastActiveResult = {
  wallet: string;
  lastActive: number | null;
  ok: boolean;
  error?: string;
  txCount?: number;
};

const ensureMs = (ts: unknown): number | null => {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  // Blockvision returns ms, but be defensive in case it ever returns seconds.
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 10_000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal as any });
  } finally {
    clearTimeout(t);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Avoid caching on proxies/CDNs; this should be "fresh-ish"
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    res.removeHeader("ETag");
  } catch {}

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.BLOCKVISION_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "BLOCKVISION_API_KEY is not configured on the server",
    });
  }

  const body = (req.body ?? {}) as { wallets?: unknown; limit?: unknown };
  const wallets = Array.isArray(body.wallets)
    ? body.wallets.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
    : [];

  if (wallets.length === 0) {
    return res.status(200).json({ ok: true, data: [] satisfies WalletLastActiveResult[] });
  }

  // Keep upstream load reasonable.
  const limit = (() => {
    const raw = typeof body.limit === "number" ? body.limit : Number(body.limit);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return Math.min(10, Math.max(1, Math.floor(raw)));
  })();

  const results: WalletLastActiveResult[] = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        const url = `https://api.blockvision.org/v2/monad/account/transactions?address=${encodeURIComponent(
          wallet,
        )}&limit=${limit}&ascendingOrder=false`;

        const upstream = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "x-api-key": apiKey,
            },
          },
          10_000,
        );

        const text = await upstream.text();
        let payload: BlockvisionResponse | null = null;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }

        if (!upstream.ok) {
          return {
            wallet,
            lastActive: null,
            ok: false,
            error:
              (payload && (payload.message || payload.error)) ||
              `HTTP ${upstream.status} ${upstream.statusText}`,
          };
        }

        const data: BlockvisionTx[] = Array.isArray(payload?.result?.data)
          ? payload.result.data
          : [];

        const newest = data[0]?.timestamp;
        const lastActive = ensureMs(newest);

        return {
          wallet,
          lastActive,
          ok: true,
          txCount: data.length,
        };
      } catch (e: any) {
        const msg = e?.name === "AbortError" ? "Upstream timeout" : e?.message || "Unknown error";
        return { wallet, lastActive: null, ok: false, error: msg, txCount: 0 };
      }
    }),
  );

  return res.status(200).json({ ok: true, data: results });
}


