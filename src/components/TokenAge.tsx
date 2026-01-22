import { useEffect, useState } from "react";
import { normalizeTimestampMs } from "~/utils/db";

interface TokenAgeProps {
  createdAt: any;
}

/**
 * Live-updating age component that refreshes every second
 * Only re-renders itself, not the parent table
 */
export function TokenAge({ createdAt }: TokenAgeProps) {
  const [ageLabel, setAgeLabel] = useState<string>("-");

  useEffect(() => {
    const calculateAge = (): string => {
      try {
        // Use shared timestamp normalization utility
        const ts = normalizeTimestampMs(createdAt);
        if (ts === null) return "-";

        const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (diffSec < 60) return `${diffSec}s`;
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
        return `${Math.floor(diffSec / 86400)}d`;
      } catch {
        return "-";
      }
    };

    // Calculate initial age
    setAgeLabel(calculateAge());

    // Update every 1 second
    const interval = setInterval(() => {
      setAgeLabel(calculateAge());
    }, 1000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [createdAt]);

  return <>{ageLabel}</>;
}
