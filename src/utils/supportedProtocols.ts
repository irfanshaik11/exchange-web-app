/**
 * Supported Trading Protocols
 * 
 * Lists DEXs/protocols that the backend can trade natively without third-party dependencies
 */

export const NATIVELY_SUPPORTED_PROTOCOLS = [
  // Fully supported - native SDK implementations
  'pump.fun',
  'pumpfun',
  'pump',
  'pumpamm',
  'pump_amm',
  'pumpswap',
  'pump_swap',
  'meteora',
  'meteora dbc',
  'meteora dlmm',
  'meteora amm v1',
  'meteora amm v2',
  'raydium',
  'raydium amm',
  'raydium clmm', 
  'launchlab',
  'bonk',
  'bags',
];

export const PARTIALLY_SUPPORTED_PROTOCOLS = [
  // Some pools work, some don't
  'raydium cpmm', // Most work, some configs fail
];

export const UNSUPPORTED_PROTOCOLS = [
  // Not natively supported
  'moonshoot',
  'moonshot',
  'phoenix',
  'lifinity',
  'orca', // No SDK installed yet
  'whirlpool',
];

/**
 * Check if a token's protocol is natively supported
 */
export function isProtocolSupported(protocol: string | undefined | null): boolean {
  if (!protocol) return false;
  
  const protocolLower = protocol.toLowerCase().trim();
  
  // Check if fully supported
  const isFullySupported = NATIVELY_SUPPORTED_PROTOCOLS.some(supported => 
    protocolLower.includes(supported.toLowerCase())
  );
  
  if (isFullySupported) return true;
  
  // Check if partially supported (allow for now)
  const isPartiallySupported = PARTIALLY_SUPPORTED_PROTOCOLS.some(supported =>
    protocolLower.includes(supported.toLowerCase())
  );
  
  return isPartiallySupported;
}

/**
 * Get user-friendly protocol name
 */
export function getProtocolDisplayName(protocol: string | undefined | null): string {
  if (!protocol) return 'Unknown';
  
  const protocolLower = protocol.toLowerCase();
  
  if (protocolLower.includes('pump')) return 'Pump.fun';
  if (protocolLower.includes('meteora')) return 'Meteora';
  if (protocolLower.includes('raydium')) return 'Raydium';
  if (protocolLower.includes('moonshoot') || protocolLower.includes('moonshot')) return 'MoonShot';
  if (protocolLower.includes('phoenix')) return 'Phoenix';
  if (protocolLower.includes('orca')) return 'Orca';
  
  return protocol;
}

/**
 * Filter tokens to only those with supported protocols
 */
export function filterSupportedTokens(tokens: any[]): any[] {
  return tokens.filter(token => {
    const protocol = token.launchpad_protocol || token.protocol || token.amm;
    return isProtocolSupported(protocol);
  });
}

