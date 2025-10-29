// components/PumpLive.tsx
import React, { useMemo, useState } from "react";

const AX = {
  bg: "#0f1012",
  surface: "#15161a",
  surface2: "#17191E",
  border: "#2A2B33",
  text: "#E6E7EA",
  muted: "#9CA3AF",
  green: "#22c55e",
  blue: "#3b82f6",
  chip: "#0b1b14",
};

// Static fallbacks (kept for optional use; we now prefer initial-letter blocks)
const FALLBACK_COVER = "/placeholder/fallback-cover.jpg";
const FALLBACK_AVATAR = "/placeholder/fallback-avatar.jpg";

export type PumpItem = {
  id: string;
  name: string;
  symbol?: string;
  desc?: string;
  age: string;           // right-side age (e.g., "22m")
  chipAge?: string;      // small green chip (e.g., "2h")
  mc?: string;           // market cap text (e.g., "$7.26K")
  coverUrl?: string;     // big left thumbnail
  avatarUrl?: string;    // tiny avatar next to name
  verified?: boolean;    // verification dot
  hot?: boolean;         // orange status ring
  comments?: number;     // mini comments count
};

/* ---------------- helpers ---------------- */

function getDummyMc(seed: string) {
  // deterministic tiny dummy based on id
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const buckets = ["$5.41K", "$5.44K", "$5.53K", "$6.59K", "$7.14K", "$9.86K", "$10.8K"];
  return buckets[h % buckets.length];
}

function getInitial(name?: string, symbol?: string) {
  return (symbol?.trim()?.charAt(0) || name?.trim()?.charAt(0) || "?").toUpperCase();
}

function BlueIconRow({
  chipText = "2h",
  comments = 0,
}: {
  chipText?: string;
  comments?: number;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      {/* time chip */}
      <span
        className="px-2 py-0.5 rounded-md font-semibold"
        style={{ backgroundColor: AX.chip, color: AX.green }}
      >
        {chipText}
      </span>

      {/* comments mini pill */}
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
        style={{ color: AX.blue, backgroundColor: "transparent", border: `1px solid ${AX.border}` }}
        title="Comments"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
        </svg>
        <span style={{ color: AX.text }}>{comments ?? 0}</span>
      </span>

      {/* blue glyphs (person, globe, search, copy) */}
      <span className="flex items-center gap-3" style={{ color: AX.blue }}>
        {/* person */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
        </svg>
        {/* globe */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm7.938 9h-3.09a14.65 14.65 0 0 0-1.1-5.02A8.013 8.013 0 0 1 19.938 11ZM9.252 11a12.93 12.93 0 0 1 1.2-4.9c.51-1.046 1.02-1.6 1.548-1.6s1.038.554 1.548 1.6a12.93 12.93 0 0 1 1.2 4.9Zm4.296 2a12.93 12.93 0 0 1-1.2 4.9c-.51 1.046-1.02 1.6-1.548 1.6s-1.038-.554-1.548-1.6a12.93 12.93 0 0 1-1.2-4.9Zm-8.486-2A8.013 8.013 0 0 1 8.252 3.98 14.65 14.65 0 0 0 7.15 9H4.062Zm0 2H7.15a14.65 14.65 0 0 0 1.1 5.02A8.013 8.013 0 0 1 4.062 13Zm15.876 0a8.013 8.013 0 0 1-4.19 5.02A14.65 14.65 0 0 0 16.848 13Z" />
        </svg>
        {/* search */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 2a8 8 0 1 0 5.293 14.001l4.353 4.353 1.414-1.414-4.353-4.353A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1-6 6 6.006 6.006 0 0 1 6-6Z" />
        </svg>
        {/* copy */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm2 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H10V7h8v14Z" />
        </svg>
      </span>
    </div>
  );
}

/* ---------------- row ---------------- */

export function PumpRow({
  item,
  onAction,
}: {
  item: PumpItem;
  onAction?: (id: string) => void;
}) {
  const mcText = item.mc ?? getDummyMc(item.id);
  const initial = useMemo(() => getInitial(item.name, item.symbol), [item.name, item.symbol]);

  // Whether we should show actual images (start true if url exists; switch to false onError)
  const [showCoverImg, setShowCoverImg] = useState<boolean>(!!item.coverUrl);
  const [showAvatarImg, setShowAvatarImg] = useState<boolean>(!!item.avatarUrl);

  // prefer remote if provided (we'll *not* fall back to static JPGs; instead show initial blocks)
  const coverSrc = item.coverUrl || FALLBACK_COVER;   // still defined, but we gate with showCoverImg
  const avatarSrc = item.avatarUrl || FALLBACK_AVATAR;

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-3"
      style={{ backgroundColor: AX.surface, border: `1px solid ${AX.border}`, maxWidth: 760 }}
    >
      {/* Left media (tablet-sized thumbnail) */}
      <div
        className="relative rounded-md overflow-hidden flex-shrink-0"
        style={{
          width: 120,
          height: 72,
          backgroundColor: AX.surface2,
          border: `1px solid ${AX.border}`,
        }}
      >
        {/* If we have a cover URL and it hasn't failed: show image; else show initial block */}
        {showCoverImg && item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt=""
            width={120}
            height={72}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="w-full h-full object-cover"
            onError={() => setShowCoverImg(false)}
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <div
              className="rounded-md font-bold"
              style={{
                color: AX.text,
                fontSize: 24,
                letterSpacing: 1,
              }}
              aria-label={initial}
              title={item.name}
            >
              {initial}
            </div>
          </div>
        )}

        {/* status dot */}
        <span
          className="absolute bottom-1 left-1 w-3 h-3 rounded-full ring-2"
          style={{
            backgroundColor: item.hot ? "#f59e0b" : AX.green,
            // @ts-ignore
            ringColor: AX.bg,
          }}
        />
      </div>

      {/* Middle content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* tiny avatar */}
          <div
            className="rounded-md overflow-hidden flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              backgroundColor: AX.surface2,
              border: `1px solid ${AX.border}`,
            }}
          >
            {showAvatarImg && item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                width={26}
                height={26}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="w-full h-full object-cover"
                onError={() => setShowAvatarImg(false)}
              />
            ) : (
              <div className="w-full h-full grid place-items-center">
                <span
                  className="font-bold"
                  style={{ color: AX.text, fontSize: 12 }}
                  aria-label={initial}
                  title={item.name}
                >
                  {initial}
                </span>
              </div>
            )}
          </div>

          {/* name + symbol + verified */}
          <div className="truncate font-semibold" style={{ color: AX.text }}>
            {item.name}
            {item.symbol ? <span className="opacity-70 font-normal"> {item.symbol}</span> : null}
          </div>

          <span
            className="inline-block w-3 h-3 rounded-sm"
            title={item.verified ? "Verified" : "Unverified"}
            style={{
              backgroundColor: item.verified ? AX.green : "transparent",
              border: `1px solid ${AX.border}`,
            }}
          />
        </div>

        {/* description */}
        {item.desc ? (
          <div
            className="mt-1 text-xs truncate"
            style={{ color: AX.muted, maxWidth: "42ch" }}
            title={item.desc}
          >
            {item.desc}
          </div>
        ) : null}

        {/* blue icon row + comments */}
        <BlueIconRow chipText={item.chipAge || item.age} comments={item.comments ?? 0} />
      </div>

      {/* Right: age + MC + lightning */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: AX.green }}>
              • {item.age}
            </span>
            <span className="text-xs opacity-60" style={{ color: AX.text }}>
              MC
            </span>
            <span className="font-semibold" style={{ color: AX.green }}>
              {mcText}
            </span>
          </div>
        </div>

        <button
          onClick={() => onAction?.(item.id)}
          className="h-8 w-8 rounded-full grid place-items-center hover:opacity-90 transition"
          style={{ backgroundColor: AX.blue }}
          title="Quick Action"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ---------------- main (tablet width) ---------------- */

export default function PumpLive({
  leftItems,
  rightItems,
  onAction,
}: {
  leftItems: PumpItem[];
  rightItems: PumpItem[];
  onAction?: (id: string) => void;
}) {
  return (
    <div className="mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ maxWidth: 1560 }}>
      {/* LEFT: New Streams */}
      <section
        className="rounded-xl overflow-hidden mx-auto"
        style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}`, maxWidth: 760, width: "100%" }}
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${AX.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: AX.text }}>
            New Streams
          </div>
          {/* visual search pill */}
          <div
            className="text-xs px-3 py-1 rounded-full"
            style={{ backgroundColor: AX.surface, color: AX.muted, border: `1px solid ${AX.border}` }}
          >
            Search by ticker or name
          </div>
        </header>

        <div style={{ maxHeight: 560, overflowY: "auto" }} className="p-3 space-y-3">
          {leftItems.map((it) => (
            <PumpRow key={it.id} item={it} onAction={onAction} />
          ))}
        </div>
      </section>

      {/* RIGHT: Top Stream Tokens */}
      <section
        className="rounded-xl overflow-hidden mx-auto"
        style={{ backgroundColor: AX.surface2, border: `1px solid ${AX.border}`, maxWidth: 760, width: "100%" }}
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${AX.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: AX.text }}>
            Top Stream Tokens
          </div>
          <div
            className="text-xs px-3 py-1 rounded-full"
            style={{ backgroundColor: AX.surface, color: AX.muted, border: `1px solid ${AX.border}` }}
          >
            Search by ticker or name
          </div>
        </header>

        <div style={{ maxHeight: 560, overflowY: "auto" }} className="p-3 space-y-3">
          {rightItems.map((it) => (
            <PumpRow key={it.id} item={it} onAction={onAction} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------- tiny demo placeholders (optional) ------- */
export const demoLeft: PumpItem[] = [
  {
    id: "l1",
    name: "209beats",
    symbol: "209mad…",
    desc: "Making beats at its finest",
    age: "22m",
    chipAge: "3mo",
    comments: 21,
    mc: "$7.26K",
    // omit coverUrl/avatarUrl to see first-letter fallback
  },
  {
    id: "l2",
    name: "DAP",
    symbol: "Dumb ahh Pum…",
    desc: "just a dumb ahh pumkin doin dumb ahh shi…",
    age: "31s",
    chipAge: "24m",
    comments: 2,
    // mc omitted on purpose to show dummy
  },
];

export const demoRight: PumpItem[] = [
  {
    id: "r1",
    name: "Gunit",
    symbol: "Get Rich or d…",
    desc: "from the bottom straight to the top 🚀 b…",
    age: "52s",
    chipAge: "1m",
    comments: 2,
    mc: "$5.43K",
  },
  {
    id: "r2",
    name: "dbd",
    symbol: "dance bbay dog",
    desc: "dancing dog",
    age: "18m",
    chipAge: "8mo",
    comments: 1,
  },
];
