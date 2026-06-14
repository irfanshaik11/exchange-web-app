import React, { useState } from "react";
import { KOL_ADDRESS_MAP } from "~/utils/kolLookup";

/**
 * KOL profile-pic circle, keyed by wallet address. Renders nothing for
 * non-KOL wallets. LOCAL-ONLY fallback so a refresh never hits the network
 * (all kolscan avatars are pre-backfilled to local immutable files):
 *   0) local kolscan backfill  /kol-avatars/{address}.png
 *   1) old handle-based file    /kol-avatars/{handle}.jpg (kol.avatarUrl)
 *   2) colored initial          (label + hexColor from kolLookup)
 * Shared by WalletRow (Wallet Manager list) and the wallet-scan header.
 */
export const KolDpCircle: React.FC<{
  address?: string;
  size?: number;
  className?: string;
}> = ({ address, size = 28, className }) => {
  const kol = address ? KOL_ADDRESS_MAP.get(address.toLowerCase()) : undefined;
  const [stage, setStage] = useState(0);
  if (!kol || !address) return null;
  const handle = kol.twitterUsername;
  const src =
    stage === 0
      ? `/kol-avatars/${address}.png`
      : stage === 1 && kol.avatarUrl
        ? kol.avatarUrl
        : null;
  const dim = { width: size, height: size };
  if (!src) {
    return (
      <span
        className={`flex flex-shrink-0 items-center justify-center rounded-md font-bold text-white ${className ?? ""}`}
        style={{ ...dim, backgroundColor: kol.hexColor, fontSize: size * 0.4 }}
        title={handle ? `@${handle}` : kol.name}
      >
        {kol.label}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={kol.name}
      title={`@${handle}`}
      className={`flex-shrink-0 rounded-md object-cover ring-1 ring-white/10 ${className ?? ""}`}
      style={dim}
      onError={() => setStage((s) => s + 1)}
    />
  );
};

export default KolDpCircle;
