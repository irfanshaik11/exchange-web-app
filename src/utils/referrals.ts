import { WALLET_TRACKER_API_URL } from "./walletTracking";

export interface ReferralRecord {
  id: number;
  userId: string;
  referralCode: string;
  referredCount: number;
  createdOn: string;
  updatedOn: string;
}

interface ReferralCodeResponse {
  ok: boolean;
  data: ReferralRecord;
  alreadyExisted?: boolean;
  error?: string;
  message?: string;
}

function buildErrorMessage(
  status: number,
  statusText: string,
  payload: any,
  fallback: string,
) {
  if (payload) {
    if (typeof payload === "string" && payload.trim().length > 0) {
      return payload;
    }
    if (typeof payload === "object") {
      return payload.error || payload.message || fallback;
    }
  }
  return statusText ? `HTTP ${status} ${statusText}` : fallback;
}

export async function fetchReferralCodeForUser(
  userId: string,
): Promise<ReferralRecord | null> {
  const url = `${WALLET_TRACKER_API_URL}/api/referrals/code?userId=${encodeURIComponent(
    userId,
  )}`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to fetch referral code",
      );
      throw new Error(message);
    }

    const payload = (await response.json()) as ReferralCodeResponse;

    if (!payload?.ok || !payload.data?.referralCode) {
      throw new Error("Unexpected response while fetching referral code");
    }

    return payload.data;
  } catch (error) {
    console.error("Error fetching referral code:", error);
    throw error;
  }
}

export async function ensureReferralCodeForUser(
  userId: string,
): Promise<ReferralRecord> {
  try {
    const response = await fetch(`${WALLET_TRACKER_API_URL}/api/referrals/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ReferralCodeResponse
      | null;

    if (!response.ok || !payload?.ok || !payload.data?.referralCode) {
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to generate referral code",
      );
      throw new Error(message);
    }

    return payload.data;
  } catch (error) {
    console.error("Error generating referral code:", error);
    throw error;
  }
}

