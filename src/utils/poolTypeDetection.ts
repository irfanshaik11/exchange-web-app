import type { Token } from "./db";

export type PoolType = 
  | "PumpAmm" 
  | "Raydium CPMM" 
  | "Pumpfun" 
  | "launchLab" 
  | "bonk" 
  | "meteora dbc" 
  | "meteora amm v1" 
  | "meteora amm v2" 
  | "bags" 
  | "MoonShoot" 
  | "";

/**
 * Determines the correct pool type for a token based on its protocol/launchpad metadata.
 * Maps various protocol names from token-service to backend poolType values.
 */
export function getPoolTypeFromToken(token: Token): PoolType {
  const protocol = token.launchpad_protocol || token.launchpadProtocol || token.protocol || token.amm_id || "";
  const protocolLower = protocol.toLowerCase();
  
  // Map various protocol names to backend poolType values
  if (protocolLower.includes("pumpswap") || protocolLower.includes("pump_swap") || protocolLower.includes("pump_amm") || protocolLower === "pumpamm") {
    return "PumpAmm";
  }
  if (protocolLower.includes("pump.fun") || protocolLower.includes("pumpfun") || protocolLower === "pump") {
    return "Pumpfun";
  }
  if (protocolLower.includes("raydium") && protocolLower.includes("cpmm")) {
    return "Raydium CPMM";
  }
  if (protocolLower.includes("meteora") && protocolLower.includes("dbc")) {
    return "meteora dbc";
  }
  if (protocolLower.includes("meteora") && protocolLower.includes("v1")) {
    return "meteora amm v1";
  }
  if (protocolLower.includes("meteora") && protocolLower.includes("v2")) {
    return "meteora amm v2";
  }
  if (protocolLower.includes("launchlab")) {
    return "launchLab";
  }
  if (protocolLower.includes("bonk")) {
    return "bonk";
  }
  if (protocolLower.includes("bags")) {
    return "bags";
  }
  if (protocolLower.includes("moonshoot")) {
    return "MoonShoot";
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

