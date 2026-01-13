import { useEffect, useRef, useState } from "react";
import { FaTelegram } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { FiGlobe } from "react-icons/fi";
import type { Token } from "~/utils/db";

// Helper to extract Twitter handle from URL
function extractTwitterHandle(url: string): string | null {
  if (!url) return null;
  // Handle various Twitter/X URL formats
  const patterns = [
    /(?:twitter\.com|x\.com)\/(@?\w+)/i,
    /(?:twitter\.com|x\.com)\/intent\/user\?screen_name=(\w+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1].replace("@", "");
    }
  }
  return null;
}

// Social Icons Component with URI metadata parsing
export function TradeSocialIcons({ token }: { token: Token }) {
  const { meta } = useTokenMetadata(token.uri);
  const socialLinks = extractSocialLinks(token, meta);
  const xButtonRef = useRef<HTMLButtonElement>(null);
  const [showXPreview, setShowXPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({
    left: 0,
    top: 0,
    openBelow: false,
  });
  const isOverXPreview = useRef(false);
  const isOverXButton = useRef(false);

  const hasTwitter = !!socialLinks.twitter;
  const hasWebsite = !!socialLinks.website;
  const hasTelegram = !!socialLinks.telegram;
  const twitterHandle = hasTwitter
    ? extractTwitterHandle(socialLinks.twitter!)
    : null;

  return (
    <div className="flex items-center gap-1">
      {/* X/Twitter Icon - only show if twitter URL exists */}
      {hasTwitter && (
        <div className="relative">
          <button
            ref={xButtonRef}
            className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.open(socialLinks.twitter, "_blank");
            }}
            onMouseEnter={() => {
              isOverXButton.current = true;
              if (xButtonRef.current) {
                const rect = xButtonRef.current.getBoundingClientRect();
                const previewHeight = 320; // Approximate height of X preview
                const spaceAbove = rect.top;
                const openBelow = spaceAbove < previewHeight + 20;

                setPreviewPosition({
                  left: rect.left + rect.width + 50,
                  top: openBelow ? rect.bottom + 10 : rect.top - 10,
                  openBelow,
                });
              }
              setShowXPreview(true);
            }}
            onMouseLeave={() => {
              isOverXButton.current = false;
              // Delay to allow moving to popup
              setTimeout(() => {
                if (!isOverXPreview.current && !isOverXButton.current) {
                  setShowXPreview(false);
                }
              }, 200);
            }}
          >
            <FaXTwitter
              size={14}
              className="text-neutral-400 hover:text-white"
            />
          </button>

          {/* X Profile Preview Popup */}
          {showXPreview && (
            <div
              className="fixed z-[999999]"
              style={{
                left: `${previewPosition.left}px`,
                top: `${previewPosition.top}px`,
                // If opening below, no Y transform; if above, translate up by full height
                transform: previewPosition.openBelow
                  ? "translateX(-50%)"
                  : "translate(-50%, -100%)",
              }}
              onMouseEnter={() => {
                isOverXPreview.current = true;
              }}
              onMouseLeave={() => {
                isOverXPreview.current = false;
                setTimeout(() => {
                  if (!isOverXPreview.current && !isOverXButton.current) {
                    setShowXPreview(false);
                  }
                }, 200);
              }}
            >
              <div
                className="w-[280px] overflow-hidden rounded-xl"
                style={{
                  backgroundColor: "#16181c",
                  border: "1px solid #2f3336",
                  boxShadow: "0 8px 28px rgba(0, 0, 0, 0.75)",
                }}
              >
                {/* Header with X logo */}
                <div className="flex items-center justify-between border-b border-[#2f3336] px-4 py-3">
                  <div className="flex items-center gap-2">
                    {/* Profile Picture */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-[#1a1a1a]">
                      <img
                        src={
                          token.logo ||
                          `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff`
                        }
                        alt={token.symbol}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff`;
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-white">
                          {token.name || token.symbol}
                        </span>
                        <svg
                          className="h-4 w-4 text-[#1d9bf0]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>
                          @{twitterHandle || token.symbol?.toLowerCase()}
                        </span>
                        <span>·</span>
                        <span>+</span>
                      </div>
                    </div>
                  </div>
                  <FaXTwitter size={20} className="text-white" />
                </div>

                {/* Bio/Description */}
                <div className="px-4 py-3">
                  <p className="text-sm leading-relaxed text-white">
                    {meta?.description ||
                      token.description ||
                      `Official ${token.symbol} token`}
                  </p>
                  {hasWebsite && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-sm text-[#1d9bf0] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {socialLinks.website}
                    </a>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 px-4 pb-3 text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect
                        x="3"
                        y="4"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                        strokeWidth="2"
                      />
                      <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                      <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                      <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                    </svg>
                    <span>
                      Joined{" "}
                      {new Date(
                        token.created_at || Date.now(),
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Following/Followers */}
                <div className="flex items-center gap-4 px-4 pb-3 text-sm">
                  <span>
                    <strong className="text-white">--</strong>{" "}
                    <span className="text-gray-500">Following</span>
                  </span>
                  <span>
                    <strong className="text-white">--</strong>{" "}
                    <span className="text-gray-500">Followers</span>
                  </span>
                </div>

                {/* CTA Button */}
                <div className="px-4 pb-4">
                  <button
                    className="w-full rounded-full border border-[#536471] py-2.5 text-sm font-semibold text-[#1d9bf0] transition-colors hover:bg-[#1d9bf0]/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(socialLinks.twitter, "_blank");
                    }}
                  >
                    See Profile on X
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Telegram Icon - only show if telegram URL exists */}
      {hasTelegram && (
        <button
          className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            window.open(socialLinks.telegram, "_blank");
          }}
          title="Join Telegram"
        >
          <FaTelegram
            size={14}
            className="text-neutral-400 hover:text-[#0088cc]"
          />
        </button>
      )}

      {/* Globe Icon - only show if website URL exists */}
      {hasWebsite && (
        <div className="group/website relative">
          <button
            className="flex items-center justify-center rounded p-1 transition-colors duration-200 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.open(socialLinks.website, "_blank");
            }}
          >
            <FiGlobe size={14} className="text-neutral-400 hover:text-white" />
          </button>
          {/* Website URL Tooltip */}
          <div className="pointer-events-none absolute top-full left-1/2 z-[99999] mt-2 -translate-x-1/2 rounded-lg border border-[#2a2b33] bg-[#1a1b1f] px-3 py-2 whitespace-nowrap opacity-0 shadow-xl transition-opacity duration-100 group-hover/website:opacity-100">
            <span className="text-xs text-gray-400">Website</span>
            <p className="max-w-[200px] truncate text-sm font-medium text-white">
              {socialLinks.website}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const tokenMetadataCache: Record<string, any> = {};

function useTokenMetadata(uri?: string) {
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState(!!uri);
  const [showInitial, setShowInitial] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      setMeta(null);
      setLoading(false);
      return;
    }
    if (tokenMetadataCache[uri]) {
      setMeta(tokenMetadataCache[uri]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setShowInitial(false);
    const timer = setTimeout(() => setShowInitial(true), 150);
    fetchTokenMetadata(uri).then((data) => {
      if (!cancelled) {
        if (data) tokenMetadataCache[uri] = data;
        setMeta(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  return { meta, loading, showInitial };
}

// Fetch and parse token metadata from a URI (IPFS or HTTP)
export async function fetchTokenMetadata(
  uri: string | undefined,
): Promise<any | null> {
  if (!uri) return null;
  try {
    // Normalize to https if ipfs://, prefer Cloudflare IPFS
    const { normalizeImageUrl } = await import("../utils/images");
    const normalized = normalizeImageUrl(uri) || uri;
    // Prefer same-origin proxy to avoid mixed content/TLS/CORS
    const proxyUrl = `/api/metadata/proxy?url=${encodeURIComponent(normalized)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn(
        "fetchTokenMetadata: Request timed out after 6 seconds for:",
        uri,
      );
      controller.abort();
    }, 6000);

    const resp = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(
        `Failed to fetch metadata via local proxy: ${resp.status} ${resp.statusText}`,
      );
      return null;
    }
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return null;
    }
    console.warn(
      "fetchTokenMetadata: Error fetching metadata for:",
      uri,
      "Error:",
      (err as any)?.message || err,
    );
    return null;
  }
}

// Helper to extract social links from token metadata
interface SocialLinks {
  twitter?: string;
  website?: string;
  telegram?: string;
}

function extractSocialLinks(token: Token, meta: any): SocialLinks {
  const links: SocialLinks = {};

  // Try to get links from metadata first
  if (meta) {
    if (meta.twitter) links.twitter = meta.twitter;
    if (meta.website) links.website = meta.website;
    if (meta.telegram) links.telegram = meta.telegram;
  }

  // Also try to parse token.links if it's a JSON string
  if (token.links) {
    try {
      const parsedLinks =
        typeof token.links === "string" ? JSON.parse(token.links) : token.links;
      if (parsedLinks.twitter && !links.twitter)
        links.twitter = parsedLinks.twitter;
      if (parsedLinks.website && !links.website)
        links.website = parsedLinks.website;
      if (parsedLinks.telegram && !links.telegram)
        links.telegram = parsedLinks.telegram;
    } catch {
      // Ignore parsing errors
    }
  }

  return links;
}
