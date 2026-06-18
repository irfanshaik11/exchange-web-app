import { extractMetaImage, normalizeImageUrl } from '~/utils/images';

const BSC_RPC_URL =
  process.env.BSC_RPC_URL ||
  process.env.NEXT_PUBLIC_BSC_RPC_URL ||
  'https://bsc-dataseed.binance.org';

const META_URI_SELECTOR = '0x67605787';
const FLAP_IPFS_GATEWAY = 'https://flap.mypinata.cloud/ipfs/';
const FOUR_MEME_API = 'https://four.meme/meme-api/v1';
const FOUR_MEME_STATIC = 'https://static.four.meme';

export interface BnbTokenImageResult {
  image_url: string | null;
  uri: string | null;
  name: string | null;
  symbol: string | null;
  source: 'four.meme' | 'flap' | null;
}

function decodeAbiString(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x') return null;
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length < 128) return null;
  const offset = Number.parseInt(raw.slice(0, 64), 16) * 2;
  if (!Number.isFinite(offset) || offset + 64 > raw.length) return null;
  const length = Number.parseInt(raw.slice(offset, offset + 64), 16);
  if (!Number.isFinite(length) || length <= 0) return null;
  const dataHex = raw.slice(offset + 64, offset + 64 + length * 2);
  if (!dataHex) return null;
  try {
    return Buffer.from(dataHex, 'hex').toString('utf8').replace(/\0+$/g, '').trim() || null;
  } catch {
    return null;
  }
}

async function bscEthCall(to: string, data: string, signal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(BSC_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.error || typeof payload?.result !== 'string') return null;
    return payload.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildIpfsCandidates(cid: string): string[] {
  const trimmed = cid.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '').trim();
  if (!trimmed) return [];
  const gateways = [
    `${FLAP_IPFS_GATEWAY}${trimmed}`,
    `https://ipfs.io/ipfs/${trimmed}`,
    `https://nftstorage.link/ipfs/${trimmed}`,
    `https://gateway.pinata.cloud/ipfs/${trimmed}`,
    `https://dweb.link/ipfs/${trimmed}`,
  ];
  return [...new Set(gateways)];
}

async function fetchJsonFromCandidates(
  urls: string[],
  signal?: AbortSignal,
): Promise<{ json: any; url: string } | null> {
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Interstate-BNB-Image/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.trim()) continue;
      const json = JSON.parse(text);
      return { json, url };
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

function normalizeFourMemeImage(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return normalizeImageUrl(trimmed) ?? trimmed;
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalizeImageUrl(`${FOUR_MEME_STATIC}${path}`) ?? `${FOUR_MEME_STATIC}${path}`;
}

function normalizeFlapImageField(imageField: string | null | undefined): string | null {
  if (!imageField || typeof imageField !== 'string') return null;
  const trimmed = imageField.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('ipfs://')) {
    return normalizeImageUrl(trimmed);
  }
  return normalizeImageUrl(`${FLAP_IPFS_GATEWAY}${trimmed}`) ?? `${FLAP_IPFS_GATEWAY}${trimmed}`;
}

async function resolveFourMemeImage(
  mint: string,
  signal?: AbortSignal,
): Promise<BnbTokenImageResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(
      `${FOUR_MEME_API}/private/token/get/v2?address=${encodeURIComponent(mint)}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const data = payload?.data;
    const image = normalizeFourMemeImage(data?.image);
    const name = typeof data?.name === 'string' ? data.name.trim() || null : null;
    const symbol =
      (typeof data?.shortName === 'string' && data.shortName.trim()) ||
      (typeof data?.symbol === 'string' && data.symbol.trim()) ||
      null;
    if (!image && !name && !symbol) return null;
    return { image_url: image, uri: null, name, symbol, source: 'four.meme' };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveFlapImage(
  mint: string,
  signal?: AbortSignal,
): Promise<BnbTokenImageResult | null> {
  const raw = await bscEthCall(mint, META_URI_SELECTOR, signal);
  const cid = decodeAbiString(raw);
  if (!cid) return null;

  const metaCandidates = buildIpfsCandidates(cid);
  const fetched = await fetchJsonFromCandidates(metaCandidates, signal);
  if (!fetched) {
    return {
      image_url: null,
      uri: metaCandidates[0] ?? null,
      name: null,
      symbol: null,
      source: 'flap',
    };
  }

  const imageFromMeta =
    normalizeFlapImageField(fetched.json?.image) ||
    extractMetaImage(fetched.json) ||
    null;
  const name = typeof fetched.json?.name === 'string' ? fetched.json.name.trim() || null : null;
  const symbol =
    (typeof fetched.json?.symbol === 'string' && fetched.json.symbol.trim()) ||
    (typeof fetched.json?.ticker === 'string' && fetched.json.ticker.trim()) ||
    null;

  return {
    image_url: imageFromMeta,
    uri: fetched.url,
    name,
    symbol,
    source: 'flap',
  };
}

export function isFourMemeProtocol(protocol?: string | null): boolean {
  const p = (protocol || '').toLowerCase();
  return (
    p.includes('four.meme') ||
    p.includes('fourmeme') ||
    p.includes('openfour') ||
    p === 'four'
  );
}

export function isFlapProtocol(protocol?: string | null): boolean {
  const p = (protocol || '').toLowerCase();
  return p.includes('flap');
}

export async function resolveBnbTokenImage(
  mint: string,
  protocol?: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<BnbTokenImageResult | null> {
  if (!mint) return null;
  const normalizedMint = mint.trim();
  if (!normalizedMint) return null;

  const { signal } = options;
  const tryOrder: Array<'four.meme' | 'flap'> = [];

  if (isFourMemeProtocol(protocol)) tryOrder.push('four.meme');
  if (isFlapProtocol(protocol)) tryOrder.push('flap');
  if (tryOrder.length === 0) {
    tryOrder.push('flap', 'four.meme');
  } else if (tryOrder.length === 1) {
    tryOrder.push(tryOrder[0] === 'flap' ? 'four.meme' : 'flap');
  }

  for (const source of tryOrder) {
    const result =
      source === 'four.meme'
        ? await resolveFourMemeImage(normalizedMint, signal)
        : await resolveFlapImage(normalizedMint, signal);
    if (result?.image_url || result?.name || result?.symbol) return result;
  }

  if (isFlapProtocol(protocol) || !protocol) {
    const flapOnly = await resolveFlapImage(normalizedMint, signal);
    if (flapOnly?.uri || flapOnly?.name || flapOnly?.symbol) return flapOnly;
  }

  return null;
}
