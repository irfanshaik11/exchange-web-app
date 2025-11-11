import Cookies from 'js-cookie';

const TOKEN_KEY = 'referralAccessToken';
const META_KEY = 'referralAccessMeta';

export type ReferralAccessMeta = {
  code: string;
  label?: string | null;
  isDefault: boolean;
  storedAt: number;
};

function safeReadStorage<T extends 'localStorage' | 'sessionStorage'>(
  storage: T,
  key: string,
): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window[storage]?.getItem(key) ?? null;
  } catch (error) {
    console.warn(`Failed to read ${storage} item`, { key, error });
    return null;
  }
}

function safeWriteStorage<T extends 'localStorage' | 'sessionStorage'>(
  storage: T,
  key: string,
  value: string,
) {
  if (typeof window === 'undefined') return;
  try {
    window[storage]?.setItem(key, value);
  } catch (error) {
    console.warn(`Failed to write ${storage} item`, { key, error });
  }
}

function safeRemoveStorage<T extends 'localStorage' | 'sessionStorage'>(
  storage: T,
  key: string,
) {
  if (typeof window === 'undefined') return;
  try {
    window[storage]?.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove ${storage} item`, { key, error });
  }
}

function parseMeta(raw: string | undefined | null): ReferralAccessMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === 'string') {
      return parsed as ReferralAccessMeta;
    }
  } catch (error) {
    console.warn('Failed to parse referral access metadata', error);
  }
  return null;
}

export function getStoredReferralToken(): string | null {
  const local = safeReadStorage('localStorage', TOKEN_KEY);
  if (local) return local;

  const session = safeReadStorage('sessionStorage', TOKEN_KEY);
  if (session) return session;

  try {
    const cookieToken = Cookies.get(TOKEN_KEY);
    if (cookieToken) return cookieToken;
  } catch (error) {
    console.warn('Failed to read referral token cookie', error);
  }

  return null;
}

export function getStoredReferralMeta(): ReferralAccessMeta | null {
  const local = parseMeta(safeReadStorage('localStorage', META_KEY));
  if (local) return local;

  const session = parseMeta(safeReadStorage('sessionStorage', META_KEY));
  if (session) return session;

  try {
    return parseMeta(Cookies.get(META_KEY));
  } catch (error) {
    console.warn('Failed to read referral metadata cookie', error);
    return null;
  }
}

export function storeReferralAccess(
  token: string,
  meta: Omit<ReferralAccessMeta, 'storedAt'> & { storedAt?: number },
) {
  const payload: ReferralAccessMeta = {
    ...meta,
    storedAt: meta.storedAt ?? Date.now(),
  };

  safeWriteStorage('localStorage', TOKEN_KEY, token);
  safeWriteStorage('sessionStorage', TOKEN_KEY, token);
  safeWriteStorage('localStorage', META_KEY, JSON.stringify(payload));
  safeWriteStorage('sessionStorage', META_KEY, JSON.stringify(payload));

  try {
    Cookies.set(TOKEN_KEY, token, { path: '/', expires: 30 });
    Cookies.set(META_KEY, JSON.stringify(payload), { path: '/', expires: 30 });
  } catch (error) {
    console.warn('Failed to persist referral access to cookies', error);
  }
}

export function clearStoredReferralAccess() {
  safeRemoveStorage('localStorage', TOKEN_KEY);
  safeRemoveStorage('sessionStorage', TOKEN_KEY);
  safeRemoveStorage('localStorage', META_KEY);
  safeRemoveStorage('sessionStorage', META_KEY);

  try {
    Cookies.remove(TOKEN_KEY, { path: '/' });
    Cookies.remove(META_KEY, { path: '/' });
  } catch (error) {
    console.warn('Failed to clear referral cookies', error);
  }
}

