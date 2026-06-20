import { useEffect, useState } from 'react';
import {
  fetchBnbDevTokensByCreator,
  fetchBnbTokenDetail,
  resolveBnbCreatorWallet,
  resolveBnbMarketCapUsd,
  resolveBnbLiquidityUsd,
  resolveBnbVolumeUsd,
} from '~/utils/bnbToken';

export interface BnbDevTokenRow {
  mint: string;
  name: string;
  symbol: string;
  status: string;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  createdAt: string;
  launchpadProtocol: string;
}

export default function useBnbDevTokens(
  mint: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const [tokens, setTokens] = useState<BnbDevTokenRow[]>([]);
  const [creatorWallet, setCreatorWallet] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mint || !enabled) {
      setTokens([]);
      setCreatorWallet(undefined);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const detail = await fetchBnbTokenDetail(mint);
        if (cancelled) return;

        const creator = resolveBnbCreatorWallet(detail);
        setCreatorWallet(creator);
        if (!creator) {
          setTokens([]);
          return;
        }

        const raw = await fetchBnbDevTokensByCreator(creator, {
          includeMint: mint,
          includeToken: detail,
          scanLimit: 200,
        });
        if (cancelled) return;

        const rows: BnbDevTokenRow[] = raw.map((t) => ({
          mint: String(t.mint || '').toLowerCase(),
          name: String(t.name || t.symbol || ''),
          symbol: String(t.symbol || ''),
          status: String(t.status || ''),
          marketCapUsd: resolveBnbMarketCapUsd(t) ?? 0,
          liquidityUsd: resolveBnbLiquidityUsd(t) ?? 0,
          volume24hUsd: resolveBnbVolumeUsd(t) ?? 0,
          createdAt: String(t.created_at || ''),
          launchpadProtocol: String(t.launchpad_protocol || t.protocol || ''),
        }));

        setTokens(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dev tokens');
          setTokens([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mint, enabled]);

  return { tokens, creatorWallet, isLoading, error };
}
