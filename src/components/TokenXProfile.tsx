import { useState } from "react";

/* ---- Enhanced Monad Green Palette (matching MonadTable) ---- */
const AX = {
  bg: "#0b0c0e",
  surface: "#16171C",
  surface2: "#121317",
  border: "#24252C",
  text: "#f0f5f5",
  muted: "#9CA3AF",
  mint: "#31e3ac", // Green - Monad brand color (matching MonadTable)
  mintHover: "#28c896", // Darker green for hover (matching MonadTable)
  sell: "#ed3a7a",
  aiBlue: "#526fff", // Blue variant (matching MonadTable)
  aiBlueHover: "#3f56d9", // Darker blue variant (matching MonadTable)
  aiGreen: "#31e3ac", // Green for primary actions (matching MonadTable)
  aiGreenHover: "#28c896", // Darker green for hover (matching MonadTable)
  aiCyan: "#06B6D4", // Cyan variant (matching MonadTable)
  aiCyanHover: "#0891B2", // Cyan hover (matching MonadTable)
  glowBlue: "rgba(82, 111, 255, 0.3)", // Blue glow (matching MonadTable)
  glowGreen: "rgba(49, 227, 172, 0.3)", // Green glow (matching MonadTable)
  glowCyan: "rgba(6, 182, 212, 0.3)", // Cyan glow (matching MonadTable)
};

interface Token {
  token: {
    symbol: string;
    description: string;
  };
  buttonPosition: {
    left: number;
    top: number;
  };
	setShowXPreview: (showXPreview: number | null) => void;
}

const TokenXProfile = ({ token, buttonPosition, setShowXPreview }: Token) => {
  return (
    <>
      <div
        className="fixed"
        style={{
          left: `${buttonPosition.left}px`,
          top: `${buttonPosition.top - 300}px`,
          transform: "translate(-50%, 0)",
          width: "280px",
          zIndex: 999999,
        }}
        onMouseEnter={() => {
          // Keep popup open when hovering over it
        }}
        onMouseLeave={() => {
          // Hide popup when leaving the popup area
          setShowXPreview(null);
        }}
      >
        <div
          className="overflow-hidden rounded-xl"
          style={{
            backgroundColor: AX.surface,
            border: `1px solid ${AX.border}`,
            boxShadow: `0 12px 48px rgba(0, 0, 0, 0.5), 0 0 24px ${AX.glowBlue}`,
            backdropFilter: "blur(10px)",
          }}
        >
          {/* X Icon Header */}
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "#2f3336" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "#1d9bf0",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ color: "#f0f5f5" }}
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: "#f0f5f5" }}>
                  X Profile
                </div>
                <div className="text-xs text-gray-400">Live Preview</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: "#31e3ac",
                }}
              ></div>
              <span className="text-xs text-gray-400">Live</span>
            </div>
          </div>

          {/* Official X Profile Layout */}
          <div className="px-4 py-4">
            {/* Profile Picture */}
            <div className="mb-4 flex justify-center">
              <div
                className="h-20 w-20 overflow-hidden rounded-full"
                style={{
                  backgroundColor: "#1a1a1a",
                  border: `3px solid #2f3336`,
                }}
              >
                <img
                  src={`https://ui-avatars.com/api/?name=${token.symbol || "Token"}&size=80&background=1a1a1a&color=ffffff&bold=true`}
                  alt={`${token.symbol} profile`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div
                  className="flex h-full w-full items-center justify-center text-xl font-bold"
                  style={{
                    backgroundColor: "#1a1a1a",
                    color: "#f0f5f5",
                    display: "none",
                  }}
                >
                  {token.symbol?.slice(0, 2) || "??"}
                </div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="mb-4 text-center">
              <div className="mb-1 flex items-center justify-center gap-2">
                <h3 className="text-xl font-bold" style={{ color: "#f0f5f5" }}>
                  {token.symbol || "Unknown"}
                </h3>
                {/* Verified Badge */}
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "#1d9bf0",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f0f5f5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 12l2 2 4-4" />
                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                  </svg>
                </div>
              </div>
              <p className="mb-3 text-sm text-gray-400">
                @{token.symbol?.toLowerCase() || "unknown"}
              </p>
              <p
                className="px-2 text-sm leading-relaxed"
                style={{ color: "#f0f5f5" }}
              >
                {token.description ||
                  `Official ${token.symbol || "token"} community. Join the conversation!`}
              </p>
            </div>

            {/* Follow Button */}
            <div className="mb-4 flex justify-center">
              <button
                className="rounded-full px-6 py-2 text-sm font-semibold transition-all duration-200"
                style={{
                  backgroundColor: "#f0f5f5",
                  color: "#000000",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e7e9ea";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f0f5f5";
                }}
              >
                Follow
              </button>
            </div>
          </div>

          {/* Join Date Section */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>
                Joined{" "}
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          {/* Action Button */}
          <div className="px-4 pb-4">
            <button
              className="w-full rounded-full px-4 py-3 text-sm font-semibold transition-all duration-200"
              style={{
                backgroundColor: "#1d9bf0",
                color: "#ffffff",
                border: "1px solid #1d9bf0",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1a8cd8";
                e.currentTarget.style.borderColor = "#1a8cd8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1d9bf0";
                e.currentTarget.style.borderColor = "#1d9bf0";
              }}
              onClick={(e) => {
                e.stopPropagation();
                const profileUrl = `https://twitter.com/${token.symbol?.toLowerCase() || "search"}`;
                window.open(profileUrl, "_blank");
              }}
            >
              See profile on X
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TokenXProfile;
