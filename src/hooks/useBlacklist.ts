import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "pulse_blacklist";
const MAX_TOTAL_ITEMS = 1000;

export type BlacklistCategory = "ca" | "dev" | "twitterHandle";

export interface BlacklistData {
  ca: string[];
  dev: string[];
  twitterHandle: string[];
}

const EMPTY_BLACKLIST: BlacklistData = { ca: [], dev: [], twitterHandle: [] };

function loadBlacklist(): BlacklistData {
  if (typeof window === "undefined") return EMPTY_BLACKLIST;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_BLACKLIST;
    const parsed = JSON.parse(raw);
    return {
      ca: Array.isArray(parsed.ca) ? parsed.ca : [],
      dev: Array.isArray(parsed.dev) ? parsed.dev : [],
      twitterHandle: Array.isArray(parsed.twitterHandle) ? parsed.twitterHandle : [],
    };
  } catch {
    return EMPTY_BLACKLIST;
  }
}

export function useBlacklist() {
  const [blacklist, setBlacklist] = useState<BlacklistData>(EMPTY_BLACKLIST);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setBlacklist(loadBlacklist());
    setIsLoaded(true);
  }, []);

  // Persist to localStorage on change — only write if data actually changed,
  // then notify other useBlacklist instances via custom event
  useEffect(() => {
    if (isLoaded) {
      const serialized = JSON.stringify(blacklist);
      if (localStorage.getItem(STORAGE_KEY) !== serialized) {
        localStorage.setItem(STORAGE_KEY, serialized);
        window.dispatchEvent(new CustomEvent('pulse-blacklist-changed'));
      }
    }
  }, [blacklist, isLoaded]);

  // Sync from other useBlacklist instances (same tab) + cross-tab sync
  useEffect(() => {
    const sync = () => setBlacklist(loadBlacklist());
    window.addEventListener('pulse-blacklist-changed', sync);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) sync(); };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pulse-blacklist-changed', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // O(1) lookup Sets derived from arrays
  const caSet = useMemo(() => new Set(blacklist.ca.map(s => s.toLowerCase())), [blacklist.ca]);
  const devSet = useMemo(() => new Set(blacklist.dev.map(s => s.toLowerCase())), [blacklist.dev]);
  const twitterSet = useMemo(() => new Set(blacklist.twitterHandle.map(s => s.toLowerCase())), [blacklist.twitterHandle]);

  const totalCount = blacklist.ca.length + blacklist.dev.length + blacklist.twitterHandle.length;

  const categoryCounts = useMemo(() => ({
    ca: blacklist.ca.length,
    dev: blacklist.dev.length,
    twitterHandle: blacklist.twitterHandle.length,
  }), [blacklist.ca.length, blacklist.dev.length, blacklist.twitterHandle.length]);

  const addItem = useCallback((category: BlacklistCategory, value: string) => {
    if (!value?.trim()) return;
    const normalized = value.trim();
    setBlacklist((prev) => {
      const currentTotal = prev.ca.length + prev.dev.length + prev.twitterHandle.length;
      if (currentTotal >= MAX_TOTAL_ITEMS) return prev;
      // Deduplicate (case-insensitive)
      const lowerVal = normalized.toLowerCase();
      if (prev[category].some(item => item.toLowerCase() === lowerVal)) return prev;
      return { ...prev, [category]: [...prev[category], normalized] };
    });
  }, []);

  const removeItem = useCallback((category: BlacklistCategory, value: string) => {
    const lowerVal = value.toLowerCase();
    setBlacklist((prev) => ({
      ...prev,
      [category]: prev[category].filter(item => item.toLowerCase() !== lowerVal),
    }));
  }, []);

  const clearCategory = useCallback((category: BlacklistCategory | "all") => {
    if (category === "all") {
      setBlacklist(EMPTY_BLACKLIST);
    } else {
      setBlacklist((prev) => ({ ...prev, [category]: [] }));
    }
  }, []);

  const exportBlacklist = useCallback((): string => {
    const out: Record<string, { value: string; type: string; time: number }> = {};
    const now = Date.now();
    const mapping: [BlacklistCategory, string][] = [
      ["ca", "ca"],
      ["dev", "dev"],
      ["twitterHandle", "twitter_profile"],
    ];
    for (const [cat, type] of mapping) {
      for (const val of blacklist[cat]) {
        out[`${type}-${val}`] = { value: val, type, time: now };
      }
    }
    return JSON.stringify(out, null, 2);
  }, [blacklist]);

  const importBlacklist = useCallback((text: string): boolean => {
    try {
      const parsed = JSON.parse(text);
      let imported: BlacklistData;

      if (Array.isArray(parsed.ca) || Array.isArray(parsed.dev) || Array.isArray(parsed.twitterHandle)) {
        // Old format: { ca: [], dev: [], twitterHandle: [] }
        imported = {
          ca: Array.isArray(parsed.ca) ? parsed.ca.slice(0, MAX_TOTAL_ITEMS) : [],
          dev: Array.isArray(parsed.dev) ? parsed.dev : [],
          twitterHandle: Array.isArray(parsed.twitterHandle) ? parsed.twitterHandle : [],
        };
      } else {
        // New keyed format: { "type-value": { value, type, time }, ... }
        imported = { ca: [], dev: [], twitterHandle: [] };
        for (const entry of Object.values(parsed) as { value: string; type: string }[]) {
          if (!entry || typeof entry.value !== "string" || typeof entry.type !== "string") continue;
          if (entry.type === "ca") imported.ca.push(entry.value);
          else if (entry.type === "dev") imported.dev.push(entry.value);
          else if (entry.type === "twitter_profile") imported.twitterHandle.push(entry.value);
        }
      }

      // Trim to max total
      const all = [...imported.ca, ...imported.dev, ...imported.twitterHandle];
      if (all.length > MAX_TOTAL_ITEMS) {
        const ratio = MAX_TOTAL_ITEMS / all.length;
        imported.ca = imported.ca.slice(0, Math.ceil(imported.ca.length * ratio));
        imported.dev = imported.dev.slice(0, Math.ceil(imported.dev.length * ratio));
        imported.twitterHandle = imported.twitterHandle.slice(0, Math.ceil(imported.twitterHandle.length * ratio));
      }
      setBlacklist(imported);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    blacklist,
    addItem,
    removeItem,
    clearCategory,
    exportBlacklist,
    importBlacklist,
    totalCount,
    categoryCounts,
    caSet,
    devSet,
    twitterSet,
    isLoaded,
  };
}
