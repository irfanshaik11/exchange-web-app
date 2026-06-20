import { useEffect, useRef, useState } from 'react';
import { fetchBnbHolderCount } from '~/utils/bnbToken';

const POLL_MS = 60_000;

export default function useBnbHoldersRest(
  mint: string | undefined,
  options?: { enabled?: boolean },
): {
  totalHolders: number | undefined;
  isLoading: boolean;
  error: string | null;
} {
  const enabled = options?.enabled ?? true;
  const [totalHolders, setTotalHolders] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (!mint || !enabled) {
      setTotalHolders(undefined);
      hasDataRef.current = false;
      return;
    }

    setTotalHolders(undefined);
    hasDataRef.current = false;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      if (!hasDataRef.current) setIsLoading(true);
      try {
        const count = await fetchBnbHolderCount(mint);
        if (cancelled) return;
        if (count != null && count > 0) {
          setTotalHolders(count);
          hasDataRef.current = true;
          setError(null);
        } else if (!hasDataRef.current) {
          setError('Holder count not available');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'failed to load holders');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await fetchOnce();
        if (!cancelled) schedule();
      }, POLL_MS);
    };

    void fetchOnce().then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mint, enabled]);

  return { totalHolders, isLoading, error };
}
