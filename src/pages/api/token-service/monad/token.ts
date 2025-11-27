import type { NextApiRequest, NextApiResponse } from "next";

const BASE_URL =
  (process.env.MONAD_TOKEN_SERVICE_URL ||
    process.env.NEXT_PUBLIC_MONAD_TOKEN_SERVICE_URL ||
    "").replace(/\/$/, "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { address } = req.query;

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "address parameter is required" });
  }

  if (!BASE_URL) {
    return res.status(500).json({ error: "Monad token service URL not configured" });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `${BASE_URL}/v1/token?address=${encodeURIComponent(address)}`,
      {
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status || 500;
      return res.status(status).json(
        data && typeof data === "object"
          ? data
          : { error: "Failed to fetch Monad token" },
      );
    }

    return res.status(200).json(data);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "Monad token service timeout" });
    }

    console.error("[monad/token] Unexpected error:", error);
    return res.status(500).json({ error: "Failed to fetch Monad token" });
  }
}

