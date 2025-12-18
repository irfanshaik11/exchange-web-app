import type { NextApiRequest, NextApiResponse } from "next";

const AUTH_PROXY_BASE = "https://authproxy.turnkey.com";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "origin",
  "referer",
]);

const passthroughHeaders = (req: NextApiRequest) => {
  const headers: Record<string, string> = {};

  Object.entries(req.headers).forEach(([key, value]) => {
    if (!key || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (typeof value === "string") {
      headers[key] = value;
    }
  });

  // Ensure JSON content type for body-bearing requests
  if (!headers["content-type"] && req.method && !["GET", "HEAD"].includes(req.method)) {
    headers["content-type"] = "application/json";
  }

  return headers;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const pathParam = req.query.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam || "";
  const targetUrl = `${AUTH_PROXY_BASE}/${path}`;

  const init: RequestInit = {
    method: req.method,
    headers: passthroughHeaders(req),
  };

  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get("content-type");
    const text = await upstream.text();

    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    res.status(upstream.status).send(text);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "Failed to reach Turnkey auth proxy",
        message: err instanceof Error ? err.message : "Unknown error",
      });
  }
}
