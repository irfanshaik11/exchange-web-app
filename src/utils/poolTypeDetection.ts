import type { Token } from "./db";

const isDev = process.env.NODE_ENV !== 'production';

export type PoolType =
  | "PumpAmm"
  | "Raydium"
  | "Raydium CPMM"
  | "Raydium CLMM"
  | "Raydium Launchpad"
  | "Pumpfun"
  | "launchLab"
  | "bonk"
  | "meteora dbc"
  | "meteora amm v1"
  | "meteora amm v2"
  | "Meteora"
  | "bags"
  | "MoonShoot"
  | "Orca"
  | "";

/**
 * Determines the correct pool type for a token based on its protocol/launchpad metadata.
 * Maps various protocol names from token-service to backend poolType values.
 */
export function getPoolTypeFromToken(token: Token): PoolType {
  const protocol = token.launchpad_protocol || token.launchpadProtocol || token.protocol || token.amm_id || "";
  const protocolLower = protocol.toLowerCase();
  
  // Map various protocol names to backend poolType values
  if (
    protocolLower.includes("pumpamm") ||
    protocolLower.includes("pump_amm") ||
    protocolLower.includes("pump amm")
  ) {
    return "PumpAmm";
  }
  if (
    protocolLower.includes("cache-to-cache") ||
    protocolLower.includes("cache_to_cache") ||
    protocolLower.includes("cache to cache") ||
    protocolLower === "c2c"
  ) {
    return "PumpAmm";
  }
  if (protocolLower.includes("pump.fun") || protocolLower.includes("pumpfun") || protocolLower === "pump") {
    return "Pumpfun";
  }
  // Raydium Launchpad detection - check before CPMM
  if (
    protocolLower.includes("raydium") && 
    (protocolLower.includes("launchpad") || protocolLower === "raydiumlaunchpad")
  ) {
    return "Raydium Launchpad";
  }
  if (protocolLower.includes("raydium") && protocolLower.includes("cpmm")) {
    return "Raydium CPMM";
  }
  if (protocolLower.includes("raydium") && protocolLower.includes("clmm")) {
    return "Raydium CLMM";
  }
  // Generic "raydium" without specific variant - backend Trade API will auto-route
  if (protocolLower.includes("raydium") || protocolLower === "raydium") {
    return "Raydium";
  }
  // Meteora protocol detection - check for specific variants first
  if (protocolLower.includes("meteora")) {
    if (protocolLower.includes("dbc")) {
      return "meteora dbc";
    }
    if (protocolLower.includes("v1") || protocolLower.includes("amm v1")) {
      return "meteora amm v1";
    }
    if (protocolLower.includes("v2") || protocolLower.includes("amm v2")) {
      return "meteora amm v2";
    }
    // If just "meteora" without variant, return "Meteora" for DLMM pools
    // Backend can still auto-detect the specific type from the pool address if needed
    if (protocolLower === "meteora") {
      isDev && console.log(`Protocol is "meteora" without specific variant for ${token.symbol}. Using generic "Meteora" pool type.`);
      return "Meteora"; // Generic Meteora (usually DLMM)
    }
    // If it contains "meteora" but we couldn't determine variant, return generic Meteora
    return "Meteora"; // Generic Meteora (usually DLMM)
  }
  if (protocolLower.includes("launchlab")) {
    return "launchLab";
  }
  if (protocolLower === "bonkswap" || protocolLower === "bonk_swap" || protocolLower === "bonk swap") {
    return "bonk";
  }
  if (protocolLower.includes("bags")) {
    return "bags";
  }
  if (protocolLower.includes("moonshoot")) {
    return "MoonShoot";
  }
  if (protocolLower.includes("orca")) {
    return "Orca";
  }
  
  // Default: try to guess based on token address
  if (token.mint?.endsWith("pump")) {
    console.warn(`⚠️ No protocol specified for ${token.symbol}, but mint ends with 'pump'. Assuming Pumpfun.`);
    return "Pumpfun";
  }
  
  // If no protocol info at all, return empty string - backend will auto-detect
  if (!protocol || protocol.trim() === "") {
    console.warn(`⚠️ No protocol information for token ${token.symbol} (${token.mint}).`);
    console.warn(`   Pair address: ${token.pair_address}`);
    console.warn(`   Frontend will send empty poolType - backend will auto-detect from pool address.`);
    return ""; // Backend will auto-detect from poolAddress
  }
  
  console.warn(`⚠️ Unknown protocol "${protocol}" for token ${token.symbol}. Frontend will send empty poolType - backend will auto-detect.`);
  return "";
}

