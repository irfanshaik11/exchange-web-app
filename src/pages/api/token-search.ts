import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, tokenaddress } = req.query;

  // Build remote URL based on query param rules
  const base = process.env.NEXT_PUBLIC_TOKEN_SERVICE_URL || "";
  if (!base) {
    res.status(500).json({ error: "Token service URL not configured" });
    return;
  }

  const paramKey = tokenaddress ? "tokenaddress" : "name";
  const paramVal = (tokenaddress || name) as string | undefined;
  if (!paramVal) {
    res.status(400).json({ error: "Missing search parameter" });
    return;
  }

  const targetUrl = `${base}/search?${paramKey}=${encodeURIComponent(paramVal)}`;

  try {
    const upstream = await fetch(targetUrl);
    const body = await upstream.text(); // keep as text then pass
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.status(upstream.status).send(body);
  } catch (e: any) {
    res.status(500).json({ error: "Proxy error", detail: e.message });
  }
} 