import { env } from "../env";

export interface ReferralRecord {
  id: number;
  userId: string;
  referralCode: string;
  referredCount: number;
  createdOn: string;
  updatedOn: string;
}

export interface ReferralUsageRecord {
  id: number;
  referredUser: string;
  referralCode: string;
  referredOn: string;
}

interface ReferralCodeResponse {
  status: boolean;
  data: ReferralRecord;
  alreadyExisted?: boolean;
  error?: string;
  message?: string;
}

interface ReferralUsageResponse {
  status: boolean;
  data: {
    referral: ReferralRecord;
    usage: ReferralUsageRecord;
  };
  alreadyRecorded?: boolean;
  error?: string;
  message?: string;
}

interface CheckReferralUsageResponse {
  status: boolean;
  hasUsedReferral: boolean;
  data: ReferralUsageRecord | null;
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
  authToken: string,
  userId?: string,
): Promise<ReferralRecord | null> {
  try {
    // Add userId to query params if provided
    const queryParams = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/referral/fetch_referral_code${queryParams}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

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

    if (!payload?.status || !payload.data?.referralCode) {
      throw new Error("Unexpected response while fetching referral code");
    }

    return payload.data;
  } catch (error) {
    console.error("Error fetching referral code:", error);
    throw error;
  }
}

export async function ensureReferralCodeForUser(
  authToken: string,
): Promise<ReferralRecord> {
  if (!authToken) {
    throw new Error("Authentication token is required");
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/referral/create_referral_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // Handle authentication errors specifically
      if (response.status === 401 || response.status === 403) {
        const errorPayload = payload as { error?: string; message?: string } | null;
        const errorMsg = errorPayload && typeof errorPayload === 'object' 
          ? (errorPayload.error || errorPayload.message || 'Invalid or expired token')
          : 'Invalid or expired token';
        throw new Error(errorMsg);
      }
      
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to generate referral code",
      );
      throw new Error(message);
    }

    const successPayload = payload as ReferralCodeResponse;
    if (!successPayload || !successPayload.status || !successPayload.data?.referralCode) {
      throw new Error("Unexpected response format while generating referral code");
    }

    return successPayload.data;
  } catch (error) {
    console.error("Error generating referral code:", error);
    throw error;
  }
}

export async function recordReferralUsage(
  authToken: string,
  referralCode: string,
): Promise<ReferralUsageResponse> {
  const normalizedCode = referralCode.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("Referral code is required");
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/referral/record_referral_usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        referralCode: normalizedCode,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | ReferralUsageResponse
      | null;

    if (!response.ok || !payload?.status) {
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to record referral usage",
      );
      throw new Error(message);
    }

    return payload;
  } catch (error) {
    console.error("Error recording referral usage:", error);
    throw error;
  }
}

export async function checkReferralUsageForUser(
  authToken: string,
  userId?: string,
): Promise<{ hasUsedReferral: boolean; data: ReferralUsageRecord | null }> {
  try {
    // Add userId to query params if provided
    const queryParams = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/referral/check_referral_usage${queryParams}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to check referral usage",
      );
      throw new Error(message);
    }

    const payload = (await response.json()) as CheckReferralUsageResponse;

    if (!payload?.status) {
      throw new Error("Unexpected response while checking referral usage");
    }

    return {
      hasUsedReferral: payload.hasUsedReferral,
      data: payload.data,
    };
  } catch (error) {
    console.error("Error checking referral usage:", error);
    throw error;
  }
}

export interface LeaderboardEntry {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  publicKey: string;
  referralCode: string;
  referredOn: string;
  totalTradingVolume: number;
  totalTrades: number;
}

interface LeaderboardResponse {
  status: boolean;
  data: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function getReferralLeaderboard(
  limit: number = 50,
  offset: number = 0,
): Promise<LeaderboardResponse> {
  try {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/referral/leaderboard?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = buildErrorMessage(
        response.status,
        response.statusText,
        payload,
        "Failed to fetch leaderboard",
      );
      throw new Error(message);
    }

    const payload = (await response.json()) as LeaderboardResponse;

    if (!payload?.status) {
      throw new Error("Unexpected response format while fetching leaderboard");
    }

    return payload;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    throw error;
  }
}

