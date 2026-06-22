import type { BnbFilters } from '~/contexts/BnbFiltersContext';
import {
  resolveBnbMarketCapUsd,
  resolveBnbLiquidityUsd,
  resolveBnbVolumeUsd,
  resolveBnbHolderCount,
  resolveBnbDevHoldingPct,
  resolveBnbTop10HoldersPct,
  resolveBnbSniperPct,
  resolveBnbCreatorWallet,
} from '~/utils/bnbToken';

const toNum = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function inRange(value: number, min: string, max: string): boolean {
  if (min !== '' && toNum(min) > value) return false;
  if (max !== '' && toNum(max) < value) return false;
  return true;
}

function tokenAgeMins(token: any): number {
  const ts = token.created_at ?? token.launch_time ?? token.launchTime;
  if (!ts) return 0;
  const ms = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / 60_000);
}

function pick(...vals: any[]): any {
  return vals.find((v) => v !== undefined && v !== null && v !== '');
}

export function applyBnbFilters(tokens: any[], filters: BnbFilters): any[] {
  return tokens.filter((token) => {
    // ── Search keywords ──────────────────────────────────────────────────────
    if (filters.searchKeywords) {
      const kws = filters.searchKeywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (kws.length) {
        const hay = `${token.name ?? ''} ${token.symbol ?? ''}`.toLowerCase();
        if (!kws.some((k) => hay.includes(k))) return false;
      }
    }

    if (filters.excludeKeywords) {
      const kws = filters.excludeKeywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (kws.length) {
        const hay = `${token.name ?? ''} ${token.symbol ?? ''}`.toLowerCase();
        if (kws.some((k) => hay.includes(k))) return false;
      }
    }

    // ── Dev wallet search ────────────────────────────────────────────────────
    if (filters.searchDevWallet) {
      const wallets = filters.searchDevWallet
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      const devWallet = (resolveBnbCreatorWallet(token) ?? '').toLowerCase();
      if (wallets.length && !wallets.some((w) => devWallet.includes(w))) return false;
    }

    // ── Launchpads ───────────────────────────────────────────────────────────
    if (filters.launchpads.length > 0) {
      const proto = (
        token.launchpad_protocol ??
        token.protocol ??
        ''
      ).toLowerCase();
      const match = filters.launchpads.some((lp) => proto.includes(lp.toLowerCase()));
      if (!match) return false;
    }

    // ── Numeric ranges ───────────────────────────────────────────────────────
    // B. Curve %
    if (filters.bCurveMin !== '' || filters.bCurveMax !== '') {
      const bc = toNum(token.bonding_curve_progress);
      if (!inRange(bc, filters.bCurveMin, filters.bCurveMax)) return false;
    }

    // Age (minutes)
    if (filters.ageMin !== '' || filters.ageMax !== '') {
      const age = tokenAgeMins(token);
      if (!inRange(age, filters.ageMin, filters.ageMax)) return false;
    }

    // Liquidity (stored in USD; filter is in K)
    if (filters.liquidityMin !== '' || filters.liquidityMax !== '') {
      const liq = resolveBnbLiquidityUsd(token) ?? 0;
      const minK = filters.liquidityMin !== '' ? toNum(filters.liquidityMin) * 1000 : -Infinity;
      const maxK = filters.liquidityMax !== '' ? toNum(filters.liquidityMax) * 1000 : Infinity;
      if (liq < minK || liq > maxK) return false;
    }

    // Market Cap (K)
    if (filters.mktCapMin !== '' || filters.mktCapMax !== '') {
      const mc = resolveBnbMarketCapUsd(token) ?? 0;
      const minK = filters.mktCapMin !== '' ? toNum(filters.mktCapMin) * 1000 : -Infinity;
      const maxK = filters.mktCapMax !== '' ? toNum(filters.mktCapMax) * 1000 : Infinity;
      if (mc < minK || mc > maxK) return false;
    }

    // Volume (K)
    if (filters.volumeMin !== '' || filters.volumeMax !== '') {
      const vol = resolveBnbVolumeUsd(token) ?? 0;
      const minK = filters.volumeMin !== '' ? toNum(filters.volumeMin) * 1000 : -Infinity;
      const maxK = filters.volumeMax !== '' ? toNum(filters.volumeMax) * 1000 : Infinity;
      if (vol < minK || vol > maxK) return false;
    }

    // TXs
    if (filters.txsMin !== '' || filters.txsMax !== '') {
      const txs = toNum(pick(token.tx_count_24h, token.tx_count_5m));
      if (!inRange(txs, filters.txsMin, filters.txsMax)) return false;
    }

    // Buys
    if (filters.buysMin !== '' || filters.buysMax !== '') {
      const buys = toNum(pick(token.total_buys_24h, token.total_buys_5m, token.buys_24h));
      if (!inRange(buys, filters.buysMin, filters.buysMax)) return false;
    }

    // Sells
    if (filters.sellsMin !== '' || filters.sellsMax !== '') {
      const sells = toNum(pick(token.total_sells_24h, token.total_sells_5m, token.sells_24h));
      if (!inRange(sells, filters.sellsMin, filters.sellsMax)) return false;
    }

    // Total Holders
    if (filters.totalHoldersMin !== '' || filters.totalHoldersMax !== '') {
      const holders = resolveBnbHolderCount(token) ?? 0;
      if (!inRange(holders, filters.totalHoldersMin, filters.totalHoldersMax)) return false;
    }

    // Dev Holding %
    if (filters.devHoldingMin !== '' || filters.devHoldingMax !== '') {
      const dh = resolveBnbDevHoldingPct(token) ?? 0;
      if (!inRange(dh, filters.devHoldingMin, filters.devHoldingMax)) return false;
    }

    // Top 10 Holding %
    if (filters.top10HoldingMin !== '' || filters.top10HoldingMax !== '') {
      const t10 = resolveBnbTop10HoldersPct(token) ?? 0;
      if (!inRange(t10, filters.top10HoldingMin, filters.top10HoldingMax)) return false;
    }

    // Insiders %
    if (filters.insidersMin !== '' || filters.insidersMax !== '') {
      const ins = toNum(pick(token.insiders_pct, token.insider_percent));
      if (!inRange(ins, filters.insidersMin, filters.insidersMax)) return false;
    }

    // Bundlers %
    if (filters.bundlersMin !== '' || filters.bundlersMax !== '') {
      const bun = toNum(pick(token.bundlers_pct, token.bundle_percent));
      if (!inRange(bun, filters.bundlersMin, filters.bundlersMax)) return false;
    }

    // Snipers Hold %
    if (filters.snipersHoldMin !== '' || filters.snipersHoldMax !== '') {
      const sn = resolveBnbSniperPct(token) ?? 0;
      if (!inRange(sn, filters.snipersHoldMin, filters.snipersHoldMax)) return false;
    }

    // Token Tax %
    if (filters.tokenTaxMin !== '' || filters.tokenTaxMax !== '') {
      const tax = toNum(pick(token.buy_tax, token.sell_tax, token.token_tax));
      if (!inRange(tax, filters.tokenTaxMin, filters.tokenTaxMax)) return false;
    }

    // ── Socials ───────────────────────────────────────────────────────────────
    if (filters.hasX) {
      if (!token.twitter && !token.twitter_url && !token.x_url) return false;
    }
    if (filters.hasWebsite) {
      if (!token.website && !token.website_url) return false;
    }
    if (filters.hasTelegram) {
      if (!token.telegram && !token.telegram_url) return false;
    }
    if (filters.withAtLeastOneSocial) {
      const hasSocial =
        token.twitter || token.twitter_url || token.x_url ||
        token.telegram || token.telegram_url ||
        token.website || token.website_url;
      if (!hasSocial) return false;
    }

    return true;
  });
}
