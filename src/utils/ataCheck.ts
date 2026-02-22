import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const ATA_RENT_SOL = 0.002; // ~2,039,280 lamports

const cache = new Map<string, { exists: boolean; ts: number }>();
const CACHE_TTL = 60_000; // 60s

export async function checkAtaExists(
  mint: string | null | undefined,
  wallet: string | null | undefined
): Promise<boolean | null> {
  if (!mint || !wallet) return null;
  const key = `${mint}:${wallet}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.exists;

  try {
    const mintPk = new PublicKey(mint);
    const walletPk = new PublicKey(wallet);
    const splAta = getAssociatedTokenAddressSync(mintPk, walletPk, false, TOKEN_PROGRAM_ID);
    const t22Ata = getAssociatedTokenAddressSync(mintPk, walletPk, false, TOKEN_2022_PROGRAM_ID);

    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
    const conn = new Connection(rpc, 'confirmed');
    const accounts = await conn.getMultipleAccountsInfo([splAta, t22Ata]);
    const exists = accounts.some(a => a !== null);

    cache.set(key, { exists, ts: Date.now() });
    return exists;
  } catch {
    return null; // RPC failed → let backend validate
  }
}

// Fire-and-forget prefetch (for token detail page mount)
export function prefetchAtaCheck(mint: string | null | undefined, wallet: string | null | undefined): void {
  checkAtaExists(mint, wallet);
}
