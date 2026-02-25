import type { NextApiRequest, NextApiResponse } from "next";

// Use NEXT_PUBLIC_TOKEN_SERVICE_URL first (for production), then fallback to NEXT_PUBLIC_GO_SERVICE_URL
const GO_SERVICE_URL = (
  process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL ||
  process.env.NEXT_PUBLIC_GO_SERVICE_URL ||
  ""
).replace(/\/$/, "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mint } = req.query;

  if (!mint || typeof mint !== "string") {
    return res.status(400).json({ error: "mint parameter is required" });
  }

  if (!GO_SERVICE_URL) {
    return res.status(500).json({ error: "Token service URL not configured" });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${GO_SERVICE_URL}/v1/token/${encodeURIComponent(mint)}`,
      {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      },
    );

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status || 500;
      return res.status(status).json(
        data && typeof data === "object"
          ? data
          : { error: "Failed to fetch token" },
      );
    }

    return res.status(200).json(data);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "Token service timeout" });
    }

    console.error("[token-service/token] Unexpected error:", error);
    return res.status(500).json({ error: "Failed to fetch token" });
  }
}
