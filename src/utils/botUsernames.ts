/**
 * Frontend mirror of the backend leaderboard bot username pool.
 *
 * Kept in sync with `exchange-backend/src/constants/botUsernames.ts`.
 * Used purely for client-side UX — instant "this name is reserved"
 * feedback in LoginModal / UsernameEditModal without a round-trip.
 *
 * Source of truth is still the backend; the server independently
 * rejects bot-pool collisions in `checkUsername` / `setUsername`.
 */
const BOT_USERNAME_POOL = [
  // Natural-looking handles
  'emma', 'lucas', 'mike', 'alex', 'noah',
  'leo', 'jordan', 'sarah', 'ryan', 'liam',
  'glacier', 'nebula', 'orbit', 'spark', 'echo',
  'cinder', 'midnight', 'frost',
  'rj24', 't3ch', 'mj91', 'kr0w', 'sh4de',
  'nano7', 'alpha0', 'stacks_',
  'mannn', 'beeee', 'grex', 'wizrd', 'saddle', 'cryptowl',
  'greendoor', 'softwinter', 'lazyorca',
  'coldbrew', 'nullbyte', 'driftr',
  // Crypto-flavored handles
  'jito_mike', 'sol.alex', 'toly_stan', 'tony_pnl',
  'mint_mike', 'degen_dad', 'gwei_gwen', 'chainlink_kevin',
  'diamondpaw', 'bagholdr', 'hodlmode', 'maxis',
  'exitliq', 'ser.eth', 'hyperkid', 'nfa_ser',
  'jpeg_dan', 'frontrun', 'flash_boy', 'mev_tim',
  'apezz', 'smol', 'fren', 'rugged',
  'vcexit', 'rekt_again', 'retail_max', 'bought_the_top',
  'sold_zero', 'pnl_hunter', 'hodl_hardy',
  'lovely.sol', 'alpha.sol', 'midas.sol', 'bluechip.sol',
  'cat_person', 'sleepy_dog',
] as const;

const RESERVED_BOT_NAMES = new Set(
  BOT_USERNAME_POOL.map(name => name.normalize('NFKC').toLowerCase()),
);

export function isBotUsername(username: string): boolean {
  if (!username) return false;
  return RESERVED_BOT_NAMES.has(username.normalize('NFKC').toLowerCase());
}
