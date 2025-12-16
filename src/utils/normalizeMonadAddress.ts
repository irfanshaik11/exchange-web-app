const MONAD_HEX_REGEX = /^[0-9a-fA-F]{40}$/;

export function normalizeMonadAddress(address?: string | null): string {
  if (!address || typeof address !== "string") return "";

  const trimmed = address.trim();
  if (!trimmed) return "";

  const value = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (!MONAD_HEX_REGEX.test(value)) {
    return "";
  }

  return `0x${value.toLowerCase()}`;
}

