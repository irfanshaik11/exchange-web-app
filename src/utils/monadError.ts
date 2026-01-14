export function formatMonadError(raw: string | undefined | null): string {
  if (!raw) return 'Trade failed. Please try again.';

  const error = String(raw).trim();
  const lower = error.toLowerCase();

  // Detailed backend messages we want to surface as-is
  if (lower.includes('no wallet has enough mon for gas')) {
    return error;
  }
  if (
    lower.includes('no wallets have tokens') ||
    lower.includes('no token balances found') ||
    lower.includes('no tokens available') ||
    lower.includes('no tokens to sell') ||
    lower.includes('calculated sell amount is zero')
  ) {
    return 'No tokens found to sell in the selected wallets.';
  }

  if (
    lower.includes('err_bonding_curve_library_invalid_inputs') ||
    lower.includes('bonding_curve_library_invalid_inputs')
  ) {
    return 'This token has no liquidity or has graduated to DEX. Try a different token.';
  }

  if (
    lower.includes('insufficient liquidity') ||
    lower.includes('expected output is 0') ||
    lower.includes('no liquidity')
  ) {
    return 'Insufficient liquidity. This token may not be available for trading.';
  }

  if (lower.includes('token does not exist') || lower.includes('token may not exist')) {
    return 'Token not found. Please check the token address.';
  }

  if (lower.includes('token has graduated') || lower.includes('graduated to dex')) {
    return 'This token has graduated to DEX. Trading on bonding curve is no longer available.';
  }

  if (lower.includes('locked') || lower.includes('cannot be traded')) {
    return 'This token is locked and cannot be traded.';
  }

  // Preserve numeric insufficiency details instead of a generic message
  if (lower.includes('insufficient balance')) {
    if (lower.includes('need') || lower.includes('gas') || lower.includes('mon')) {
      return error;
    }
    return 'Insufficient balance. Please add more MON.';
  }

  if (lower.includes('execution reverted') || lower.includes('revert')) {
    return 'Transaction failed. The token may not be available or there may be insufficient liquidity.';
  }

  // Return original error if it's short and user-friendly
  if (error.length < 140 && !error.includes('0x') && !error.includes('data:')) {
    return error;
  }

  return 'Trade failed. Please try again.';
}
