import type { NextApiResponse } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Allowed image MIME types - only image types are permitted
// NOTE: SVG is allowed but guarded later to block obvious script tags
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/ico",
];

export function isValidImageMimeType(contentType: string | null): boolean {
  if (!contentType) return false;
  const baseType = contentType.split(";")[0].trim().toLowerCase();
  if (
    baseType.startsWith("image/") ||
    baseType.startsWith("video/") ||
    baseType.startsWith("audio/") ||
    baseType === "application/octet-stream"
  ) {
    return true;
  }
  return ALLOWED_IMAGE_TYPES.includes(baseType);
}

export function inferImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  const bytes = buffer.slice(0, 12);

  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: 47 49 46 38
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF...WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }

  // SVG: XML-based vector images
  const textStart = buffer.slice(0, 256).toString("utf-8").trim().toLowerCase();
  if (textStart.startsWith("<svg") || textStart.startsWith("<?xml")) {
    return "image/svg+xml";
  }

  return null;
}

export function isValidImageContent(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  const bytes = buffer.slice(0, 12);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return true;

  // GIF: 47 49 46 38 (GIF8)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  )
    return true;

  // WebP: RIFF...WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return true;

  // AVIF: ftyp box with 'avif' brand
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const ftypContent = buffer.slice(8, 20).toString("ascii");
    if (ftypContent.includes("avif")) return true;
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return true;

  // ICO: 00 00 01 00 or 00 00 02 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  )
    return true;
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x02 &&
    bytes[3] === 0x00
  )
    return true;

  // SVG detection with a minimal safety check
  if (buffer.length >= 20) {
    const textSample = buffer
      .slice(0, Math.min(buffer.length, 2048))
      .toString("utf-8")
      .toLowerCase();
    if (textSample.includes("<svg")) {
      if (textSample.includes("<script")) return false;
      return true;
    }
  }

  return false;
}

export function setSecurityHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function sendError(
  res: NextApiResponse,
  status: number,
  message: string,
) {
  setSecurityHeaders(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(status).send(message);
}

/**
 * Unwrap nested proxy URLs and fix common URL issues.
 * Returns a cleaned URL object.
 */
export function normalizeProxyUrl(url: string): URL {
  let parsed = new URL(url);

  // Unwrap nested proxy links (e.g., .../api/image-proxy?url=<actual>)
  const nestedProxyTarget = parsed.searchParams.get("url");
  const isKnownProxyHost =
    parsed.hostname.includes("image-proxy") ||
    parsed.hostname.includes("uxento.io") ||
    parsed.hostname.includes("solanatracker.io");
  if (
    nestedProxyTarget &&
    (parsed.pathname.includes("image-proxy") || isKnownProxyHost)
  ) {
    try {
      parsed = new URL(nestedProxyTarget);
    } catch {
      // keep original if nested target is invalid
    }
  }

  // Fix double-slash IPFS paths (e.g., /ipfs//<...>)
  if (parsed.pathname.startsWith("/ipfs//")) {
    try {
      parsed = new URL(parsed.toString().replace("/ipfs//", "/ipfs/"));
    } catch {
      // ignore if replacement creates invalid URL
    }
  }

  return parsed;
}

/**
 * Build candidate URLs for fetching, including IPFS multi-gateway fallback.
 */
export function buildFetchCandidates(parsed: URL): string[] {
  const ipfsMatch = parsed.pathname.match(/\/ipfs\/([^/?#]+)/i);
  const candidates: string[] = [];

  if (ipfsMatch && ipfsMatch[1]) {
    const cid = ipfsMatch[1];
    const original = parsed.toString();
    const httpsVersion =
      parsed.protocol === "http:"
        ? original.replace(/^http:/i, "https:")
        : original;
    const httpVersion =
      parsed.protocol === "https:"
        ? original.replace(/^https:/i, "http:")
        : original;
    if (httpsVersion && !candidates.includes(httpsVersion))
      candidates.push(httpsVersion);
    if (!candidates.includes(original)) candidates.push(original);
    if (httpVersion && !candidates.includes(httpVersion))
      candidates.push(httpVersion);

    const gateways = [
      "https://ipfs.io/ipfs/",
      "https://gateway.pinata.cloud/ipfs/",
      "https://nftstorage.link/ipfs/",
      "https://gateway.ipfs.io/ipfs/",
    ];
    for (const g of gateways) {
      const urlTry = g + cid;
      if (!candidates.includes(urlTry)) candidates.push(urlTry);
    }
  } else {
    const original = parsed.toString();
    const httpsVersion =
      parsed.protocol === "http:"
        ? original.replace(/^http:/i, "https:")
        : original;
    const httpVersion =
      parsed.protocol === "https:"
        ? original.replace(/^https:/i, "http:")
        : original;
    if (httpsVersion && !candidates.includes(httpsVersion))
      candidates.push(httpsVersion);
    if (!candidates.includes(original)) candidates.push(original);
    if (httpVersion && !candidates.includes(httpVersion))
      candidates.push(httpVersion);
  }

  return candidates;
}

// Hard cap on bytes we will pull from any upstream. Without this an attacker
// who controls a token's metadata URL (or a token whose JSON metadata points
// at a huge file) could OOM the serverless function. 20 MB is generous for a
// raw avatar — typical inputs are 50-500 KB; the proxy resizes anyway.
const MAX_UPSTREAM_BYTES = 20 * 1024 * 1024;

async function readBodyWithCap(response: Response): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
      throw new Error(
        `upstream too large: ${declared} bytes (cap ${MAX_UPSTREAM_BYTES})`,
      );
    }
  }

  // Stream into a byte counter so a missing/lying Content-Length still gets caught.
  const reader = response.body?.getReader();
  if (!reader) {
    // Fall back to arrayBuffer when streaming isn't available, but keep a post-hoc cap.
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_UPSTREAM_BYTES) {
      throw new Error(
        `upstream too large: ${buf.length} bytes (cap ${MAX_UPSTREAM_BYTES})`,
      );
    }
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_UPSTREAM_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error(
          `upstream too large: ${total} bytes (cap ${MAX_UPSTREAM_BYTES})`,
        );
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks, total);
}

/**
 * Fetch image from candidates in parallel. Returns { body, contentType } or throws.
 */
export async function fetchImageFromCandidates(
  candidates: string[],
): Promise<{
  body: Buffer;
  contentType: string;
  status: number;
  url: string;
}> {
  let lastNonOk: { resp: Response; url: string } | null = null;

  const promises = candidates.map(async (tryUrl) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(tryUrl, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "Interstate-ImageProxy/1.0",
      },
      signal: controller.signal,
      cache: "force-cache",
      redirect: "follow",
    });
    clearTimeout(t);
    if (response.ok) return response;
    lastNonOk = { resp: response, url: tryUrl };
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  });

  let upstream: Response | null = null;
  try {
    upstream = await Promise.any(promises);
  } catch {
    // all failed
  }

  if (!upstream) {
    if (lastNonOk) {
      const buf = await readBodyWithCap(lastNonOk.resp);
      const ct =
        lastNonOk.resp.headers.get("content-type") ||
        "application/octet-stream";
      return {
        body: buf,
        contentType: ct,
        status: lastNonOk.resp.status,
        url: lastNonOk.url,
      };
    }
    throw new Error("Failed to fetch image from all candidates");
  }

  const body = await readBodyWithCap(upstream);
  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  // `upstream.url` is the candidate that actually succeeded (post-redirect), so
  // edge-resizing targets a live gateway even when the primary URL was dead.
  return { body, contentType: ct, status: 200, url: upstream.url };
}

/**
 * If the upstream response is JSON metadata, try to extract and fetch the actual image URL.
 * Returns { body, contentType } if successful, null otherwise.
 */
export async function resolveJsonMetadataImage(
  body: Buffer,
  contentType: string,
): Promise<{ body: Buffer; contentType: string; sourceUrl: string } | null> {
  // Skip if body is too large or is clearly a binary image
  if (body.length >= 50000) return null;
  const isDefinitelyImage = contentType.startsWith("image/");
  if (isDefinitelyImage) return null;
  // Try JSON parse for any non-image content type (JSON metadata can arrive
  // as application/json, text/plain, application/octet-stream, etc.)

  try {
    const meta = JSON.parse(body.toString("utf-8"));
    const imageField =
      meta?.image ||
      meta?.image_url ||
      meta?.logo ||
      meta?.icon ||
      meta?.imageUri ||
      meta?.img ||
      meta?.thumbnail ||
      meta?.properties?.image ||
      meta?.properties?.image_url;
    const filesImage =
      Array.isArray(meta?.properties?.files) && meta.properties.files.length > 0
        ? typeof meta.properties.files[0] === "string"
          ? meta.properties.files[0]
          : meta.properties.files[0]?.uri
        : null;
    const resolvedImageUrl = imageField || filesImage;

    if (
      resolvedImageUrl &&
      typeof resolvedImageUrl === "string" &&
      resolvedImageUrl.startsWith("http")
    ) {
      isDev &&
        console.log(
          `[image proxy] JSON metadata detected, resolving to: ${resolvedImageUrl.substring(0, 80)}`,
        );
      const imgController = new AbortController();
      const imgTimeout = setTimeout(() => imgController.abort(), 12000);
      const imgResponse = await fetch(resolvedImageUrl, {
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "Interstate-ImageProxy/1.0",
        },
        signal: imgController.signal,
        redirect: "follow",
      });
      clearTimeout(imgTimeout);

      if (imgResponse.ok) {
        const imgBody = await readBodyWithCap(imgResponse);
        const imgContentType =
          imgResponse.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() || "";
        let finalType = imgContentType;
        if (!isValidImageMimeType(finalType)) {
          finalType = inferImageMimeType(imgBody) || "application/octet-stream";
        }
        return {
          body: imgBody,
          contentType: finalType,
          sourceUrl: resolvedImageUrl,
        };
      }
    }
  } catch (e) {
    isDev &&
      console.log(
        "[image proxy] JSON auto-resolve failed, serving original:",
        (e as any)?.message,
      );
  }

  return null;
}

/**
 * Determine final content type from header and body magic bytes.
 */
export function resolveFinalContentType(
  headerContentType: string,
  body: Buffer,
): string {
  let contentType = headerContentType.split(";")[0].trim().toLowerCase();

  // Always sniff magic bytes first. Trusting the upstream Content-Type alone
  // lets a malicious upstream return SVG/GIF bytes under an `image/png` header,
  // which would bypass shouldSkipResize and feed unsupported bytes into sharp.
  // Magic bytes are the source of truth; fall back to header only when bytes
  // give us nothing useful.
  const inferredType = inferImageMimeType(body);
  if (inferredType) {
    contentType = inferredType;
  } else if (!isValidImageMimeType(contentType)) {
    contentType = contentType || "application/octet-stream";
  }

  return contentType.split(";")[0].trim() || "application/octet-stream";
}

/**
 * Resize + transcode an image to WebP using Cloudflare Image Resizing (the
 * `cf.image` fetch option), which runs at the Cloudflare edge and therefore
 * works on the Workers runtime where `sharp` cannot.
 *
 * This is a deliberate no-op unless Image Transformations are enabled on the
 * zone: when the feature is off (or the source is not resizable), Cloudflare
 * returns the ORIGINAL bytes, so we treat the call as successful ONLY when the
 * response comes back as `image/webp`. Otherwise we return null and the caller
 * keeps the un-resized bytes — i.e. exactly today's behavior. Locally /
 * off-Cloudflare the `cf` option is ignored, so this also returns null and
 * `sharp` remains the dev resize path. Net effect: zero regression; pure upside
 * once the zone has transformations enabled.
 */
export async function cfImageResize(
  url: string,
  width: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    // `cf` is a Cloudflare Workers-only extension to fetch init; harmless and
    // ignored on every other runtime.
    const init: RequestInit & { cf?: unknown } = {
      headers: {
        Accept: "image/webp,image/*,*/*;q=0.8",
        "User-Agent": "Interstate-ImageProxy/1.0",
      },
      signal: controller.signal,
      redirect: "follow",
      cf: {
        image: {
          width,
          fit: "scale-down",
          format: "webp",
          quality: 78,
          metadata: "none",
        },
      },
    };
    const resp = await fetch(url, init as RequestInit);
    clearTimeout(t);
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    // Success only if Cloudflare actually transformed the image to WebP. If the
    // feature is off CF returns the original (e.g. image/jpeg) → null → caller
    // falls back to the un-resized bytes.
    if (ct !== "image/webp") return null;
    const buf = await readBodyWithCap(resp);
    if (!buf.length) return null;
    return { buffer: buf, contentType: "image/webp" };
  } catch {
    return null;
  }
}
