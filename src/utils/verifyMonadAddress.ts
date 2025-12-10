/**
 * Validates a Monad (Ethereum-style) address
 * Monad addresses are Ethereum-compatible addresses (0x followed by 40 hex characters)
 */
export function isValidMonadAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  const trimmed = address.trim();
  
  // Must start with 0x
  if (!trimmed.startsWith('0x')) {
    return false;
  }
  
  // Must be exactly 42 characters (0x + 40 hex chars)
  if (trimmed.length !== 42) {
    return false;
  }
  
  // Check that the rest (after 0x) are valid hex characters
  const hexPart = trimmed.slice(2);
  const hexRegex = /^[0-9a-fA-F]{40}$/;
  
  return hexRegex.test(hexPart);
}

