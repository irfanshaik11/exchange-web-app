import { useState } from "react";
import type { Token } from "~/utils/db";

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

interface TokenXProfileProps {
  token: Token;
  setShowXPreview: (showXPreview: number | null) => void;
}

const safeInt = (v?: number) => typeof v === "number" && !Number.isNaN(v) ? v.toLocaleString() : "—";

const TokenXProfile = ({ token, setShowXPreview }: TokenXProfileProps) => {
  console.log("-----------------------------token", token);
  return (
    <div
      className="absolute z-[999999]"
      style={{ width: 340 }}
      onMouseLeave={() => setShowXPreview(null)}
    >
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          backgroundColor: "#0f1720",
          border: "1px solid #2a2f3a",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
      >
        {/* COVER (placeholder) */}
        <div
          className="h-24"
          style={{
            background:
              "radial-gradient(120% 120% at 100% 0%, #2b3dbb 0%, #0f1720 60%)",
          }}
        />

        {/* CONTENT */}
        <div className="px-4 pb-4">
          {/* HEADER */}
          <div className="flex items-start gap-3 -mt-6">
            {/* LOGO */}
            <div
              className="h-14 w-14 rounded-full overflow-hidden flex items-center justify-center"
              style={{
                backgroundColor: "#000",
                border: "3px solid #0f1720",
              }}
            >
              <img
                src={token.logo}
                alt={token.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${token.symbol}&background=000&color=fff`;
                }}
              />
            </div>

            {/* NAME / HANDLE */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">
                  {token.name}
                </h3>
                {token.is_verified_contract && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="#1d9bf0"
                  >
                    <path d="M22.5 12l-2.54 2.9.35 3.84-3.76.85-1.97 3.32L12 21l-2.58 1.91-1.97-3.32-3.76-.85.35-3.84L1.5 12l2.54-2.9-.35-3.84 3.76-.85L9.42 1.09 12 3l2.58-1.91 1.97 3.32 3.76.85-.35 3.84z" />
                  </svg>
                )}
              </div>

              <p className="text-sm text-gray-400">
                @{token.symbol.toLowerCase()}
              </p>
            </div>

            {/* X ICON */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-gray-300"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z" />
            </svg>
          </div>

          {/* DESCRIPTION */}
          <p className="mt-3 text-sm text-gray-300 leading-relaxed line-clamp-2">
            {token.description || `Official ${token.symbol || "token"} community. Join the conversation! `}
          </p>

          {/* META */}
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Joined{" "}
            {new Date(token.created_at).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </div>

          {/* STATS */}
          <div className="mt-4 flex gap-6 text-sm">
            <span>
              <strong className="text-white">
                {safeInt(token.total_holders)}
              </strong>{" "}
              Holders
            </span>
            <span>
              <strong className="text-white">
                {safeInt(token.unique_wallets_24h)}
              </strong>{" "}
              Active
            </span>
          </div>

          {/* CTA */}
          <button
            className="mt-4 w-full rounded-full py-2.5 text-sm font-semibold"
            style={{
              border: "1px solid #2a2f3a",
              color: "#8ecbff",
            }}
            onClick={() =>
              window.open(
                `https://x.com/${token.symbol.toLowerCase()}`,
                "_blank"
              )
            }
          >
            See profile on X
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenXProfile;