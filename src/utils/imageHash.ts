/**
 * Deterministic hash-based image URL utility.
 *
 * Generates URLs like `/api/img/{md5}?s={base64url}` so the browser's native
 * HTTP disk cache can store images with immutable Cache-Control headers.
 * Same image URL always produces the same proxy URL = same cache key.
 */

// ─── Inline MD5 Implementation ───────────────────────────────────────────────
// We need synchronous hashing on every render. Web Crypto is async-only,
// and crypto.createHash is Node-only. This is a standard RFC 1321 MD5.

function md5(str: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(
    q: number,
    a: number,
    b: number,
    x: number,
    s: number,
    t: number,
  ): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number,
  ): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function binlMD5(x: number[], len: number): number[] {
    x[len >> 5] |= 0x80 << len % 32;
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    let a = 1732584193,
      b = -271733879,
      c = -1732584194,
      d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const oa = a,
        ob = b,
        oc = c,
        od = d;
      a = md5ff(a, b, c, d, x[i]!, 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1]!, 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2]!, 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3]!, 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4]!, 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5]!, 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6]!, 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7]!, 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8]!, 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9]!, 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10]!, 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11]!, 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12]!, 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13]!, 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14]!, 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15]!, 22, 1236535329);

      a = md5gg(a, b, c, d, x[i + 1]!, 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6]!, 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11]!, 14, 643717713);
      b = md5gg(b, c, d, a, x[i]!, 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5]!, 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10]!, 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15]!, 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4]!, 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9]!, 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14]!, 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3]!, 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8]!, 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13]!, 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2]!, 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7]!, 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12]!, 20, -1926607734);

      a = md5hh(a, b, c, d, x[i + 5]!, 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8]!, 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11]!, 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14]!, 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1]!, 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4]!, 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7]!, 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10]!, 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13]!, 4, 681279174);
      d = md5hh(d, a, b, c, x[i]!, 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3]!, 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6]!, 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9]!, 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12]!, 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15]!, 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2]!, 23, -995338651);

      a = md5ii(a, b, c, d, x[i]!, 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7]!, 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14]!, 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5]!, 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12]!, 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3]!, 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10]!, 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1]!, 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8]!, 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15]!, 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6]!, 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13]!, 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4]!, 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11]!, 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2]!, 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9]!, 21, -343485551);

      a = safeAdd(a, oa);
      b = safeAdd(b, ob);
      c = safeAdd(c, oc);
      d = safeAdd(d, od);
    }
    return [a, b, c, d];
  }

  function rstrMD5(s: string): string {
    // Convert string to array of little-endian 32-bit words
    const bin: number[] = [];
    const mask = 0xff;
    for (let i = 0; i < s.length * 8; i += 8) {
      bin[i >> 5] =
        (bin[i >> 5]! || 0) | ((s.charCodeAt(i / 8) & mask) << i % 32);
    }
    const output = binlMD5(bin, s.length * 8);
    let result = "";
    for (let i = 0; i < output.length * 32; i += 8) {
      result += String.fromCharCode((output[i >> 5]! >>> i % 32) & 0xff);
    }
    return result;
  }

  // Convert UTF-8 string to binary string for MD5 input
  function utf8Encode(str: string): string {
    // Use encodeURIComponent + unescape for proper UTF-8 handling
    try {
      return unescape(encodeURIComponent(str));
    } catch {
      return str;
    }
  }

  const hex = "0123456789abcdef";
  const raw = rstrMD5(utf8Encode(str));
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    result += hex.charAt((c >>> 4) & 0x0f) + hex.charAt(c & 0x0f);
  }
  return result;
}

// ─── Base64url Encode/Decode ─────────────────────────────────────────────────

function base64urlEncode(str: string): string {
  if (typeof btoa === "function") {
    // Browser
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // Node.js (SSR)
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64urlDecode(encoded: string): string {
  // Restore standard base64 chars
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding
  while (base64.length % 4) base64 += "=";

  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(base64)));
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

// ─── Hash Cache (LRU) ───────────────────────────────────────────────────────

const MAX_HASH_CACHE = 2000;
// Key: `${normalizedUrl}|${width}` -> full proxy URL.
// Width is part of the key because the proxy returns different bytes per width.
const hashCache = new Map<string, string>();

// Discrete widths the proxy is willing to render. Limiting the set prevents an
// attacker from forcing arbitrary expensive resizes and bounds cache size.
export const ALLOWED_PROXY_WIDTHS = [32, 64, 128, 192, 384] as const;
type AllowedProxyWidth = (typeof ALLOWED_PROXY_WIDTHS)[number];
const DEFAULT_PROXY_WIDTH: AllowedProxyWidth = 64;

function clampToAllowedWidth(width?: number | null): AllowedProxyWidth {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    return DEFAULT_PROXY_WIDTH;
  }
  // Snap UP to the nearest allowed width (avoids upscaling artifacts at render).
  for (const w of ALLOWED_PROXY_WIDTHS) {
    if (width <= w) return w;
  }
  return ALLOWED_PROXY_WIDTHS[
    ALLOWED_PROXY_WIDTHS.length - 1
  ] as AllowedProxyWidth;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Speculative cdn.interstate.so/{mint}.webp URLs 403 when unwarmed — never proxy. */
export function isSpeculativeInterstateCdn(url: string | null | undefined): boolean {
  return Boolean(url && url.includes('cdn.interstate.so/'));
}

/** Hosts that load reliably in the browser without the /api/img server proxy. */
const DIRECT_LOAD_IMAGE_HOST_PATTERNS = [
  'static.four.meme',
  'four.meme',
  'cloudflare-ipfs.com',
  'mypinata.cloud',
  'cf-ipfs.com',
  'ipfs.io',
  'nftstorage.link',
  'dweb.link',
  'pinata.cloud',
  'dexscreener.com',
] as const;

export function shouldBypassImageProxy(url: string | null | undefined): boolean {
  if (!url || !url.startsWith('http')) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DIRECT_LOAD_IMAGE_HOST_PATTERNS.some(
      (pattern) => host === pattern || host.endsWith(`.${pattern}`),
    );
  } catch {
    return false;
  }
}

/**
 * Normalize a URL for deterministic hashing.
 * Strips trailing slashes, lowercases protocol+host, sorts query params.
 */
function normalizeForHash(url: string): string {
  try {
    const parsed = new URL(url);
    // Lowercase protocol and host
    const base = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
    // Sort query params for determinism
    const params = new URLSearchParams(parsed.search);
    const sorted = Array.from(params.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const qs =
      sorted.length > 0
        ? "?" + sorted.map(([k, v]) => `${k}=${v}`).join("&")
        : "";
    return base + qs;
  } catch {
    return url;
  }
}

/**
 * Compute the hash-based proxy URL for an image source.
 *
 * Returns `/api/img/{md5}?s={base64url}&w={width}` for external HTTP URLs.
 * Passes through data:, blob:, /api/ URLs unchanged.
 *
 * `width` is the rendered size in CSS pixels. The proxy snaps it to one of
 * ALLOWED_PROXY_WIDTHS and serves a resized WebP at that size.
 */
export function computeHashImageUrl(
  src: string | null,
  width?: number,
): string | null {
  if (!src) return null;

  // Pass through URLs that don't need proxying
  if (
    src.startsWith("/api/") ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  ) {
    return src;
  }

  // Only proxy external HTTP(S) URLs
  if (!src.startsWith("http")) {
    return src;
  }

  if (isSpeculativeInterstateCdn(src)) {
    return null;
  }

  if (shouldBypassImageProxy(src)) {
    return src;
  }

  const clampedWidth = clampToAllowedWidth(width);

  // Check cache (key includes width so different sizes don't collide)
  const normalized = normalizeForHash(src);
  const cacheKey = `${normalized}|${clampedWidth}`;
  const cached = hashCache.get(cacheKey);
  if (cached) return cached;

  // Compute hash and build URL.
  // The hash covers ONLY the upstream URL — `w` is a server-side directive,
  // not part of the URL identity, so the same hash works for every width.
  const hash = md5(normalized);
  const encoded = base64urlEncode(src); // Encode the ORIGINAL src (not normalized) so server can fetch it
  const proxyUrl = `/api/img/${hash}?s=${encoded}&w=${clampedWidth}`;

  // Store in cache with LRU eviction
  hashCache.set(cacheKey, proxyUrl);
  if (hashCache.size > MAX_HASH_CACHE) {
    const oldest = hashCache.keys().next().value;
    if (oldest) hashCache.delete(oldest);
  }

  return proxyUrl;
}

/** Exposed for server-side hash verification */
export { md5 as computeMd5 };
export { normalizeForHash };
