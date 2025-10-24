import { useEffect, useState } from "react";

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
        // Accept multiple possible fields and formats
        let v: any = createdAt;
        if (v === null || v === undefined) return "-";

        if (typeof v === "object") {
          if ("Time" in v && typeof (v as any).Time === "string")
            v = (v as any).Time;
          else if ("time" in v && typeof (v as any).time === "string")
            v = (v as any).time;
          else if ("seconds" in v && typeof (v as any).seconds === "number")
            v = Number((v as any).seconds) * 1000;
          else if ("millis" in v && typeof (v as any).millis === "number")
            v = Number((v as any).millis);
        }

        let ts: number | null = null;
        if (typeof v === "number") {
          // Heuristic: treat 13-digit as ms, 10-digit as seconds
          if (v > 1e12) ts = v;
          else if (v > 1e9) ts = v * 1000;
          else ts = null;
        } else if (typeof v === "string") {
          const num = Number(v);
          if (!Number.isNaN(num) && num > 0) {
            if (num > 1e12) ts = num;
            else if (num > 1e9) ts = num * 1000;
          }
          if (ts === null) {
            const d = Date.parse(v);
            if (!Number.isNaN(d)) ts = d;
          }
        } else if (v instanceof Date) {
          ts = v.getTime();
        }

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
